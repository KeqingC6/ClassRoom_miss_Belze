import { store } from '../store';
import {
  closeModal,
  downloadCsv,
  escapeHtml,
  formatDateDM,
  formatMoney,
  formatMonthLabel,
  getInitials,
  getVietDayShort,
  openModal,
  showToast,
} from '../utils';
import { openEditSessionModal } from './scheduler';

let activeLogStudentId = '';
let rosterSearchQuery = '';
let rosterClassFilter = '';
const collapsedRosterClasses = new Set<string>();

export function getActiveLogStudentId(): string {
  const st = store.getState();
  if (activeLogStudentId && st.students.some((s) => s.id === activeLogStudentId)) {
    return activeLogStudentId;
  }
  const first = st.students.find((s) => !s.isFormer) || st.students[0];
  activeLogStudentId = first ? first.id : '';
  return activeLogStudentId;
}

export function setActiveLogStudentId(id: string): void {
  activeLogStudentId = id;
  renderLogsView();
}

function getHomeworkBadgeClass(pct: string): string {
  if (!pct || pct === '-') return 'no-data';
  const num = parseInt(pct, 10);
  if (num >= 100) return 'done';
  if (num >= 70) return 'progress-blue';
  if (num >= 40) return 'progress-warn';
  return 'progress-low';
}

export function renderLogsView(): void {
  const state = store.getState();
  const currentStudentId = getActiveLogStudentId();
  const currentStudent = store.getStudentById(currentStudentId);

  // 1. Update class filter select options
  const classFilterEl = document.getElementById('thuyJournalClassFilter') as HTMLSelectElement | null;
  if (classFilterEl) {
    const prevVal = rosterClassFilter;
    classFilterEl.innerHTML =
      `<option value="">Theo lớp</option>` +
      state.classes
        .map(
          (c) =>
            `<option value="${escapeHtml(c.id)}" ${
              prevVal.toLowerCase() === c.id.toLowerCase() ? 'selected' : ''
            }>${escapeHtml(c.name)}</option>`
        )
        .join('');
  }

  // 2. Render left roster panel grouped by class
  const rosterListEl = document.getElementById('thuyJournalRosterList');
  if (rosterListEl) {
    const q = rosterSearchQuery.trim().toLowerCase();
    const groupsHtml: string[] = [];

    state.classes.forEach((cls, idx) => {
      if (rosterClassFilter && cls.id.toLowerCase() !== rosterClassFilter.toLowerCase()) return;
      const studentsInClass = state.students.filter(
        (s) =>
          !s.isFormer &&
          s.classIds.some((cid) => cid.toLowerCase() === cls.id.toLowerCase()) &&
          (!q || s.name.toLowerCase().includes(q) || s.phone.includes(q))
      );
      if (studentsInClass.length === 0 && q) return;
      const isExpanded = !collapsedRosterClasses.has(cls.id);

      const studentsBtns = studentsInClass
        .map((s) => {
          const active = s.id === currentStudentId;
          return `<button type="button" class="thuy-journal-roster-student ${
            active ? 'is-active' : ''
          }" data-thuy-journal-student-id="${escapeHtml(s.id)}">
            <span class="thuy-journal-student-avatar" aria-hidden="true">${escapeHtml(
              getInitials(s.name)
            )}</span>
            <span class="thuy-journal-roster-student-copy">
              <strong>${escapeHtml(s.name)}</strong>
              <small>${escapeHtml(cls.subject || cls.name)}</small>
            </span>
          </button>`;
        })
        .join('');

      groupsHtml.push(`<section class="thuy-journal-roster-group ${
        isExpanded ? 'is-expanded' : ''
      }" style="--student-group-accent:${escapeHtml(cls.color || '#B0E0FF')}">
        <button type="button" class="thuy-journal-roster-group-toggle student-grade-toggle" data-thuy-journal-class-toggle="${escapeHtml(
          cls.id
        )}" aria-expanded="${isExpanded}" aria-controls="thuy-journal-class-${idx}">
          <span class="student-grade-toggle-content">
            <span class="student-grade-color-dot" aria-hidden="true"></span>
            <span class="student-grade-label">${escapeHtml(cls.name)}</span>
            <span class="student-grade-count" aria-label="${studentsInClass.length} học sinh">${
        studentsInClass.length
      }</span>
            <svg class="student-grade-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5.75 7.5 10 11.75 14.25 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>
          </span>
        </button>
        <div class="thuy-journal-roster-students" id="thuy-journal-class-${idx}" ${
        isExpanded ? '' : 'hidden'
      }>
          ${studentsBtns}
        </div>
      </section>`);
    });

    rosterListEl.innerHTML = groupsHtml.join('');
  }

  // 3. Render top student strip
  const stripEl = document.getElementById('thuyJournalStudentStrip');
  const activeStudents = state.students.filter((s) => !s.isFormer);
  if (stripEl) {
    stripEl.innerHTML = activeStudents
      .map((s) => {
        const active = s.id === currentStudentId;
        return `<button type="button" class="thuy-journal-student-tab ${
          active ? 'is-active' : ''
        }" data-thuy-journal-student-id="${escapeHtml(s.id)}" aria-pressed="${active}">
          <span class="thuy-journal-student-avatar" aria-hidden="true">${escapeHtml(
            getInitials(s.name)
          )}</span>
          <span class="thuy-journal-student-tab-name">${escapeHtml(s.name)}</span>
        </button>`;
      })
      .join('');
  }

  // 4. Sync column picker checkboxes
  const colPrefs = state.preferences.journalColumns;
  document
    .querySelectorAll<HTMLInputElement>('[data-student-journal-column-toggle]')
    .forEach((cb) => {
      const key = cb.dataset.studentJournalColumnToggle || '';
      cb.checked = colPrefs[key] !== false;
    });

  // 5. Update Student Header & Month Header
  const headerNameEl = document.getElementById('logStudentNameHeader');
  const headerMonthEl = document.getElementById('logStudentYearHeader');
  const primaryClass = currentStudent
    ? store.getClassByKey(currentStudent.classIds[0] || '')
    : undefined;
  const defaultTitle = currentStudent
    ? `${currentStudent.name.toUpperCase()} ${primaryClass ? primaryClass.name.toUpperCase() : ''}`.trim()
    : 'NHẬT KÝ HỌC TẬP';

  if (headerNameEl) {
    headerNameEl.textContent = currentStudent?.customJournalTitle || defaultTitle;
  }
  if (headerMonthEl) {
    headerMonthEl.textContent = formatMonthLabel(state.selectedMonth).toUpperCase();
  }

  // 6. Render table headers visibility & rows
  const tableEl = document.getElementById('studentLogsTable');
  if (tableEl) {
    ['content', 'homework', 'attitude', 'comment', 'note'].forEach((colKey) => {
      const visible = colPrefs[colKey] !== false;
      tableEl.querySelectorAll<HTMLElement>(`[data-journal-column="${colKey}"]`).forEach((th) => {
        if (visible) th.removeAttribute('hidden');
        else th.setAttribute('hidden', '');
      });
    });
    const jTracks = [
      'minmax(var(--journal-col-index-min),var(--journal-col-index-max))',
      'minmax(var(--journal-col-date-min),var(--journal-col-date-max))',
    ];
    const jMins = ['var(--journal-col-index-min)', 'var(--journal-col-date-min)'];
    if (colPrefs.content !== false) {
      jTracks.push('minmax(var(--journal-col-content-min),1fr)');
      jMins.push('var(--journal-col-content-min)');
    }
    if (colPrefs.homework !== false) {
      jTracks.push('minmax(var(--journal-col-homework-min),var(--journal-col-homework-max))');
      jMins.push('var(--journal-col-homework-min)');
    }
    if (colPrefs.attitude !== false) {
      jTracks.push('minmax(var(--journal-col-attitude-min),var(--journal-col-attitude-max))');
      jMins.push('var(--journal-col-attitude-min)');
    }
    if (colPrefs.comment !== false) {
      jTracks.push('minmax(var(--journal-col-comment-min),1.2fr)');
      jMins.push('var(--journal-col-comment-min)');
    }
    if (colPrefs.note !== false) {
      jTracks.push('minmax(var(--journal-col-note-min),var(--journal-col-note-max))');
      jMins.push('var(--journal-col-note-min)');
    }
    jTracks.push('minmax(var(--journal-col-edit-min),var(--journal-col-edit-max))');
    jMins.push('var(--journal-col-edit-min)');
    tableEl.style.setProperty('--journal-table-columns', jTracks.join(' '));
    tableEl.style.setProperty('--journal-table-min-width', `calc(${jMins.join(' + ')})`);
  }

  const tbody = document.getElementById('studentLogsTableBody');
  if (!tbody) return;

  if (!currentStudent) {
    tbody.innerHTML = `<tr><td colspan="8" style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-muted)">Chưa có học sinh nào được chọn.</td></tr>`;
    return;
  }

  const sessions = store.getStudentSessions(currentStudent.id, state.selectedMonth);
  if (sessions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-muted)">Chưa có buổi học nào trong ${escapeHtml(
      formatMonthLabel(state.selectedMonth)
    )}.</td></tr>`;
    return;
  }

  const showFee = colPrefs.fee !== false && state.preferences.featureToggles.sessionFees !== false;

  tbody.innerHTML = sessions
    .map((sess, idx) => {
      const rec = sess.records[currentStudent.id] || {
        studentId: currentStudent.id,
        homeworkPercent: '',
        attitude: '',
        comment: '',
        note: '',
      };
      const hwPct = rec.homeworkPercent || '-';
      const badgeCls = getHomeworkBadgeClass(hwPct);
      const feeText = sess.price > 0 ? formatMoney(sess.price, 'đ') : '0đ';

      return `<tr data-session-id="${escapeHtml(sess.id)}">
        <td class="session-number-cell" data-journal-column="index">
          <span class="session-number-val">Buổi ${idx + 1}</span>
          <span class="session-time-val" data-journal-column="time">
            <span class="session-time-part">${escapeHtml(sess.startTime)}</span>
            <span class="session-time-separator" aria-hidden="true">-</span>
            <span class="session-time-part">${escapeHtml(sess.endTime)}</span>
          </span>
          <span class="session-fee-val" data-session-fee-control data-journal-column="fee" ${
            showFee ? '' : 'hidden'
          }>${escapeHtml(feeText)}</span>
        </td>
        <td class="session-date-cell" data-journal-column="date">
          <span class="session-date-day">${escapeHtml(getVietDayShort(sess.date))}</span>
          <span class="session-date-dm">${escapeHtml(formatDateDM(sess.date))}</span>
        </td>
        <td class="col-content-compact" data-journal-column="content" ${
          colPrefs.content !== false ? '' : 'hidden'
        }>
          <div class="session-content-text">
            <div class="session-content-body">${escapeHtml(sess.content || sess.lessonTitle || '-')}</div>
            ${
              sess.homeworkContent
                ? `<div class="session-assigned-homework"><strong>BTVN:</strong><span class="session-assigned-homework-text">${escapeHtml(
                    sess.homeworkContent
                  )}</span></div>`
                : ''
            }
          </div>
        </td>
        <td class="student-log-homework-cell" data-journal-column="homework" ${
          colPrefs.homework !== false ? '' : 'hidden'
        }>
          <span class="student-log-homework-wrap">
            <span class="homework-badge ${badgeCls}" ${
        badgeCls === 'no-data' ? 'style="background:transparent;color:var(--text-muted)"' : ''
      }>${escapeHtml(hwPct)}</span>
          </span>
        </td>
        <td class="student-log-attitude-cell" data-journal-column="attitude" ${
          colPrefs.attitude !== false ? '' : 'hidden'
        }>${escapeHtml(rec.attitude || '-')}</td>
        <td class="col-comment" data-journal-column="comment" ${
          colPrefs.comment !== false ? '' : 'hidden'
        }>
          <div class="comment-text">${escapeHtml(rec.comment || '-')}</div>
        </td>
        <td class="student-log-note" data-journal-column="note" ${
          colPrefs.note !== false ? '' : 'hidden'
        }>${escapeHtml(rec.note || '-')}</td>
        <td class="role-restricted admin-tutor log-export-hide" data-journal-column="edit">
          <div class="student-log-action-buttons">
            <button type="button" class="btn btn-secondary btn-sm ui-action-icon" data-ui-action="open-session" data-session-id="${escapeHtml(
              sess.id
            )}" title="Mở buổi học" aria-label="Mở buổi học"></button>
            <button type="button" class="btn btn-secondary btn-sm ui-action-icon" data-ui-action="edit" data-session-id="${escapeHtml(
              sess.id
            )}" title="Sửa nhật ký buổi học" aria-label="Sửa nhật ký buổi học"></button>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

// Open Student Journal Bulk Inline Editor Modal (#studentJournalModal)
export function openStudentJournalModal(studentId?: string, focusSessionId?: string): void {
  const targetStudentId = studentId || getActiveLogStudentId();
  const student = store.getStudentById(targetStudentId);
  if (!student) return;

  const state = store.getState();
  const monthFilterSelect = document.getElementById(
    'studentJournalMonthFilter'
  ) as HTMLSelectElement | null;
  if (monthFilterSelect) {
    const months = Array.from(
      new Set([
        '2026-10',
        '2026-09',
        ...state.sessions.map((s) => s.date.slice(0, 7)),
      ])
    )
      .filter(Boolean)
      .sort()
      .reverse();
    monthFilterSelect.innerHTML =
      `<option value="">Tất cả tháng</option>` +
      months
        .map(
          (m) =>
            `<option value="${m}" ${m === state.selectedMonth ? 'selected' : ''}>${formatMonthLabel(
              m
            )}</option>`
        )
        .join('');
  }

  renderStudentJournalModalBody(targetStudentId, state.selectedMonth, focusSessionId);
  openModal('studentJournalModal');
}

function renderStudentJournalModalBody(
  studentId: string,
  month: string,
  focusSessionId?: string
): void {
  const student = store.getStudentById(studentId);
  if (!student) return;
  const primaryClass = store.getClassByKey(student.classIds[0] || '');
  const defaultTitle = `${student.name.toUpperCase()} ${
    primaryClass ? primaryClass.name.toUpperCase() : ''
  }`.trim();
  const titleText = student.customJournalTitle || defaultTitle;

  const titleBtn = document.getElementById('studentJournalTitleDisplay');
  const titleInput = document.getElementById('studentJournalTitleInput') as HTMLInputElement | null;
  const monthHeader = document.getElementById('studentJournalMonthHeader');
  const modalEl = document.getElementById('studentJournalModal');
  if (modalEl) {
    modalEl.dataset.editingStudentId = studentId;
  }
  if (titleBtn) {
    titleBtn.textContent = titleText;
    titleBtn.removeAttribute('hidden');
  }
  if (titleInput) {
    titleInput.value = titleText;
    titleInput.setAttribute('hidden', '');
  }
  if (monthHeader) {
    monthHeader.textContent = formatMonthLabel(month).toUpperCase();
  }

  const sessions = store.getStudentSessions(studentId, month);
  const tbody = document.getElementById('studentJournalTableBody');
  if (!tbody) return;

  const pctOptions = ['', '0%', '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%'];

  tbody.innerHTML = sessions
    .map((sess, idx) => {
      const rec = sess.records[studentId] || {
        studentId,
        homeworkPercent: '',
        attitude: '',
        comment: '',
        note: '',
      };
      const feeText = sess.price > 0 ? formatMoney(sess.price, 'đ') : '0đ';
      const selectOpts = pctOptions
        .map(
          (opt) =>
            `<option value="${opt}" ${
              (rec.homeworkPercent || '') === opt ? 'selected' : ''
            }>${opt || '-'}</option>`
        )
        .join('');

      return `<tr class="student-journal-editable-row" data-session-id="${escapeHtml(sess.id)}">
        <td class="session-number-cell">
          <span class="session-number-val">Buổi ${idx + 1}</span>
          <span class="session-time-val">
            <span class="session-time-part">${escapeHtml(sess.startTime)}</span>
            <span class="session-time-separator" aria-hidden="true">-</span>
            <span class="session-time-part">${escapeHtml(sess.endTime)}</span>
          </span>
          <span class="session-fee-val" data-session-fee-control>${escapeHtml(feeText)}</span>
        </td>
        <td class="session-date-cell">
          <span class="session-date-day">${escapeHtml(getVietDayShort(sess.date))}</span>
          <span class="session-date-dm">${escapeHtml(formatDateDM(sess.date))}</span>
        </td>
        <td class="col-content-compact">
          <div class="session-content-text">
            <textarea class="form-control student-journal-edit-control student-journal-edit-textarea" data-journal-field="content" maxlength="5000" rows="2" placeholder="Nội dung buổi học" style="height:82px">${escapeHtml(
              sess.content
            )}</textarea>
            <div class="session-assigned-homework">
              <strong>BTVN:</strong>
              <textarea class="form-control student-journal-edit-control student-journal-edit-textarea student-journal-assigned-homework-editor" data-journal-field="homeworkContent" maxlength="5000" rows="2" placeholder="Bài tập về nhà" style="height:64px">${escapeHtml(
                sess.homeworkContent
              )}</textarea>
            </div>
          </div>
        </td>
        <td class="student-log-homework-cell">
          <select class="form-control student-journal-edit-control" data-journal-field="homework" aria-label="Bài tập về nhà">
            ${selectOpts}
          </select>
        </td>
        <td class="student-journal-attitude-cell">
          <textarea class="form-control student-journal-edit-control student-journal-edit-textarea student-journal-attitude-input" data-journal-field="attitude" maxlength="500" rows="2" placeholder="Ý thức học tập" style="height:82px">${escapeHtml(
            rec.attitude
          )}</textarea>
        </td>
        <td class="col-comment">
          <textarea class="form-control student-journal-edit-control student-journal-edit-textarea" data-journal-field="individualComment" maxlength="9000" rows="2" placeholder="Nhận xét" style="height:82px">${escapeHtml(
            rec.comment
          )}</textarea>
        </td>
        <td class="student-log-note">
          <textarea class="form-control student-journal-edit-control student-journal-edit-textarea student-journal-note-input" data-journal-field="note" maxlength="1000" rows="2" placeholder="Ghi chú" style="height:82px">${escapeHtml(
            rec.note
          )}</textarea>
        </td>
      </tr>`;
    })
    .join('');

  if (focusSessionId) {
    setTimeout(() => {
      const row = tbody.querySelector<HTMLElement>(`tr[data-session-id="${focusSessionId}"]`);
      const firstInput = row?.querySelector<HTMLElement>('textarea, select');
      firstInput?.focus();
    }, 60);
  }
}

export function bindLogsEvents(): void {
  // Roster search
  const searchInput = document.getElementById('thuyJournalRosterSearch') as HTMLInputElement | null;
  searchInput?.addEventListener('input', () => {
    rosterSearchQuery = searchInput.value;
    renderLogsView();
  });

  // Class filter
  const classFilterEl = document.getElementById(
    'thuyJournalClassFilter'
  ) as HTMLSelectElement | null;
  classFilterEl?.addEventListener('change', () => {
    rosterClassFilter = classFilterEl.value;
    renderLogsView();
  });

  // Delegated clicks inside #view-logs
  const viewLogs = document.getElementById('view-logs');
  viewLogs?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Student select in left roster or top strip
    const studentBtn = target.closest<HTMLElement>('[data-thuy-journal-student-id]');
    if (studentBtn) {
      const sid = studentBtn.dataset.thuyJournalStudentId;
      if (sid) setActiveLogStudentId(sid);
      return;
    }

    // Class collapse toggle in left roster
    const classToggleBtn = target.closest<HTMLElement>('[data-thuy-journal-class-toggle]');
    if (classToggleBtn) {
      const cid = classToggleBtn.dataset.thuyJournalClassToggle || '';
      if (collapsedRosterClasses.has(cid)) collapsedRosterClasses.delete(cid);
      else collapsedRosterClasses.add(cid);
      renderLogsView();
      return;
    }

    // Open session modal from row action
    const openSessionBtn = target.closest<HTMLElement>('[data-ui-action="open-session"]');
    if (openSessionBtn) {
      const sessId =
        openSessionBtn.dataset.sessionId ||
        openSessionBtn.closest<HTMLElement>('tr[data-session-id]')?.dataset.sessionId;
      if (sessId) openEditSessionModal(sessId);
      return;
    }

    // Edit student journal inline modal from row action
    const editJournalBtn = target.closest<HTMLElement>('[data-ui-action="edit"]');
    if (editJournalBtn) {
      const sessId =
        editJournalBtn.dataset.sessionId ||
        editJournalBtn.closest<HTMLElement>('tr[data-session-id]')?.dataset.sessionId;
      openStudentJournalModal(getActiveLogStudentId(), sessId);
      return;
    }
  });

  // Prev / Next student buttons
  document.getElementById('thuyJournalPrevStudent')?.addEventListener('click', () => {
    const activeStudents = store.getState().students.filter((s) => !s.isFormer);
    if (activeStudents.length === 0) return;
    const idx = activeStudents.findIndex((s) => s.id === getActiveLogStudentId());
    const prevIdx = idx <= 0 ? activeStudents.length - 1 : idx - 1;
    setActiveLogStudentId(activeStudents[prevIdx].id);
  });

  document.getElementById('thuyJournalNextStudent')?.addEventListener('click', () => {
    const activeStudents = store.getState().students.filter((s) => !s.isFormer);
    if (activeStudents.length === 0) return;
    const idx = activeStudents.findIndex((s) => s.id === getActiveLogStudentId());
    const nextIdx = idx < 0 || idx >= activeStudents.length - 1 ? 0 : idx + 1;
    setActiveLogStudentId(activeStudents[nextIdx].id);
  });

  // Column visibility toggles (both in logs toolbar and settings panel)
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.matches('[data-student-journal-column-toggle]')) {
      const colKey = target.dataset.studentJournalColumnToggle || '';
      store.update((draft) => {
        draft.preferences.journalColumns[colKey] = target.checked;
      });
    }
  });

  // Export Excel button
  document.getElementById('btnExportLog')?.addEventListener('click', () => {
    const student = store.getStudentById(getActiveLogStudentId());
    if (!student) return;
    const state = store.getState();
    const sessions = store.getStudentSessions(student.id, state.selectedMonth);
    const rows = sessions.map((s, idx) => {
      const rec = s.records[student.id];
      return [
        `Buổi ${idx + 1}`,
        `${s.date} (${s.startTime}-${s.endTime})`,
        s.content || '',
        s.homeworkContent || '',
        rec?.homeworkPercent || '-',
        rec?.attitude || '-',
        rec?.comment || '-',
        rec?.note || '-',
      ];
    });
    downloadCsv(
      `nhat-ky-${student.name}-${state.selectedMonth || 'all'}.csv`,
      ['Buổi', 'Ngày giờ', 'Nội dung', 'BTVN được giao', 'Mức độ BTVN', 'Ý thức', 'Nhận xét', 'Ghi chú'],
      rows
    );
    showToast(`Đã xuất file Excel (CSV) nhật ký của ${student.name}.`);
  });

  // Export Image Preview button
  const openJournalImagePreview = () => {
    const capture = document.getElementById('logExportCapture');
    const previewFrame = document.getElementById('journalImagePreviewFrame');
    if (capture && previewFrame) {
      previewFrame.innerHTML = capture.outerHTML;
    }
    openModal('journalImagePreviewModal');
  };
  document.getElementById('btnExportLogImage')?.addEventListener('click', openJournalImagePreview);
  document.getElementById('btnPreviewLogImage')?.addEventListener('click', openJournalImagePreview);

  document.getElementById('btnConfirmJournalImageExport')?.addEventListener('click', () => {
    closeModal('journalImagePreviewModal');
    showToast('Đã tạo bản xem trước ảnh nhật ký học tập (bấm Ctrl+P hoặc chụp vùng xem trước).');
  });

  // Student Journal Modal Events (#studentJournalModal)
  const journalModal = document.getElementById('studentJournalModal');
  const titleBtn = document.getElementById('studentJournalTitleDisplay');
  const titleInput = document.getElementById('studentJournalTitleInput') as HTMLInputElement | null;

  titleBtn?.addEventListener('click', () => {
    if (!titleInput) return;
    titleBtn.setAttribute('hidden', '');
    titleInput.removeAttribute('hidden');
    titleInput.classList.remove('sf-hidden');
    titleInput.focus();
  });

  titleInput?.addEventListener('blur', () => {
    if (!titleBtn) return;
    titleBtn.textContent = titleInput.value.trim() || titleBtn.textContent;
    titleInput.setAttribute('hidden', '');
    titleBtn.removeAttribute('hidden');
  });

  const journalMonthSelect = document.getElementById(
    'studentJournalMonthFilter'
  ) as HTMLSelectElement | null;
  journalMonthSelect?.addEventListener('change', () => {
    const sid = journalModal?.dataset.editingStudentId || getActiveLogStudentId();
    renderStudentJournalModalBody(sid, journalMonthSelect.value);
  });

  // Save All in #studentJournalModal
  document.getElementById('saveAllStudentJournalBtn')?.addEventListener('click', () => {
    const sid = journalModal?.dataset.editingStudentId || getActiveLogStudentId();
    const tbody = document.getElementById('studentJournalTableBody');
    if (!sid || !tbody) return;

    const newTitle = titleInput?.value.trim() || titleBtn?.textContent?.trim() || '';

    store.update((draft) => {
      const stu = draft.students.find((s) => s.id === sid);
      if (stu && newTitle) {
        stu.customJournalTitle = newTitle;
      }

      tbody.querySelectorAll<HTMLTableRowElement>('tr[data-session-id]').forEach((row) => {
        const sessId = row.dataset.sessionId || '';
        const sess = draft.sessions.find((s) => s.id === sessId);
        if (!sess) return;

        const contentEl = row.querySelector<HTMLTextAreaElement>('[data-journal-field="content"]');
        const hwContentEl = row.querySelector<HTMLTextAreaElement>(
          '[data-journal-field="homeworkContent"]'
        );
        const hwPctEl = row.querySelector<HTMLSelectElement>('[data-journal-field="homework"]');
        const attitudeEl = row.querySelector<HTMLTextAreaElement>('[data-journal-field="attitude"]');
        const commentEl = row.querySelector<HTMLTextAreaElement>(
          '[data-journal-field="individualComment"]'
        );
        const noteEl = row.querySelector<HTMLTextAreaElement>('[data-journal-field="note"]');

        if (contentEl) sess.content = contentEl.value.trim();
        if (hwContentEl) sess.homeworkContent = hwContentEl.value.trim();

        if (!sess.records[sid]) {
          sess.records[sid] = {
            studentId: sid,
            homeworkPercent: '',
            attitude: '',
            comment: '',
            note: '',
          };
        }
        if (hwPctEl) sess.records[sid].homeworkPercent = hwPctEl.value;
        if (attitudeEl) sess.records[sid].attitude = attitudeEl.value.trim();
        if (commentEl) sess.records[sid].comment = commentEl.value.trim();
        if (noteEl) sess.records[sid].note = noteEl.value.trim();
      });
    });

    closeModal('studentJournalModal');
    showToast('Đã lưu toàn bộ nhật ký học tập.');
  });
}
