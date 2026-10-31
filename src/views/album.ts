import { store } from '../store';
import type { AlbumPhoto, ClassGroup, ClassSession, Student } from '../types';
import {
  closeModal,
  escapeHtml,
  formatDateDM,
  formatDateDMY,
  generateId,
  getInitials,
  getVietDayFull,
  getVietDayShort,
  openModal,
  showToast,
} from '../utils';
import { openCreateSessionModal, openEditSessionModal } from './scheduler';

let selectedAlbumClassKey = 'tieng anh 2';
let selectedAlbumSessionId: string | null = null; // null = Class Overview (all session albums of class)
let albumSidebarSearch = '';
let albumPhotoSearch = '';
let albumStudentFilter = 'all';
let albumMonthFilterMode: 'selected' | 'all' = 'all';
let isPhotoSelectionMode = false;
const selectedPhotoIds = new Set<string>();
const collapsedAlbumClasses = new Set<string>();
let activeLightboxPhotoId: string | null = null;
let isSyncingDrive = false;

export const DEFAULT_DRIVE_ROOT_FOLDER_ID = '1Wvv1jQdaizAOwTc9LZ9JEutwbLj1FQeN';
export const DEFAULT_DRIVE_ROOT_FOLDER_URL =
  'https://drive.google.com/drive/folders/1Wvv1jQdaizAOwTc9LZ9JEutwbLj1FQeN';

// Ready-to-copy Google Apps Script code for the user's personal Google Drive
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * NTTCLASS - GOOGLE DRIVE DATABASE & ALBUM BRIDGE
 * Thư mục gốc cố định: https://drive.google.com/drive/folders/1Wvv1jQdaizAOwTc9LZ9JEutwbLj1FQeN
 * Cấu trúc lưu trữ bắt buộc: [Thư mục gốc] > [Lớp học] > [Buổi học]
 *
 * Hướng dẫn sử dụng (Chỉ mất 1 phút):
 * 1. Mở https://script.google.com -> Bấm "Dự án mới" (New project)
 * 2. Xóa mã mặc định và dán toàn bộ đoạn mã này vào -> Bấm biểu tượng Đĩa mềm (Lưu / Ctrl+S)
 * 3. Bấm nút "Triển khai" (Deploy) ở góc trên bên phải -> "Tạo mục triển khai mới" (New deployment)
 * 4. Chọn loại: "Ứng dụng web" (Web app)
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
 * 5. Bấm "Triển khai" (Deploy) -> Cấp quyền truy cập Google Drive -> Copy URL Web App dán vào NTTCLASS!
 */

const DEFAULT_ROOT_FOLDER_ID = '1Wvv1jQdaizAOwTc9LZ9JEutwbLj1FQeN';
const DB_FILE_NAME = 'nttclass_albums_db.json';

/**
 * Luôn lấy đúng thư mục gốc 1Wvv1jQdaizAOwTc9LZ9JEutwbLj1FQeN làm gốc duy nhất.
 * Mọi thư mục [Lớp học] > [Buổi học] và file database đều nằm bên trong thư mục gốc này.
 */
function getRootFolder(customFolderId) {
  const folderId = String(customFolderId || DEFAULT_ROOT_FOLDER_ID).trim() || DEFAULT_ROOT_FOLDER_ID;
  return DriveApp.getFolderById(folderId);
}

/**
 * Chỉ tìm hoặc tạo thư mục con trực tiếp bên trong parentFolder ([Thư mục gốc] > [Lớp học] > [Buổi học])
 */
function getOrCreateSubFolder(parentFolder, subName) {
  const cleanName = String(subName || 'Chua-dat-ten').replace(/[\\\\/:*?"<>|]/g, '-').trim();
  const iter = parentFolder.getFoldersByName(cleanName);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(cleanName);
}

function ensureHierarchyFolders(rootFolder, hierarchy) {
  const classFolderMap = {};
  const sessionFolderMap = {};
  if (!Array.isArray(hierarchy)) {
    return { classFolderMap: classFolderMap, sessionFolderMap: sessionFolderMap };
  }
  for (var i = 0; i < hierarchy.length; i++) {
    var cls = hierarchy[i];
    if (!cls || !cls.className) continue;
    // Cấp 1 (trong Thư mục gốc): [Lớp học]
    var classFolder = getOrCreateSubFolder(rootFolder, cls.className);
    classFolderMap[String(cls.classKey || cls.className).toLowerCase()] = {
      id: classFolder.getId(),
      url: classFolder.getUrl(),
      name: classFolder.getName()
    };
    // Cấp 2 (trong Lớp học): [Buổi học]
    var sessions = Array.isArray(cls.sessions) ? cls.sessions : [];
    for (var j = 0; j < sessions.length; j++) {
      var sess = sessions[j];
      if (!sess || !sess.sessionFolderName) continue;
      var sessionFolder = getOrCreateSubFolder(classFolder, sess.sessionFolderName);
      sessionFolderMap[sess.sessionId] = {
        id: sessionFolder.getId(),
        url: sessionFolder.getUrl(),
        name: sessionFolder.getName(),
        classFolderId: classFolder.getId()
      };
    }
  }
  return { classFolderMap: classFolderMap, sessionFolderMap: sessionFolderMap };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var rootFolder = getRootFolder(DEFAULT_ROOT_FOLDER_ID);
  return jsonResponse({
    ok: true,
    service: 'NTTCLASS Google Drive Database',
    rootFolderId: rootFolder.getId(),
    rootFolderName: rootFolder.getName(),
    rootFolderUrl: rootFolder.getUrl(),
    hierarchyRule: '[Thư mục gốc] > [Lớp học] > [Buổi học]'
  });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    const action = payload.action || 'ping';
    const rootFolder = getRootFolder(payload.rootFolderId);

    if (action === 'ping') {
      return jsonResponse({
        ok: true,
        email: Session.getActiveUser().getEmail() || '',
        rootFolderId: rootFolder.getId(),
        rootFolderName: rootFolder.getName(),
        rootFolderUrl: rootFolder.getUrl()
      });
    }

    if (action === 'save_db') {
      // Đảm bảo toàn bộ cây thư mục [Thư mục gốc] > [Lớp học] > [Buổi học] được tạo trong folder gốc
      const syncedTree = ensureHierarchyFolders(rootFolder, payload.hierarchy || []);

      const dbContent = JSON.stringify(payload.db || {}, null, 2);
      const files = rootFolder.getFilesByName(DB_FILE_NAME);
      let file;
      if (files.hasNext()) {
        file = files.next();
        file.setContent(dbContent);
      } else {
        file = rootFolder.createFile(DB_FILE_NAME, dbContent, MimeType.PLAIN_TEXT);
      }
      return jsonResponse({
        ok: true,
        dbFileId: file.getId(),
        rootFolderId: rootFolder.getId(),
        rootFolderName: rootFolder.getName(),
        rootFolderUrl: rootFolder.getUrl(),
        classFolderMap: syncedTree.classFolderMap,
        sessionFolderMap: syncedTree.sessionFolderMap,
        updatedAt: new Date().toISOString()
      });
    }

    if (action === 'load_db') {
      if (Array.isArray(payload.hierarchy) && payload.hierarchy.length > 0) {
        ensureHierarchyFolders(rootFolder, payload.hierarchy);
      }

      let db = null;
      const files = rootFolder.getFilesByName(DB_FILE_NAME);
      if (files.hasNext()) {
        const raw = files.next().getBlob().getDataAsString('UTF-8');
        try { db = JSON.parse(raw); } catch (err) {}
      }

      // Quét cấu trúc [Thư mục gốc] > [Lớp học] > [Buổi học] trực tiếp bên trong folder gốc
      const scannedFolders = [];
      const classFolders = rootFolder.getFolders();
      while (classFolders.hasNext()) {
        const cf = classFolders.next();
        const sessFolders = cf.getFolders();
        while (sessFolders.hasNext()) {
          const sf = sessFolders.next();
          const photos = [];
          const fileIter = sf.getFiles();
          while (fileIter.hasNext()) {
            const f = fileIter.next();
            const mime = f.getMimeType() || '';
            if (mime.indexOf('image/') === 0) {
              const fid = f.getId();
              photos.push({
                driveFileId: fid,
                name: f.getName(),
                mimeType: mime,
                driveWebViewLink: f.getUrl(),
                driveThumbnailUrl: 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w1600',
                createdAt: f.getDateCreated().toISOString()
              });
            }
          }
          scannedFolders.push({
            className: cf.getName(),
            classFolderId: cf.getId(),
            classFolderUrl: cf.getUrl(),
            sessionFolderName: sf.getName(),
            sessionFolderId: sf.getId(),
            sessionFolderUrl: sf.getUrl(),
            photos: photos
          });
        }
      }

      return jsonResponse({
        ok: true,
        rootFolderId: rootFolder.getId(),
        rootFolderName: rootFolder.getName(),
        rootFolderUrl: rootFolder.getUrl(),
        db: db,
        scannedFolders: scannedFolders
      });
    }

    if (action === 'upload_photo') {
      // Bắt buộc tạo theo đúng thứ tự: [Thư mục gốc] > [Lớp học] > [Buổi học]
      const classFolder = getOrCreateSubFolder(rootFolder, payload.className || 'Lop-hoc');
      const sessionFolder = getOrCreateSubFolder(classFolder, payload.sessionFolderName || 'Buoi-hoc');
      const base64 = String(payload.base64Data || '').replace(/^data:[^;]+;base64,/, '');
      const bytes = Utilities.base64Decode(base64);
      const blob = Utilities.newBlob(
        bytes,
        payload.mimeType || 'image/jpeg',
        payload.fileName || ('photo_' + Date.now() + '.jpg')
      );
      const file = sessionFolder.createFile(blob);
      if (payload.caption) {
        file.setDescription(payload.caption);
      }
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {}
      const fid = file.getId();
      return jsonResponse({
        ok: true,
        driveFileId: fid,
        driveWebViewLink: file.getUrl(),
        driveThumbnailUrl: 'https://drive.google.com/thumbnail?id=' + fid + '&sz=w1600',
        rootFolderId: rootFolder.getId(),
        classFolderId: classFolder.getId(),
        sessionFolderId: sessionFolder.getId(),
        sessionFolderUrl: sessionFolder.getUrl()
      });
    }

    if (action === 'delete_photo') {
      if (payload.driveFileId) {
        try {
          DriveApp.getFileById(payload.driveFileId).setTrashed(true);
        } catch (delErr) {}
      }
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}`;

function ensureValidAlbumSelection(): {
  activeClass: ClassGroup | undefined;
  classSessions: ClassSession[];
  activeSession: ClassSession | undefined;
} {
  const state = store.getState();
  let cls = store.getClassByKey(selectedAlbumClassKey);
  if (!cls && state.classes.length > 0) {
    cls = state.classes[0];
    selectedAlbumClassKey = cls.id;
  }

  const classSessions = cls
    ? state.sessions
        .filter((s) => {
          if (s.classKey.toLowerCase() !== cls!.id.toLowerCase()) return false;
          if (albumMonthFilterMode === 'selected' && state.selectedMonth) {
            return s.date.startsWith(state.selectedMonth);
          }
          return true;
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    : [];

  let activeSession: ClassSession | undefined;
  if (selectedAlbumSessionId) {
    activeSession = classSessions.find((s) => s.id === selectedAlbumSessionId);
    if (!activeSession) {
      // Check if session exists in full list (outside month filter)
      activeSession = state.sessions.find((s) => s.id === selectedAlbumSessionId);
    }
  }

  return { activeClass: cls, classSessions, activeSession };
}

export function getPhotoDisplayUrl(photo: AlbumPhoto): string {
  if (photo.dataUrl) return photo.dataUrl;
  if (photo.driveThumbnailUrl) return photo.driveThumbnailUrl;
  if (photo.driveFileId) {
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(photo.driveFileId)}&sz=w1600`;
  }
  return '';
}

export function extractDriveFileIdFromUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  // Match /file/d/<ID> or /folders/<ID> or id=<ID>
  const m1 = trimmed.match(/\/(?:file\/d|folders|open\?id=|uc\?id=|thumbnail\?id=)([a-zA-Z0-9_-]{15,})/);
  if (m1 && m1[1]) return m1[1];
  const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  if (m2 && m2[1]) return m2[1];
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) return trimmed;
  return null;
}

function getSessionFolderName(session: ClassSession, sessionIndex: number): string {
  const titlePart = (session.lessonTitle || session.content || `Buổi ${sessionIndex + 1}`)
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 50)
    .trim();
  return `${session.date} - Buổi ${sessionIndex + 1} - ${titlePart}`;
}

export function isDriveConnected(): boolean {
  const cfg = store.getState().driveConfig;
  if (!cfg) return false;
  if (cfg.mode === 'apps_script' && cfg.scriptWebAppUrl.trim().startsWith('https://script.google.com/')) {
    return true;
  }
  if (cfg.mode === 'oauth' && cfg.oauthAccessToken.trim().length > 15) {
    return true;
  }
  return false;
}

// --- Google Drive API & Apps Script Bridge ---

async function callAppsScriptBridge(payload: Record<string, unknown>): Promise<any> {
  const cfg = store.getState().driveConfig;
  const url = cfg.scriptWebAppUrl.trim();
  if (!url) throw new Error('Chưa nhập URL Google Apps Script Web App.');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      // text/plain avoids CORS OPTIONS preflight failure on script.google.com
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      rootFolderId: cfg.rootFolderId.trim() || DEFAULT_DRIVE_ROOT_FOLDER_ID,
      ...payload,
    }),
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: Không thể kết nối tới Apps Script.`);
  }
  const data = await response.json();
  if (!data || data.ok === false) {
    throw new Error(data?.error || 'Lỗi từ Google Apps Script.');
  }
  return data;
}

async function oauthEnsureFolder(name: string, parentId?: string): Promise<{ id: string; webViewLink: string }> {
  const token = store.getState().driveConfig.oauthAccessToken.trim();
  const escapedName = name.replace(/'/g, "\\'");
  let q = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=files(id,name,webViewLink)&pageSize=1`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!searchRes.ok) {
    throw new Error(`Google Drive API lỗi (${searchRes.status}). Kiểm tra lại Access Token.`);
  }
  const searchJson = await searchRes.json();
  if (searchJson.files && searchJson.files.length > 0) {
    return {
      id: searchJson.files[0].id,
      webViewLink:
        searchJson.files[0].webViewLink ||
        `https://drive.google.com/drive/folders/${searchJson.files[0].id}`,
    };
  }

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined,
      }),
    }
  );
  if (!createRes.ok) {
    throw new Error(`Không thể tạo thư mục trên Google Drive (${createRes.status}).`);
  }
  const created = await createRes.json();
  return {
    id: created.id,
    webViewLink: created.webViewLink || `https://drive.google.com/drive/folders/${created.id}`,
  };
}

async function oauthUploadPhotoToDrive(
  className: string,
  sessionFolderName: string,
  photo: AlbumPhoto
): Promise<{
  driveFileId: string;
  driveWebViewLink: string;
  driveThumbnailUrl: string;
  classFolderId: string;
  sessionFolderId: string;
  sessionFolderUrl: string;
}> {
  const cfg = store.getState().driveConfig;
  const token = cfg.oauthAccessToken.trim();
  const rootId = cfg.rootFolderId.trim() || DEFAULT_DRIVE_ROOT_FOLDER_ID;
  const rootFolder = {
    id: rootId,
    webViewLink: `https://drive.google.com/drive/folders/${rootId}`,
  };

  // Strict hierarchy: [Thư mục gốc] > [Lớp học] > [Buổi học]
  const classFolder = await oauthEnsureFolder(className, rootFolder.id);
  const sessionFolder = await oauthEnsureFolder(sessionFolderName, classFolder.id);

  const rawDataUrl = photo.dataUrl || '';
  const base64Part = rawDataUrl.includes(',') ? rawDataUrl.split(',')[1] : '';
  const metadata = {
    name: photo.name || `photo_${Date.now()}.jpg`,
    description: photo.caption || '',
    parents: [sessionFolder.id],
  };

  const boundary = '-------nttclass_drive_multipart_' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;
  const multipartBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    `Content-Type: ${photo.mimeType || 'image/jpeg'}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64Part +
    closeDelim;

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,thumbnailLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  if (!uploadRes.ok) {
    throw new Error(`Upload ảnh lên Google Drive thất bại (${uploadRes.status}).`);
  }
  const uploaded = await uploadRes.json();
  const fid = uploaded.id;

  return {
    driveFileId: fid,
    driveWebViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${fid}/view`,
    driveThumbnailUrl: `https://drive.google.com/thumbnail?id=${fid}&sz=w1600`,
    classFolderId: classFolder.id,
    sessionFolderId: sessionFolder.id,
    sessionFolderUrl: sessionFolder.webViewLink,
  };
}

async function oauthSaveDbJson(): Promise<void> {
  const state = store.getState();
  const cfg = state.driveConfig;
  const token = cfg.oauthAccessToken.trim();
  if (!token) return;

  const rootId = cfg.rootFolderId.trim() || DEFAULT_DRIVE_ROOT_FOLDER_ID;
  const rootFolder = { id: rootId };

  // Ensure [Thư mục gốc] > [Lớp học] > [Buổi học] folders exist in OAuth mode as well
  for (const cls of state.classes) {
    const cf = await oauthEnsureFolder(cls.name, rootFolder.id);
    const clsSessions = state.sessions
      .filter((s) => s.classKey.toLowerCase() === cls.id.toLowerCase())
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    for (let idx = 0; idx < clsSessions.length; idx++) {
      await oauthEnsureFolder(getSessionFolderName(clsSessions[idx], idx), cf.id);
    }
  }

  const q = `name='nttclass_albums_db.json' and '${rootFolder.id}' in parents and trashed=false`;
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchJson = await searchRes.json();
  const existingId = searchJson.files?.[0]?.id;

  // Prepare light DB payload (strip huge local base64 for already synced photos)
  const dbPayload = buildDriveDatabasePayload();
  const jsonText = JSON.stringify(dbPayload, null, 2);

  if (existingId) {
    await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonText,
      }
    );
  } else {
    const boundary = '-------nttclass_db_' + Date.now();
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({
        name: 'nttclass_albums_db.json',
        mimeType: 'application/json',
        parents: [rootFolder.id],
      }) +
      `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      jsonText +
      `\r\n--${boundary}--`;

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
  }
}

function buildDriveDatabasePayload() {
  const state = store.getState();
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    rootFolderId: state.driveConfig.rootFolderId || DEFAULT_DRIVE_ROOT_FOLDER_ID,
    hierarchyRule: '[Thư mục gốc] > [Lớp học] > [Buổi học]',
    teacher: state.profile.displayName,
    sessionAlbums: state.sessionAlbums,
    albums: state.albums.map((p) => ({
      ...p,
      // If already synced to Google Drive, we don't need to duplicate heavy base64 inside the JSON index
      dataUrl: p.driveFileId && p.dataUrl && p.dataUrl.length > 40000 ? undefined : p.dataUrl,
    })),
  };
}

function buildDriveHierarchyPayload() {
  const state = store.getState();
  return state.classes.map((cls) => {
    const clsSessions = state.sessions
      .filter((s) => s.classKey.toLowerCase() === cls.id.toLowerCase())
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return {
      classKey: cls.id,
      className: cls.name,
      sessions: clsSessions.map((sess, idx) => ({
        sessionId: sess.id,
        sessionFolderName: getSessionFolderName(sess, idx),
      })),
    };
  });
}

export async function uploadSinglePhotoToDrive(photoId: string, silent = false): Promise<boolean> {
  if (!isDriveConnected()) {
    if (!silent) {
      showToast('Vui lòng cấu hình kết nối Google Drive trước khi đẩy ảnh lên.', 'error');
      openModal('albumDriveConfigModal');
    }
    return false;
  }

  const state = store.getState();
  const photo = state.albums.find((p) => p.id === photoId);
  if (!photo) return false;
  if (photo.syncStatus === 'synced' && photo.driveFileId) return true;
  if (!photo.dataUrl || !photo.dataUrl.startsWith('data:')) {
    return false;
  }

  const cls = store.getClassByKey(photo.classKey);
  const className = cls ? cls.name : photo.classKey;
  const classSessions = state.sessions
    .filter((s) => s.classKey.toLowerCase() === photo.classKey.toLowerCase())
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const sessIdx = classSessions.findIndex((s) => s.id === photo.sessionId);
  const sess = sessIdx >= 0 ? classSessions[sessIdx] : undefined;
  const sessionFolderName = sess
    ? getSessionFolderName(sess, sessIdx)
    : `Buoi-hoc-${photo.sessionId}`;

  try {
    let result: {
      driveFileId: string;
      driveWebViewLink: string;
      driveThumbnailUrl: string;
      classFolderId: string;
      sessionFolderId: string;
      sessionFolderUrl: string;
    };

    if (state.driveConfig.mode === 'apps_script') {
      result = await callAppsScriptBridge({
        action: 'upload_photo',
        classKey: photo.classKey,
        className,
        sessionId: photo.sessionId,
        sessionFolderName,
        fileName: photo.name,
        mimeType: photo.mimeType,
        base64Data: photo.dataUrl,
        caption: photo.caption,
        studentIds: photo.studentIds,
      });
    } else {
      result = await oauthUploadPhotoToDrive(className, sessionFolderName, photo);
    }

    store.update((draft) => {
      const target = draft.albums.find((p) => p.id === photoId);
      if (target) {
        target.driveFileId = result.driveFileId;
        target.driveWebViewLink = result.driveWebViewLink;
        target.driveThumbnailUrl = result.driveThumbnailUrl;
        target.syncStatus = 'synced';
      }
      if (result.classFolderId) {
        draft.driveConfig.classFolderIds[photo.classKey.toLowerCase()] = result.classFolderId;
      }
      if (result.sessionFolderId) {
        const prevMeta = draft.sessionAlbums[photo.sessionId] || {
          sessionId: photo.sessionId,
          classKey: photo.classKey,
        };
        draft.sessionAlbums[photo.sessionId] = {
          ...prevMeta,
          driveFolderId: result.sessionFolderId,
          driveFolderUrl: result.sessionFolderUrl,
        };
      }
      draft.driveConfig.lastSyncedAt = new Date().toISOString();
    });

    if (!silent) {
      showToast(`Đã lưu ảnh "${photo.name}" lên Google Drive!`);
    }
    return true;
  } catch (err: any) {
    if (!silent) {
      showToast(`Lỗi tải lên Google Drive: ${err?.message || err}`, 'error');
    }
    return false;
  }
}

export async function syncAllAlbumsWithGoogleDrive(): Promise<void> {
  if (!isDriveConnected()) {
    showToast('Hãy kết nối Google Drive của bạn để đồng bộ dữ liệu.', 'error');
    openModal('albumDriveConfigModal');
    return;
  }
  if (isSyncingDrive) return;
  isSyncingDrive = true;
  renderAlbumView();

  try {
    const state = store.getState();
    const localPhotos = state.albums.filter(
      (p) => p.syncStatus === 'local' && p.dataUrl && p.dataUrl.startsWith('data:')
    );

    let uploadedCount = 0;
    for (const p of localPhotos) {
      const ok = await uploadSinglePhotoToDrive(p.id, true);
      if (ok) uploadedCount++;
    }

    if (state.driveConfig.mode === 'apps_script') {
      // Pull existing DB and scanned folders from Drive (and ensure hierarchy folders exist)
      const loadRes = await callAppsScriptBridge({
        action: 'load_db',
        hierarchy: buildDriveHierarchyPayload(),
      });

      store.update((draft) => {
        if (loadRes.rootFolderId && !draft.driveConfig.rootFolderId) {
          draft.driveConfig.rootFolderId = loadRes.rootFolderId;
        }
        if (loadRes.rootFolderName) {
          draft.driveConfig.rootFolderName = loadRes.rootFolderName;
        }

        // Merge remote db.albums if any
        if (loadRes.db && Array.isArray(loadRes.db.albums)) {
          const existingIds = new Set(draft.albums.map((a) => a.id));
          const existingDriveIds = new Set(
            draft.albums.map((a) => a.driveFileId).filter(Boolean)
          );
          for (const remotePhoto of loadRes.db.albums as AlbumPhoto[]) {
            if (
              !existingIds.has(remotePhoto.id) &&
              (!remotePhoto.driveFileId || !existingDriveIds.has(remotePhoto.driveFileId))
            ) {
              draft.albums.push(remotePhoto);
            }
          }
        }
        if (loadRes.db && loadRes.db.sessionAlbums) {
          draft.sessionAlbums = {
            ...loadRes.db.sessionAlbums,
            ...draft.sessionAlbums,
          };
        }

        // Also match any photos dropped directly into Google Drive folders!
        if (Array.isArray(loadRes.scannedFolders)) {
          for (const folder of loadRes.scannedFolders) {
            const matchedClass = draft.classes.find(
              (c) =>
                c.name.toLowerCase() === String(folder.className || '').toLowerCase() ||
                c.id.toLowerCase() === String(folder.className || '').toLowerCase()
            );
            if (!matchedClass) continue;
            if (folder.classFolderId) {
              draft.driveConfig.classFolderIds[matchedClass.id.toLowerCase()] = folder.classFolderId;
            }

            // Match session by date prefix (YYYY-MM-DD) or session title
            const sfName = String(folder.sessionFolderName || '');
            const dateMatch = sfName.match(/^(\d{4}-\d{2}-\d{2})/);
            const matchedSession = draft.sessions.find(
              (s) =>
                s.classKey.toLowerCase() === matchedClass.id.toLowerCase() &&
                ((dateMatch && s.date === dateMatch[1]) ||
                  sfName.toLowerCase().includes(s.id.toLowerCase()))
            );
            if (!matchedSession) continue;

            const prevMeta = draft.sessionAlbums[matchedSession.id] || {
              sessionId: matchedSession.id,
              classKey: matchedClass.id,
            };
            draft.sessionAlbums[matchedSession.id] = {
              ...prevMeta,
              driveFolderId: folder.sessionFolderId,
              driveFolderUrl: folder.sessionFolderUrl,
            };

            const existingDriveFileIds = new Set(
              draft.albums.map((a) => a.driveFileId).filter(Boolean)
            );
            for (const fPhoto of folder.photos || []) {
              if (fPhoto.driveFileId && !existingDriveFileIds.has(fPhoto.driveFileId)) {
                draft.albums.push({
                  id: generateId('photo_drive'),
                  classKey: matchedClass.id,
                  sessionId: matchedSession.id,
                  name: fPhoto.name || 'Drive Photo',
                  caption: '',
                  studentIds: [...matchedSession.studentIds],
                  driveFileId: fPhoto.driveFileId,
                  driveWebViewLink: fPhoto.driveWebViewLink,
                  driveThumbnailUrl: fPhoto.driveThumbnailUrl,
                  mimeType: fPhoto.mimeType || 'image/jpeg',
                  createdAt: fPhoto.createdAt || new Date().toISOString(),
                  syncStatus: 'synced',
                });
                existingDriveFileIds.add(fPhoto.driveFileId);
              }
            }
          }
        }
        draft.driveConfig.lastSyncedAt = new Date().toISOString();
      });

      // Save updated merged DB JSON and sync [Thư mục gốc] > [Lớp học] > [Buổi học] back to Google Drive
      const saveRes = await callAppsScriptBridge({
        action: 'save_db',
        db: buildDriveDatabasePayload(),
        hierarchy: buildDriveHierarchyPayload(),
      });

      if (saveRes && (saveRes.classFolderMap || saveRes.sessionFolderMap)) {
        store.update((draft) => {
          if (saveRes.classFolderMap) {
            for (const [cKey, info] of Object.entries<any>(saveRes.classFolderMap)) {
              if (info?.id) draft.driveConfig.classFolderIds[cKey.toLowerCase()] = info.id;
            }
          }
          if (saveRes.sessionFolderMap) {
            for (const [sId, info] of Object.entries<any>(saveRes.sessionFolderMap)) {
              if (info?.id) {
                const prev = draft.sessionAlbums[sId] || {
                  sessionId: sId,
                  classKey: selectedAlbumClassKey,
                };
                draft.sessionAlbums[sId] = {
                  ...prev,
                  driveFolderId: info.id,
                  driveFolderUrl: info.url,
                };
              }
            }
          }
        });
      }
    } else {
      await oauthSaveDbJson();
      store.update((draft) => {
        draft.driveConfig.lastSyncedAt = new Date().toISOString();
      });
    }

    showToast(
      uploadedCount > 0
        ? `Đồng bộ Google Drive thành công (Đã tải lên ${uploadedCount} ảnh mới & lưu Database)!`
        : 'Đã đồng bộ dữ liệu Album với Google Drive của bạn!'
    );
  } catch (err: any) {
    showToast(`Đồng bộ Google Drive thất bại: ${err?.message || err}`, 'error');
  } finally {
    isSyncingDrive = false;
    renderAlbumView();
  }
}

// --- Image File Reader & Compressor ---

function readAndOptimizeImageFile(file: File, maxDimension = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDimension && height <= maxDimension && file.size < 600 * 1024) {
          resolve(dataUrl);
          return;
        }
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

// --- Main Render Function for #view-album ---

export function renderAlbumView(): void {
  const root = document.getElementById('albumViewRoot');
  if (!root) return;

  const state = store.getState();
  const { activeClass, classSessions, activeSession } = ensureValidAlbumSelection();
  const connected = isDriveConnected();
  const cfg = state.driveConfig;

  // 1. Render Left Sidebar (Drive status + Search + Class & Session Tree)
  const driveStatusEl = document.getElementById('albumDriveStatusCard');
  if (driveStatusEl) {
    const syncedCount = state.albums.filter((p) => p.syncStatus === 'synced' || p.driveFileId).length;
    const totalCount = state.albums.length;
    const lastSyncText = cfg.lastSyncedAt
      ? `Đồng bộ: ${new Date(cfg.lastSyncedAt).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
        })} ${formatDateDMY(cfg.lastSyncedAt.slice(0, 10))}`
      : 'Lưu tự động trên trình duyệt';

    driveStatusEl.innerHTML = `
      <div class="album-drive-status-top">
        <span class="album-drive-dot ${connected ? 'is-online' : 'is-local'}" aria-hidden="true"></span>
        <div class="album-drive-status-copy">
          <strong>${connected ? 'Google Drive đã kết nối' : 'Chế độ Lưu cục bộ / Drive'}</strong>
          <small>${
            connected
              ? escapeHtml(cfg.connectedEmail || `Thư mục: ${cfg.rootFolderName || 'NTTCLASS_ALBUMS'}`)
              : 'Kết nối Google Drive cá nhân để làm Database'
          }</small>
        </div>
      </div>
      <div class="album-drive-meta-row">
        <span>☁️ Đã đồng bộ: <b>${syncedCount}/${totalCount} ảnh</b></span>
        <span>${escapeHtml(lastSyncText)}</span>
      </div>
      <div class="album-drive-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-album-action="open-drive-config">
          ⚙️ ${connected ? 'Cấu hình Drive' : 'Kết nối Google Drive'}
        </button>
        <button type="button" class="btn btn-primary btn-sm" data-album-action="sync-drive" ${
          isSyncingDrive ? 'disabled' : ''
        }>
          ${isSyncingDrive ? '⏳ Đang đồng bộ...' : '🔄 Đồng bộ Drive'}
        </button>
      </div>
    `;
  }

  // Month filter mode toggle buttons in sidebar
  root.querySelectorAll<HTMLElement>('[data-album-month-mode]').forEach((btn) => {
    const mode = btn.dataset.albumMonthMode;
    btn.classList.toggle('is-active', mode === albumMonthFilterMode);
  });

  // Render Class & Session Roster Tree
  const rosterEl = document.getElementById('albumClassRoster');
  if (rosterEl) {
    const q = albumSidebarSearch.trim().toLowerCase();

    rosterEl.innerHTML = state.classes
      .map((cls, cIdx) => {
        const allClsSessions = state.sessions
          .filter((s) => {
            if (s.classKey.toLowerCase() !== cls.id.toLowerCase()) return false;
            if (albumMonthFilterMode === 'selected' && state.selectedMonth) {
              return s.date.startsWith(state.selectedMonth);
            }
            return true;
          })
          .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

        const filteredSessions = q
          ? allClsSessions.filter(
              (s, idx) =>
                cls.name.toLowerCase().includes(q) ||
                s.date.includes(q) ||
                formatDateDMY(s.date).includes(q) ||
                (s.lessonTitle || '').toLowerCase().includes(q) ||
                (s.content || '').toLowerCase().includes(q) ||
                `buổi ${idx + 1}`.includes(q)
            )
          : allClsSessions;

        if (q && filteredSessions.length === 0 && !cls.name.toLowerCase().includes(q)) {
          return '';
        }

        const clsPhotosCount = state.albums.filter(
          (p) => p.classKey.toLowerCase() === cls.id.toLowerCase()
        ).length;
        const isClassSelected =
          activeClass?.id.toLowerCase() === cls.id.toLowerCase() && !selectedAlbumSessionId;
        const isCollapsed = collapsedAlbumClasses.has(cls.id.toLowerCase());

        const sessionItemsHtml = filteredSessions
          .map((sess) => {
            const trueIdx = allClsSessions.findIndex((x) => x.id === sess.id);
            const sessPhotoCount = state.albums.filter((p) => p.sessionId === sess.id).length;
            const isSessSelected = selectedAlbumSessionId === sess.id;
            return `<button type="button" class="sv2-student-select album-session-nav-item ${
              isSessSelected ? 'is-selected' : ''
            }" data-album-select-session="${escapeHtml(sess.id)}" data-album-class="${escapeHtml(
              cls.id
            )}">
              <span class="sv2-avatar album-session-badge" aria-hidden="true">B${trueIdx + 1}</span>
              <span class="album-session-nav-copy">
                <strong>Buổi ${trueIdx + 1} • ${escapeHtml(formatDateDM(sess.date))}</strong>
                <small>${escapeHtml(sess.lessonTitle || sess.content || `${sess.startTime}-${sess.endTime}`)}</small>
              </span>
              <span class="album-photo-count-pill ${sessPhotoCount > 0 ? 'has-photos' : ''}">${sessPhotoCount} ảnh</span>
            </button>`;
          })
          .join('');

        return `<section class="sv2-roster-group album-roster-group" style="--student-group-accent:${escapeHtml(
          cls.color || '#B0E0FF'
        )}">
          <div class="sv2-class-row ${isClassSelected ? 'is-selected' : ''}">
            <button type="button" class="sv2-class-select" data-album-select-class="${escapeHtml(
              cls.id
            )}" aria-pressed="${isClassSelected}">
              <span class="sv2-swatch student-grade-color-dot" aria-hidden="true"></span>
              <span class="sv2-roster-copy">
                <strong>${escapeHtml(cls.name)}</strong>
                <small>${allClsSessions.length} buổi học • ${clsPhotosCount} ảnh</small>
              </span>
            </button>
            <button type="button" class="sv2-class-toggle" data-album-toggle-class="${escapeHtml(
              cls.id
            )}" aria-expanded="${!isCollapsed}" aria-controls="albumRosterGroup${cIdx}">
              <svg class="sv2-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>
            </button>
          </div>
          <div class="sv2-children" id="albumRosterGroup${cIdx}" ${isCollapsed ? 'hidden' : ''}>
            ${
              sessionItemsHtml ||
              `<div style="padding:8px 10px;font-size:11.5px;color:var(--text-muted)">Chưa có buổi học nào.</div>`
            }
            <button type="button" class="album-add-session-inline-btn" data-album-action="create-session" data-class-key="${escapeHtml(
              cls.id
            )}">+ Thêm buổi học mới</button>
          </div>
        </section>`;
      })
      .join('');
  }

  // 2. Render Right Main Area
  const mainContainer = document.getElementById('albumMainContent');
  if (!mainContainer) return;

  if (!activeClass) {
    mainContainer.innerHTML = `<div class="glass-card" style="padding:40px;text-align:center">
      <h3>Chưa có lớp học nào</h3>
      <p style="color:var(--text-muted);margin:8px 0 16px">Hãy tạo lớp học trước để quản lý Album theo lớp và từng buổi học.</p>
    </div>`;
    return;
  }

  if (!activeSession) {
    renderClassAlbumsOverview(mainContainer, activeClass, classSessions);
  } else {
    renderSessionAlbumDetail(mainContainer, activeClass, classSessions, activeSession);
  }
}

function renderClassAlbumsOverview(
  container: HTMLElement,
  activeClass: ClassGroup,
  classSessions: ClassSession[]
): void {
  const state = store.getState();
  const classPhotos = state.albums.filter(
    (p) => p.classKey.toLowerCase() === activeClass.id.toLowerCase()
  );
  const syncedPhotos = classPhotos.filter((p) => p.syncStatus === 'synced' || p.driveFileId).length;
  const classDriveFolderId = state.driveConfig.classFolderIds[activeClass.id.toLowerCase()];
  const rootId = state.driveConfig.rootFolderId || DEFAULT_DRIVE_ROOT_FOLDER_ID;
  const classDriveUrl = classDriveFolderId
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(classDriveFolderId)}`
    : `https://drive.google.com/drive/folders/${encodeURIComponent(rootId)}`;

  const sessionCardsHtml = classSessions
    .map((sess, idx) => {
      const sessPhotos = state.albums.filter((p) => p.sessionId === sess.id);
      const sessMeta = state.sessionAlbums[sess.id];
      const coverPhotos = sessPhotos.slice(0, 4);

      let collageHtml = '';
      if (coverPhotos.length === 0) {
        collageHtml = `<div class="album-session-cover-empty">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 15-5-5L5 20"/></svg>
          <span>Chưa có ảnh trong buổi học này</span>
        </div>`;
      } else if (coverPhotos.length === 1) {
        collageHtml = `<div class="album-session-cover-grid count-1">
          <img src="${escapeHtml(getPhotoDisplayUrl(coverPhotos[0]))}" alt="${escapeHtml(
          coverPhotos[0].name
        )}" loading="lazy">
        </div>`;
      } else {
        collageHtml = `<div class="album-session-cover-grid count-${coverPhotos.length}">
          ${coverPhotos
            .map(
              (cp) =>
                `<img src="${escapeHtml(getPhotoDisplayUrl(cp))}" alt="${escapeHtml(
                  cp.name
                )}" loading="lazy">`
            )
            .join('')}
        </div>`;
      }

      const syncedInSess = sessPhotos.filter((p) => p.syncStatus === 'synced' || p.driveFileId).length;

      return `<article class="glass-card album-session-card" data-album-open-session="${escapeHtml(
        sess.id
      )}">
        <div class="album-session-cover">
          ${collageHtml}
          <div class="album-session-cover-badges">
            <span class="album-badge-primary">Buổi ${idx + 1}</span>
            <span class="album-badge-dark">${sessPhotos.length} ảnh</span>
          </div>
          ${
            sessMeta?.driveFolderUrl || syncedInSess > 0
              ? `<span class="album-badge-drive" title="Đã lưu trên Google Drive">☁️ Drive</span>`
              : ''
          }
        </div>
        <div class="album-session-body">
          <div class="album-session-date-row">
            <strong>${escapeHtml(getVietDayFull(sess.date))}, ${escapeHtml(
        formatDateDMY(sess.date)
      )}</strong>
            <span>${escapeHtml(sess.startTime)} - ${escapeHtml(sess.endTime)}</span>
          </div>
          <h3 class="album-session-title">${escapeHtml(
            sess.lessonTitle || sess.content || `Buổi học ngày ${formatDateDMY(sess.date)}`
          )}</h3>
          <p class="album-session-desc">${escapeHtml(
            sessMeta?.albumNote || sess.content || 'Nhấn vào để xem hoặc tải ảnh buổi học lên Google Drive.'
          )}</p>
          <div class="album-session-footer" onclick="event.stopPropagation()">
            <button type="button" class="btn btn-secondary btn-sm" data-album-open-session="${escapeHtml(
              sess.id
            )}">🖼️ Xem Album (${sessPhotos.length})</button>
            <button type="button" class="btn btn-primary btn-sm" data-album-quick-upload="${escapeHtml(
              sess.id
            )}">📤 + Thêm ảnh</button>
          </div>
        </div>
      </article>`;
    })
    .join('');

  container.innerHTML = `
    <div class="glass-card album-class-banner" style="--hub-class-color:${escapeHtml(
      activeClass.color || '#B0E0FF'
    )}">
      <div class="album-class-banner-info">
        <div class="album-class-title-row">
          <i class="album-class-dot" style="background:${escapeHtml(
            activeClass.color || '#B0E0FF'
          )}"></i>
          <h2>ALBUM LỚP: ${escapeHtml(activeClass.name.toUpperCase())}</h2>
          <span class="student-class-hub-class-badge">${escapeHtml(
            activeClass.subject || 'Lớp học'
          )}</span>
          <span class="student-class-hub-class-badge">${classSessions.length} album buổi học</span>
          <span class="student-class-hub-class-badge">${classPhotos.length} ảnh (${syncedPhotos} trên Drive)</span>
        </div>
        <p class="album-class-subtitle">
          Thứ tự lưu trữ cố định trên Google Drive: <code>[Thư mục gốc: ${escapeHtml(
            state.driveConfig.rootFolderId || DEFAULT_DRIVE_ROOT_FOLDER_ID
          )}] &gt; [${escapeHtml(activeClass.name)}] &gt; [Từng buổi học]</code>. Mọi thư mục con đều nằm gọn bên trong thư mục gốc của bạn.
        </p>
      </div>
      <div class="album-class-banner-actions">
        ${
          classDriveUrl
            ? `<a href="${escapeHtml(
                classDriveUrl
              )}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">📁 Mở Folder Lớp trên Drive</a>`
            : `<button type="button" class="btn btn-secondary btn-sm" data-album-action="open-drive-config">☁️ Gắn Folder Google Drive</button>`
        }
        <button type="button" class="btn btn-primary btn-sm" data-album-action="create-session" data-class-key="${escapeHtml(
          activeClass.id
        )}">+ Tạo buổi học mới</button>
      </div>
    </div>

    ${
      classSessions.length > 0
        ? `<div class="album-session-grid">${sessionCardsHtml}</div>`
        : `<div class="glass-card" style="padding:42px;text-align:center">
            <h3 style="margin-bottom:8px">Chưa có buổi học nào trong danh sách</h3>
            <p style="color:var(--text-muted);margin-bottom:16px">Hãy tạo buổi học mới hoặc chuyển bộ lọc sang "Tất cả các buổi" để xem các album buổi học.</p>
            <button type="button" class="btn btn-primary" data-album-action="create-session" data-class-key="${escapeHtml(
              activeClass.id
            )}">+ Tạo buổi học đầu tiên</button>
          </div>`
    }
  `;
}

function renderSessionAlbumDetail(
  container: HTMLElement,
  activeClass: ClassGroup,
  classSessions: ClassSession[],
  activeSession: ClassSession
): void {
  const state = store.getState();
  const sessIdx = classSessions.findIndex((s) => s.id === activeSession.id);
  const displayIndex = sessIdx >= 0 ? sessIdx + 1 : 1;
  const sessMeta = state.sessionAlbums[activeSession.id] || {
    sessionId: activeSession.id,
    classKey: activeClass.id,
    albumNote: '',
  };

  const allSessionPhotos = state.albums.filter((p) => p.sessionId === activeSession.id);
  const classStudents = state.students.filter(
    (st) =>
      !st.isFormer &&
      st.classIds.some((cid) => cid.toLowerCase() === activeClass.id.toLowerCase())
  );

  // Filter photos by student & search query
  const pq = albumPhotoSearch.trim().toLowerCase();
  const filteredPhotos = allSessionPhotos.filter((p) => {
    if (albumStudentFilter !== 'all' && !p.studentIds.includes(albumStudentFilter)) {
      return false;
    }
    if (pq) {
      const matchName = p.name.toLowerCase().includes(pq);
      const matchCap = (p.caption || '').toLowerCase().includes(pq);
      return matchName || matchCap;
    }
    return true;
  });

  const sessionOptionsHtml = classSessions
    .map(
      (s, i) =>
        `<option value="${escapeHtml(s.id)}" ${
          s.id === activeSession.id ? 'selected' : ''
        }>Buổi ${i + 1} — ${formatDateDMY(s.date)} (${escapeHtml(
          s.lessonTitle || s.content || s.startTime
        )})</option>`
    )
    .join('');

  const studentFilterPillsHtml = [
    `<button type="button" class="album-student-pill ${
      albumStudentFilter === 'all' ? 'is-active' : ''
    }" data-album-student-filter="all">Tất cả (${allSessionPhotos.length})</button>`,
    ...classStudents.map((stu) => {
      const count = allSessionPhotos.filter((p) => p.studentIds.includes(stu.id)).length;
      return `<button type="button" class="album-student-pill ${
        albumStudentFilter === stu.id ? 'is-active' : ''
      }" data-album-student-filter="${escapeHtml(stu.id)}">
        <span class="album-student-mini-avatar">${escapeHtml(getInitials(stu.name))}</span>
        <span>${escapeHtml(stu.name)} (${count})</span>
      </button>`;
    }),
  ].join('');

  const photosGridHtml = filteredPhotos
    .map((photo) => {
      const imgUrl = getPhotoDisplayUrl(photo);
      const isSelected = selectedPhotoIds.has(photo.id);
      const isSynced = photo.syncStatus === 'synced' || Boolean(photo.driveFileId);
      const taggedStudents = classStudents.filter((s) => photo.studentIds.includes(s.id));

      return `<article class="glass-card album-photo-card ${
        isSelected ? 'is-selected' : ''
      }" data-photo-id="${escapeHtml(photo.id)}">
        <div class="album-photo-thumb-wrap" data-album-open-lightbox="${escapeHtml(photo.id)}">
          ${
            isPhotoSelectionMode
              ? `<label class="album-photo-select-checkbox" onclick="event.stopPropagation()">
                  <input type="checkbox" data-album-photo-check="${escapeHtml(photo.id)}" ${
                  isSelected ? 'checked' : ''
                }>
                </label>`
              : ''
          }
          <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(photo.name)}" loading="lazy">
          <div class="album-photo-badges">
            <span class="album-sync-pill ${isSynced ? 'is-synced' : 'is-local'}">
              ${isSynced ? '☁️ Google Drive' : '💾 Cục bộ'}
            </span>
          </div>
        </div>
        <div class="album-photo-info">
          <div class="album-photo-caption" title="${escapeHtml(photo.caption || photo.name)}">
            ${escapeHtml(photo.caption || photo.name)}
          </div>
          <div class="album-photo-tags">
            ${
              taggedStudents.length > 0
                ? taggedStudents
                    .map(
                      (st) =>
                        `<span class="album-student-tag">${escapeHtml(st.name)}</span>`
                    )
                    .join('')
                : `<span class="album-student-tag is-muted">Cả lớp</span>`
            }
          </div>
          <div class="album-photo-actions">
            <button type="button" class="btn btn-secondary btn-sm" data-album-open-lightbox="${escapeHtml(
              photo.id
            )}" title="Xem phóng to">🔍 Xem</button>
            <button type="button" class="btn btn-secondary btn-sm" data-album-edit-photo="${escapeHtml(
              photo.id
            )}" title="Sửa chú thích & gắn thẻ học sinh">✏️ Chú thích</button>
            ${
              photo.driveWebViewLink
                ? `<a href="${escapeHtml(
                    photo.driveWebViewLink
                  )}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" title="Mở file trên Google Drive">🔗 Drive</a>`
                : `<button type="button" class="btn btn-secondary btn-sm" data-album-push-photo="${escapeHtml(
                    photo.id
                  )}" title="Đẩy ảnh này lên Google Drive">☁️ Lưu Drive</button>`
            }
            <button type="button" class="btn btn-danger btn-sm" data-album-delete-photo="${escapeHtml(
              photo.id
            )}" title="Xóa ảnh">🗑️</button>
          </div>
        </div>
      </article>`;
    })
    .join('');

  container.innerHTML = `
    <div class="album-detail-topbar">
      <button type="button" class="btn btn-secondary btn-sm" data-album-back-to-class="${escapeHtml(
        activeClass.id
      )}">
        ← Tất cả buổi học lớp ${escapeHtml(activeClass.name)}
      </button>
      <div class="album-detail-session-switcher">
        <label for="albumQuickSessionSelect">Chuyển nhanh buổi học:</label>
        <select id="albumQuickSessionSelect" class="form-control">
          ${sessionOptionsHtml}
        </select>
      </div>
    </div>

    <div class="glass-card album-session-detail-header">
      <div class="album-session-detail-main">
        <div class="album-session-detail-badges">
          <span class="album-badge-primary">BUỔI ${displayIndex}</span>
          <span class="student-class-hub-class-badge">${escapeHtml(
            getVietDayFull(activeSession.date)
          )}, ${escapeHtml(formatDateDMY(activeSession.date))}</span>
          <span class="student-class-hub-class-badge">${escapeHtml(
            activeSession.startTime
          )} - ${escapeHtml(activeSession.endTime)}</span>
          <span class="student-class-hub-class-badge">${allSessionPhotos.length} ảnh trong buổi</span>
        </div>
        <h2>${escapeHtml(
          activeSession.lessonTitle ||
            activeSession.content ||
            `Album Buổi ${displayIndex} (${formatDateDMY(activeSession.date)})`
        )}</h2>
        <p class="album-session-lesson-meta">
          <strong>Nội dung bài học:</strong> ${escapeHtml(
            activeSession.content || '-'
          )} &nbsp;|&nbsp; <strong>BTVN:</strong> ${escapeHtml(
    activeSession.homeworkContent || '-'
  )}
        </p>
        <div class="album-session-note-box">
          <input type="text" id="albumSessionNoteInput" class="form-control" data-session-id="${escapeHtml(
            activeSession.id
          )}" placeholder="Nhập ghi chú chung cho Album buổi học này (tự động lưu)..." value="${escapeHtml(
    sessMeta.albumNote || ''
  )}">
        </div>
      </div>
      <div class="album-session-detail-actions">
        <button type="button" class="btn btn-primary" data-album-open-upload="${escapeHtml(
          activeSession.id
        )}">
          📤 + Tải ảnh lên Album
        </button>
        <button type="button" class="btn btn-secondary" data-album-open-link-modal="${escapeHtml(
          activeSession.id
        )}">
          🔗 Gắn link ảnh Google Drive
        </button>
        ${
          sessMeta.driveFolderUrl
            ? `<a href="${escapeHtml(
                sessMeta.driveFolderUrl
              )}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">📁 Mở Folder Buổi học trên Drive</a>`
            : ''
        }
        <button type="button" class="btn btn-secondary btn-sm" data-album-edit-session="${escapeHtml(
          activeSession.id
        )}">
          ✏️ Sửa thông tin buổi học
        </button>
      </div>
    </div>

    <div class="glass-card album-Dropzone" id="albumQuickDropzone" data-session-id="${escapeHtml(
      activeSession.id
    )}">
      <input type="file" id="albumDirectFileInput" multiple accept="image/*" hidden>
      <div class="album-dropzone-content">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <div>
          <strong>Kéo thả nhiều ảnh vào đây, bấm để chọn file từ máy, hoặc nhấn <kbd>Ctrl+V</kbd> để dán ảnh chụp màn hình</strong>
          <small>Ảnh sẽ được thêm vào <b>Buổi ${displayIndex} (${formatDateDMY(
    activeSession.date
  )})</b> — Lớp <b>${escapeHtml(activeClass.name)}</b> ${
    isDriveConnected()
      ? 'và tự động đồng bộ lên Google Drive của bạn.'
      : '(Kết nối Google Drive để tự động đẩy lên đám mây).'
  }</small>
        </div>
      </div>
    </div>

    <div class="album-toolbar-card glass-card">
      <div class="album-student-filter-list">
        ${studentFilterPillsHtml}
      </div>
      <div class="album-toolbar-right">
        <input type="search" id="albumPhotoSearchInput" class="form-control" placeholder="Tìm chú thích hoặc tên ảnh..." value="${escapeHtml(
          albumPhotoSearch
        )}">
        <button type="button" class="btn btn-secondary btn-sm" data-album-action="toggle-select-photos" aria-pressed="${isPhotoSelectionMode}">
          ${isPhotoSelectionMode ? 'Bỏ chọn' : 'Chọn nhiều ảnh'}
        </button>
        ${
          isPhotoSelectionMode && selectedPhotoIds.size > 0
            ? `<button type="button" class="btn btn-danger btn-sm" data-album-action="delete-selected-photos">
                🗑️ Xóa đã chọn (${selectedPhotoIds.size})
              </button>`
            : ''
        }
      </div>
    </div>

    ${
      filteredPhotos.length > 0
        ? `<div class="album-photo-grid">${photosGridHtml}</div>`
        : `<div class="glass-card" style="padding:40px;text-align:center;color:var(--text-muted)">
            <p style="font-size:14px;margin-bottom:12px">Chưa có ảnh nào khớp với bộ lọc trong buổi học này.</p>
            <button type="button" class="btn btn-primary btn-sm" data-album-open-upload="${escapeHtml(
              activeSession.id
            )}">📤 Tải ảnh đầu tiên cho Buổi ${displayIndex}</button>
          </div>`
    }
  `;
}

// --- Modals: Lightbox, Photo Edit, Link Add, Drive Config ---

function openAlbumLightbox(photoId: string): void {
  const state = store.getState();
  const photo = state.albums.find((p) => p.id === photoId);
  if (!photo) return;
  activeLightboxPhotoId = photoId;

  const sessionPhotos = state.albums.filter((p) => p.sessionId === photo.sessionId);
  const currentIdx = sessionPhotos.findIndex((p) => p.id === photoId);
  const cls = store.getClassByKey(photo.classKey);
  const sess = state.sessions.find((s) => s.id === photo.sessionId);
  const taggedNames = state.students
    .filter((s) => photo.studentIds.includes(s.id))
    .map((s) => s.name);

  const imgEl = document.getElementById('albumLightboxImage') as HTMLImageElement | null;
  const titleEl = document.getElementById('albumLightboxTitle');
  const metaEl = document.getElementById('albumLightboxMeta');
  const countEl = document.getElementById('albumLightboxCounter');
  const driveLinkEl = document.getElementById('albumLightboxDriveLink') as HTMLAnchorElement | null;

  if (imgEl) imgEl.src = getPhotoDisplayUrl(photo);
  if (titleEl) titleEl.textContent = photo.caption || photo.name;
  if (metaEl) {
    metaEl.textContent = `${cls ? cls.name : ''} • ${
      sess ? `${formatDateDMY(sess.date)} (${sess.lessonTitle || sess.content || ''})` : ''
    } • Học sinh: ${taggedNames.length > 0 ? taggedNames.join(', ') : 'Cả lớp'}`;
  }
  if (countEl) {
    countEl.textContent = `${currentIdx + 1} / ${sessionPhotos.length}`;
  }
  if (driveLinkEl) {
    if (photo.driveWebViewLink) {
      driveLinkEl.href = photo.driveWebViewLink;
      driveLinkEl.removeAttribute('hidden');
    } else {
      driveLinkEl.setAttribute('hidden', '');
    }
  }

  openModal('albumLightboxModal');
}

function stepLightbox(delta: number): void {
  if (!activeLightboxPhotoId) return;
  const state = store.getState();
  const current = state.albums.find((p) => p.id === activeLightboxPhotoId);
  if (!current) return;
  const sessionPhotos = state.albums.filter((p) => p.sessionId === current.sessionId);
  if (sessionPhotos.length <= 1) return;
  const idx = sessionPhotos.findIndex((p) => p.id === activeLightboxPhotoId);
  const nextIdx = (idx + delta + sessionPhotos.length) % sessionPhotos.length;
  openAlbumLightbox(sessionPhotos[nextIdx].id);
}

function openPhotoEditModal(photoId: string): void {
  const state = store.getState();
  const photo = state.albums.find((p) => p.id === photoId);
  if (!photo) return;

  const modal = document.getElementById('albumPhotoEditModal');
  if (!modal) return;
  modal.dataset.editingPhotoId = photoId;

  const captionInput = document.getElementById(
    'albumEditPhotoCaption'
  ) as HTMLTextAreaElement | null;
  const nameInput = document.getElementById('albumEditPhotoName') as HTMLInputElement | null;
  const studentListEl = document.getElementById('albumEditPhotoStudentList');

  if (captionInput) captionInput.value = photo.caption || '';
  if (nameInput) nameInput.value = photo.name || '';

  if (studentListEl) {
    const classStudents = state.students.filter(
      (s) =>
        !s.isFormer &&
        s.classIds.some((cid) => cid.toLowerCase() === photo.classKey.toLowerCase())
    );
    studentListEl.innerHTML = classStudents
      .map((stu) => {
        const checked = photo.studentIds.includes(stu.id);
        return `<label class="album-student-check-item">
          <input type="checkbox" value="${escapeHtml(stu.id)}" ${checked ? 'checked' : ''}>
          <span>${escapeHtml(stu.name)}</span>
        </label>`;
      })
      .join('');
  }

  openModal('albumPhotoEditModal');
}

function populateDriveConfigModal(): void {
  const cfg = store.getState().driveConfig;
  const modeSelect = document.getElementById('driveConfigMode') as HTMLSelectElement | null;
  const scriptUrlInput = document.getElementById(
    'driveScriptWebAppUrl'
  ) as HTMLInputElement | null;
  const rootFolderIdInput = document.getElementById(
    'driveRootFolderId'
  ) as HTMLInputElement | null;
  const rootFolderNameInput = document.getElementById(
    'driveRootFolderName'
  ) as HTMLInputElement | null;
  const oauthClientIdInput = document.getElementById(
    'driveOauthClientId'
  ) as HTMLInputElement | null;
  const oauthTokenInput = document.getElementById(
    'driveOauthAccessToken'
  ) as HTMLInputElement | null;
  const autoSyncCheck = document.getElementById('driveAutoSyncCheck') as HTMLInputElement | null;
  const codeArea = document.getElementById('driveAppsScriptCodeBox') as HTMLTextAreaElement | null;

  if (modeSelect) modeSelect.value = cfg.mode || 'apps_script';
  if (scriptUrlInput) scriptUrlInput.value = cfg.scriptWebAppUrl || '';
  if (rootFolderIdInput) {
    rootFolderIdInput.value = cfg.rootFolderId || DEFAULT_DRIVE_ROOT_FOLDER_ID;
  }
  if (rootFolderNameInput) rootFolderNameInput.value = cfg.rootFolderName || 'NTTCLASS_ALBUMS';
  if (oauthClientIdInput) oauthClientIdInput.value = cfg.oauthClientId || '';
  if (oauthTokenInput) oauthTokenInput.value = cfg.oauthAccessToken || '';
  if (autoSyncCheck) autoSyncCheck.checked = cfg.autoSync !== false;
  if (codeArea) codeArea.value = GOOGLE_APPS_SCRIPT_CODE;

  toggleDriveConfigModePanels(cfg.mode || 'apps_script');
}

function toggleDriveConfigModePanels(mode: 'apps_script' | 'oauth'): void {
  const appsScriptPanel = document.getElementById('driveAppsScriptPanel');
  const oauthPanel = document.getElementById('driveOauthPanel');
  if (appsScriptPanel) appsScriptPanel.toggleAttribute('hidden', mode !== 'apps_script');
  if (oauthPanel) oauthPanel.toggleAttribute('hidden', mode !== 'oauth');
}

async function handleFilesUploadToSession(files: FileList | File[], sessionId: string): Promise<void> {
  const state = store.getState();
  const sess = state.sessions.find((s) => s.id === sessionId);
  if (!sess) return;

  const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    showToast('Vui lòng chọn file hình ảnh (JPG, PNG, WEBP, SVG...).', 'error');
    return;
  }

  showToast(`Đang xử lý ${imageFiles.length} ảnh...`);
  const createdIds: string[] = [];

  for (const file of imageFiles) {
    try {
      const dataUrl = await readAndOptimizeImageFile(file);
      const newId = generateId('photo');
      createdIds.push(newId);

      store.update((draft) => {
        draft.albums.push({
          id: newId,
          classKey: sess.classKey,
          sessionId: sess.id,
          name: file.name,
          caption: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
          studentIds: [...sess.studentIds],
          dataUrl,
          mimeType: file.type || 'image/jpeg',
          createdAt: new Date().toISOString(),
          syncStatus: 'local',
        });
      });
    } catch (e) {
      console.warn('Error reading image file:', e);
    }
  }

  // If Google Drive is connected and autoSync is enabled, push immediately to Google Drive!
  if (isDriveConnected() && store.getState().driveConfig.autoSync !== false) {
    showToast(`Đang tải ${createdIds.length} ảnh lên Google Drive của bạn...`);
    let okCount = 0;
    for (const pid of createdIds) {
      const ok = await uploadSinglePhotoToDrive(pid, true);
      if (ok) okCount++;
    }
    if (store.getState().driveConfig.mode === 'apps_script') {
      try {
        await callAppsScriptBridge({ action: 'save_db', db: buildDriveDatabasePayload() });
      } catch {}
    } else {
      try {
        await oauthSaveDbJson();
      } catch {}
    }
    showToast(
      `Đã thêm và đồng bộ ${okCount}/${createdIds.length} ảnh lên Google Drive thành công!`
    );
  } else {
    showToast(`Đã thêm ${createdIds.length} ảnh vào Album buổi học!`);
  }
}

export function bindAlbumEvents(): void {
  const root = document.getElementById('albumViewRoot');
  if (!root) return;

  // Sidebar search input
  const sidebarSearch = document.getElementById('albumSidebarSearch') as HTMLInputElement | null;
  sidebarSearch?.addEventListener('input', () => {
    albumSidebarSearch = sidebarSearch.value;
    renderAlbumView();
  });

  // Delegated clicks inside #albumViewRoot
  root.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    // 1. Month mode filter ('selected' vs 'all')
    const monthModeBtn = target.closest<HTMLElement>('[data-album-month-mode]');
    if (monthModeBtn) {
      albumMonthFilterMode =
        (monthModeBtn.dataset.albumMonthMode as 'selected' | 'all') || 'all';
      renderAlbumView();
      return;
    }

    // 2. Select Class in sidebar
    const selectClassBtn = target.closest<HTMLElement>('[data-album-select-class]');
    if (selectClassBtn) {
      selectedAlbumClassKey = selectClassBtn.dataset.albumSelectClass || '';
      selectedAlbumSessionId = null;
      selectedPhotoIds.clear();
      renderAlbumView();
      return;
    }

    // 3. Toggle Class collapse in sidebar
    const toggleClassBtn = target.closest<HTMLElement>('[data-album-toggle-class]');
    if (toggleClassBtn) {
      const key = (toggleClassBtn.dataset.albumToggleClass || '').toLowerCase();
      if (collapsedAlbumClasses.has(key)) collapsedAlbumClasses.delete(key);
      else collapsedAlbumClasses.add(key);
      renderAlbumView();
      return;
    }

    // 4. Select Session in sidebar or card
    const selectSessBtn = target.closest<HTMLElement>(
      '[data-album-select-session], [data-album-open-session]'
    );
    if (selectSessBtn) {
      const sessId =
        selectSessBtn.dataset.albumSelectSession || selectSessBtn.dataset.albumOpenSession || '';
      const clsKey = selectSessBtn.dataset.albumClass;
      if (clsKey) selectedAlbumClassKey = clsKey;
      selectedAlbumSessionId = sessId;
      albumStudentFilter = 'all';
      selectedPhotoIds.clear();
      renderAlbumView();
      return;
    }

    // 5. Back to class overview
    const backBtn = target.closest<HTMLElement>('[data-album-back-to-class]');
    if (backBtn) {
      selectedAlbumSessionId = null;
      selectedPhotoIds.clear();
      renderAlbumView();
      return;
    }

    // 6. Quick upload button on session card or detail header
    const quickUploadBtn = target.closest<HTMLElement>(
      '[data-album-quick-upload], [data-album-open-upload]'
    );
    if (quickUploadBtn) {
      const sessId =
        quickUploadBtn.dataset.albumQuickUpload || quickUploadBtn.dataset.albumOpenUpload || '';
      if (sessId) {
        selectedAlbumSessionId = sessId;
        renderAlbumView();
        const fileInput = document.getElementById('albumDirectFileInput') as HTMLInputElement | null;
        fileInput?.click();
      }
      return;
    }

    // 7. Open Add Drive Link Modal
    const openLinkBtn = target.closest<HTMLElement>('[data-album-open-link-modal]');
    if (openLinkBtn) {
      const sessId = openLinkBtn.dataset.albumOpenLinkModal || selectedAlbumSessionId || '';
      const modal = document.getElementById('albumAddDriveLinkModal');
      if (modal) modal.dataset.sessionId = sessId;
      const urlsInput = document.getElementById('albumDriveLinksTextarea') as HTMLTextAreaElement | null;
      const capInput = document.getElementById('albumDriveLinkCaption') as HTMLInputElement | null;
      if (urlsInput) urlsInput.value = '';
      if (capInput) capInput.value = '';
      openModal('albumAddDriveLinkModal');
      return;
    }

    // 8. Student filter pill
    const studentPill = target.closest<HTMLElement>('[data-album-student-filter]');
    if (studentPill) {
      albumStudentFilter = studentPill.dataset.albumStudentFilter || 'all';
      renderAlbumView();
      return;
    }

    // 9. Open Lightbox
    const lightboxTrigger = target.closest<HTMLElement>('[data-album-open-lightbox]');
    if (lightboxTrigger) {
      const pid = lightboxTrigger.dataset.albumOpenLightbox || '';
      if (pid) openAlbumLightbox(pid);
      return;
    }

    // 10. Edit photo caption & student tags
    const editPhotoBtn = target.closest<HTMLElement>('[data-album-edit-photo]');
    if (editPhotoBtn) {
      const pid = editPhotoBtn.dataset.albumEditPhoto || '';
      if (pid) openPhotoEditModal(pid);
      return;
    }

    // 11. Push single photo to Google Drive
    const pushPhotoBtn = target.closest<HTMLElement>('[data-album-push-photo]');
    if (pushPhotoBtn) {
      const pid = pushPhotoBtn.dataset.albumPushPhoto || '';
      if (pid) await uploadSinglePhotoToDrive(pid, false);
      return;
    }

    // 12. Delete single photo
    const deletePhotoBtn = target.closest<HTMLElement>('[data-album-delete-photo]');
    if (deletePhotoBtn) {
      const pid = deletePhotoBtn.dataset.albumDeletePhoto || '';
      const photo = store.getState().albums.find((p) => p.id === pid);
      if (!photo) return;
      store.update((draft) => {
        draft.albums = draft.albums.filter((p) => p.id !== pid);
      }, `xóa ảnh "${photo.name}"`);
      showToast(`Đã xóa ảnh "${photo.name}".`, 'success', true);
      if (photo.driveFileId && isDriveConnected() && store.getState().driveConfig.mode === 'apps_script') {
        callAppsScriptBridge({ action: 'delete_photo', driveFileId: photo.driveFileId }).catch(
          () => {}
        );
      }
      return;
    }

    // 13. Edit Session from Album Detail
    const editSessionBtn = target.closest<HTMLElement>('[data-album-edit-session]');
    if (editSessionBtn) {
      const sid = editSessionBtn.dataset.albumEditSession || '';
      if (sid) openEditSessionModal(sid);
      return;
    }

    // 14. General data-album-action buttons
    const actionBtn = target.closest<HTMLElement>('[data-album-action]');
    if (actionBtn) {
      const act = actionBtn.dataset.albumAction;
      if (act === 'open-drive-config') {
        populateDriveConfigModal();
        openModal('albumDriveConfigModal');
      } else if (act === 'sync-drive') {
        await syncAllAlbumsWithGoogleDrive();
      } else if (act === 'create-session') {
        const cKey = actionBtn.dataset.classKey || selectedAlbumClassKey;
        selectedAlbumClassKey = cKey;
        openCreateSessionModal();
      } else if (act === 'toggle-select-photos') {
        isPhotoSelectionMode = !isPhotoSelectionMode;
        selectedPhotoIds.clear();
        renderAlbumView();
      } else if (act === 'delete-selected-photos') {
        if (selectedPhotoIds.size === 0) return;
        const count = selectedPhotoIds.size;
        store.update((draft) => {
          draft.albums = draft.albums.filter((p) => !selectedPhotoIds.has(p.id));
        }, `xóa ${count} ảnh đã chọn`);
        selectedPhotoIds.clear();
        isPhotoSelectionMode = false;
        showToast(`Đã xóa ${count} ảnh.`, 'success', true);
      }
      return;
    }

    // 15. Click on dropzone opens file picker
    const dropzone = target.closest<HTMLElement>('#albumQuickDropzone');
    if (dropzone) {
      const fileInput = document.getElementById('albumDirectFileInput') as HTMLInputElement | null;
      fileInput?.click();
    }
  });

  // Delegated change & input events inside #albumViewRoot
  root.addEventListener('change', async (e) => {
    const target = e.target as HTMLElement;

    if (target.id === 'albumQuickSessionSelect') {
      selectedAlbumSessionId = (target as HTMLSelectElement).value;
      renderAlbumView();
      return;
    }

    if (target.id === 'albumDirectFileInput') {
      const input = target as HTMLInputElement;
      if (input.files && input.files.length > 0 && selectedAlbumSessionId) {
        await handleFilesUploadToSession(input.files, selectedAlbumSessionId);
        input.value = '';
      }
      return;
    }

    if (target.hasAttribute('data-album-photo-check')) {
      const pid = target.getAttribute('data-album-photo-check') || '';
      const checked = (target as HTMLInputElement).checked;
      if (checked) selectedPhotoIds.add(pid);
      else selectedPhotoIds.delete(pid);
      renderAlbumView();
      return;
    }

    if (target.id === 'albumSessionNoteInput') {
      const input = target as HTMLInputElement;
      const sid = input.dataset.sessionId || '';
      if (sid) {
        store.update((draft) => {
          const prev = draft.sessionAlbums[sid] || {
            sessionId: sid,
            classKey: selectedAlbumClassKey,
          };
          draft.sessionAlbums[sid] = {
            ...prev,
            albumNote: input.value.trim(),
          };
        });
        showToast('Đã lưu ghi chú Album buổi học.');
      }
    }
  });

  root.addEventListener('input', (e) => {
    const target = e.target as HTMLElement;
    if (target.id === 'albumPhotoSearchInput') {
      albumPhotoSearch = (target as HTMLInputElement).value;
      const pos = (target as HTMLInputElement).selectionStart || 0;
      renderAlbumView();
      const newInput = document.getElementById('albumPhotoSearchInput') as HTMLInputElement | null;
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(pos, pos);
      }
    }
  });

  // Drag & Drop support on #albumViewRoot
  root.addEventListener('dragover', (e) => {
    const dz = (e.target as HTMLElement).closest('#albumQuickDropzone');
    if (dz) {
      e.preventDefault();
      dz.classList.add('is-dragover');
    }
  });
  root.addEventListener('dragleave', (e) => {
    const dz = (e.target as HTMLElement).closest('#albumQuickDropzone');
    if (dz) dz.classList.remove('is-dragover');
  });
  root.addEventListener('drop', async (e) => {
    const dz = (e.target as HTMLElement).closest<HTMLElement>('#albumQuickDropzone');
    if (!dz) return;
    e.preventDefault();
    dz.classList.remove('is-dragover');
    const sid = dz.dataset.sessionId || selectedAlbumSessionId;
    if (sid && e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      await handleFilesUploadToSession(e.dataTransfer.files, sid);
    }
  });

  // Paste image from Clipboard (Ctrl+V) when viewing a Session Album
  document.addEventListener('paste', async (e) => {
    if (store.getState().currentView !== 'view-album' || !selectedAlbumSessionId) return;
    const activeTag = (document.activeElement?.tagName || '').toUpperCase();
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const f = items[i].getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      await handleFilesUploadToSession(files, selectedAlbumSessionId);
    }
  });

  // --- Lightbox Modal Controls ---
  document.getElementById('albumLightboxPrev')?.addEventListener('click', () => stepLightbox(-1));
  document.getElementById('albumLightboxNext')?.addEventListener('click', () => stepLightbox(1));
  document.getElementById('albumLightboxEditBtn')?.addEventListener('click', () => {
    if (activeLightboxPhotoId) {
      closeModal('albumLightboxModal');
      openPhotoEditModal(activeLightboxPhotoId);
    }
  });

  document.addEventListener('keydown', (e) => {
    const lb = document.getElementById('albumLightboxModal');
    if (!lb || !lb.classList.contains('show')) return;
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    else if (e.key === 'ArrowRight') stepLightbox(1);
  });

  // --- Photo Edit Modal Form ---
  const photoEditForm = document.getElementById('albumPhotoEditForm') as HTMLFormElement | null;
  photoEditForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const modal = document.getElementById('albumPhotoEditModal');
    const photoId = modal?.dataset.editingPhotoId || '';
    if (!photoId) return;

    const caption =
      (document.getElementById('albumEditPhotoCaption') as HTMLTextAreaElement | null)?.value.trim() ||
      '';
    const name =
      (document.getElementById('albumEditPhotoName') as HTMLInputElement | null)?.value.trim() || '';
    const checkedStudentIds: string[] = [];
    document
      .querySelectorAll<HTMLInputElement>('#albumEditPhotoStudentList input[type="checkbox"]:checked')
      .forEach((cb) => checkedStudentIds.push(cb.value));

    store.update((draft) => {
      const p = draft.albums.find((x) => x.id === photoId);
      if (p) {
        p.caption = caption;
        if (name) p.name = name;
        p.studentIds = checkedStudentIds;
      }
    });

    closeModal('albumPhotoEditModal');
    showToast('Đã cập nhật thông tin & thẻ học sinh cho ảnh!');
  });

  // --- Add Drive Link Modal Form ---
  const addLinkForm = document.getElementById('albumAddDriveLinkForm') as HTMLFormElement | null;
  addLinkForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const modal = document.getElementById('albumAddDriveLinkModal');
    const sessionId = modal?.dataset.sessionId || selectedAlbumSessionId || '';
    const sess = store.getState().sessions.find((s) => s.id === sessionId);
    if (!sess) return;

    const rawText =
      (document.getElementById('albumDriveLinksTextarea') as HTMLTextAreaElement | null)?.value ||
      '';
    const caption =
      (document.getElementById('albumDriveLinkCaption') as HTMLInputElement | null)?.value.trim() ||
      '';

    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      showToast('Vui lòng dán ít nhất 1 đường link ảnh Google Drive.', 'error');
      return;
    }

    let added = 0;
    store.update((draft) => {
      for (const line of lines) {
        const fid = extractDriveFileIdFromUrl(line);
        if (fid) {
          draft.albums.push({
            id: generateId('photo_link'),
            classKey: sess.classKey,
            sessionId: sess.id,
            name: `Drive_${fid.slice(0, 8)}.jpg`,
            caption: caption || `Ảnh Google Drive (${formatDateDMY(sess.date)})`,
            studentIds: [...sess.studentIds],
            driveFileId: fid,
            driveWebViewLink: `https://drive.google.com/file/d/${fid}/view`,
            driveThumbnailUrl: `https://drive.google.com/thumbnail?id=${fid}&sz=w1600`,
            mimeType: 'image/jpeg',
            createdAt: new Date().toISOString(),
            syncStatus: 'synced',
          });
          added++;
        } else if (/^https?:\/\//i.test(line)) {
          draft.albums.push({
            id: generateId('photo_url'),
            classKey: sess.classKey,
            sessionId: sess.id,
            name: 'External_Photo.jpg',
            caption: caption || `Ảnh buổi học (${formatDateDMY(sess.date)})`,
            studentIds: [...sess.studentIds],
            dataUrl: line,
            driveWebViewLink: line,
            mimeType: 'image/jpeg',
            createdAt: new Date().toISOString(),
            syncStatus: 'external_drive',
          });
          added++;
        }
      }
    });

    closeModal('albumAddDriveLinkModal');
    showToast(`Đã gắn ${added} ảnh từ link Google Drive vào Album!`);
  });

  // --- Google Drive Config Modal Events ---
  const modeSelect = document.getElementById('driveConfigMode') as HTMLSelectElement | null;
  modeSelect?.addEventListener('change', () => {
    toggleDriveConfigModePanels((modeSelect.value as 'apps_script' | 'oauth') || 'apps_script');
  });

  document.getElementById('copyAppsScriptCodeBtn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      showToast('Đã sao chép mã Google Apps Script vào Clipboard!');
    } catch {
      const codeArea = document.getElementById(
        'driveAppsScriptCodeBox'
      ) as HTMLTextAreaElement | null;
      codeArea?.select();
      document.execCommand('copy');
      showToast('Đã sao chép mã Google Apps Script!');
    }
  });

  // Google OAuth2 Popup button (using Google Identity Services)
  document.getElementById('driveOauthSignInBtn')?.addEventListener('click', () => {
    const clientId =
      (document.getElementById('driveOauthClientId') as HTMLInputElement | null)?.value.trim() ||
      '';
    if (!clientId) {
      showToast('Vui lòng nhập Google OAuth Client ID trước khi bấm Đăng nhập.', 'error');
      return;
    }

    const launchTokenClient = () => {
      const g = (window as any).google;
      if (!g?.accounts?.oauth2) {
        showToast('Không thể khởi tạo Google Identity Services.', 'error');
        return;
      }
      const tokenClient = g.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (resp: any) => {
          if (resp?.access_token) {
            const tokenInput = document.getElementById(
              'driveOauthAccessToken'
            ) as HTMLInputElement | null;
            if (tokenInput) tokenInput.value = resp.access_token;
            store.update((draft) => {
              draft.driveConfig.mode = 'oauth';
              draft.driveConfig.oauthClientId = clientId;
              draft.driveConfig.oauthAccessToken = resp.access_token;
            });
            showToast('Đăng nhập Google Drive OAuth2 thành công!');
          }
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    };

    if ((window as any).google?.accounts?.oauth2) {
      launchTokenClient();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = launchTokenClient;
      script.onerror = () =>
        showToast('Không thể tải thư viện Google Identity Services.', 'error');
      document.head.appendChild(script);
    }
  });

  // Save & Test Google Drive Config
  const driveConfigForm = document.getElementById('albumDriveConfigForm') as HTMLFormElement | null;
  driveConfigForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode =
      ((document.getElementById('driveConfigMode') as HTMLSelectElement | null)?.value as
        | 'apps_script'
        | 'oauth') || 'apps_script';
    const scriptWebAppUrl =
      (document.getElementById('driveScriptWebAppUrl') as HTMLInputElement | null)?.value.trim() ||
      '';
    const rootFolderId =
      (document.getElementById('driveRootFolderId') as HTMLInputElement | null)?.value.trim() || '';
    const rootFolderName =
      (document.getElementById('driveRootFolderName') as HTMLInputElement | null)?.value.trim() ||
      'NTTCLASS_ALBUMS';
    const oauthClientId =
      (document.getElementById('driveOauthClientId') as HTMLInputElement | null)?.value.trim() || '';
    const oauthAccessToken =
      (document.getElementById('driveOauthAccessToken') as HTMLInputElement | null)?.value.trim() ||
      '';
    const autoSync = Boolean(
      (document.getElementById('driveAutoSyncCheck') as HTMLInputElement | null)?.checked
    );

    // Extract folder ID if user pasted full folder URL; always fallback to 1Wvv1jQdaizAOwTc9LZ9JEutwbLj1FQeN
    const cleanFolderId =
      extractDriveFileIdFromUrl(rootFolderId) ||
      rootFolderId ||
      DEFAULT_DRIVE_ROOT_FOLDER_ID;

    store.update((draft) => {
      draft.driveConfig = {
        ...draft.driveConfig,
        mode,
        scriptWebAppUrl,
        rootFolderId: cleanFolderId,
        rootFolderName,
        oauthClientId,
        oauthAccessToken,
        autoSync,
      };
    });

    if (isDriveConnected()) {
      if (mode === 'apps_script') {
        try {
          showToast('Đang kiểm tra kết nối Google Drive...');
          const pingRes = await callAppsScriptBridge({ action: 'ping' });
          store.update((draft) => {
            if (pingRes.email) draft.driveConfig.connectedEmail = pingRes.email;
            if (pingRes.rootFolderId && !draft.driveConfig.rootFolderId) {
              draft.driveConfig.rootFolderId = pingRes.rootFolderId;
            }
          });
          closeModal('albumDriveConfigModal');
          await syncAllAlbumsWithGoogleDrive();
          return;
        } catch (err: any) {
          showToast(`Đã lưu cấu hình nhưng kết nối thử thất bại: ${err?.message || err}`, 'error');
          return;
        }
      } else {
        closeModal('albumDriveConfigModal');
        await syncAllAlbumsWithGoogleDrive();
        return;
      }
    }

    closeModal('albumDriveConfigModal');
    showToast('Đã lưu cấu hình Google Drive.');
  });
}
