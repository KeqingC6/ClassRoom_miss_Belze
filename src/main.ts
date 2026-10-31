import { store } from './store';
import type { ViewId } from './types';
import {
  closeAllModals,
  closeModal,
  formatDateDMY,
  formatMoney,
  formatMonthLabel,
  getMonthStartEnd,
  openModal,
  parseMoneyInput,
  shiftMonth,
  showToast,
} from './utils';
import { bindAlbumEvents, renderAlbumView } from './views/album';
import { bindClassHubEvents, renderClassHubView } from './views/classHub';
import { bindDashboardEvents, renderDashboardView } from './views/dashboard';
import { bindLogsEvents, renderLogsView } from './views/logs';
import {
  applyAppearancePreferences,
  bindOtherViewsEvents,
  renderFeedbackView,
  renderRenewalView,
  renderUsersView,
} from './views/otherViews';
import { bindSchedulerEvents, renderSchedulerView } from './views/scheduler';
import { bindScoresEvents, renderScoresView } from './views/scores';
import { bindTuitionEvents, renderTuitionView } from './views/tuition';

interface ViewMeta {
  title: string;
  subtitle: string;
  urlParam: string;
  showMonthPicker: boolean;
  showCreateSessionBtn: boolean;
  showGuideRunBtn: boolean;
}

const VIEW_METADATA: Record<ViewId, ViewMeta> = {
  'view-dashboard': {
    title: 'TỔNG QUAN LỚP HỌC',
    subtitle: 'Bảng điều khiển học tập và lịch dạy cá nhân.',
    urlParam: 'dashboard',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-logs': {
    title: 'NHẬT KÝ HỌC TẬP',
    subtitle: 'Theo dõi chi tiết tiến trình bài tập, ý thức học tập và nhận xét qua từng buổi học.',
    urlParam: 'logs',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-scheduler': {
    title: 'LỊCH DẠY',
    subtitle: 'Sắp xếp lịch dạy học và tính công dạy hàng tuần.',
    urlParam: 'scheduler',
    showMonthPicker: false,
    showCreateSessionBtn: true,
    showGuideRunBtn: false,
  },
  'view-tuition': {
    title: 'HỌC PHÍ',
    subtitle: 'Xem thông tin đóng học phí của tất cả học sinh.',
    urlParam: 'tuition',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-student-class-hub': {
    title: 'QUẢN LÝ HỌC SINH & LỚP HỌC',
    subtitle: 'Quản lý lớp học, học sinh, lịch học và học phí tại một nơi.',
    urlParam: 'student-class-hub',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-scores-v2': {
    title: 'ĐIỂM SỐ',
    subtitle: 'Theo dõi kết quả học tập theo lớp và học sinh.',
    urlParam: 'scores-v2',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-album': {
    title: 'ALBUM LỚP & BUỔI HỌC',
    subtitle: 'Lưu trữ hình ảnh bảng ghi, vở bài tập theo từng lớp và từng buổi học trên Google Drive cá nhân.',
    urlParam: 'album',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-users': {
    title: 'TRỢ GIẢNG',
    subtitle: 'Tạo tài khoản trợ giảng và chọn chính xác những phần được xem, được thao tác.',
    urlParam: 'users',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-feedback': {
    title: 'GÓP Ý',
    subtitle: 'Gửi góp ý và trao đổi trực tiếp với quản trị viên.',
    urlParam: 'feedback',
    showMonthPicker: true,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-subscription-renewal': {
    title: 'GIA HẠN GÓI',
    subtitle: 'Gia hạn để tiếp tục sử dụng đầy đủ tính năng và dữ liệu của tài khoản.',
    urlParam: 'subscription-renewal',
    showMonthPicker: false,
    showCreateSessionBtn: false,
    showGuideRunBtn: false,
  },
  'view-user-guide': {
    title: 'HƯỚNG DẪN SỬ DỤNG',
    subtitle: 'Xem nhanh các khu vực chính và chạy hướng dẫn trực tiếp theo từng chức năng.',
    urlParam: 'user-guide',
    showMonthPicker: false,
    showCreateSessionBtn: false,
    showGuideRunBtn: true,
  },
};

function parseViewFromUrl(): ViewId | null {
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('view') || '').trim().toLowerCase();
  if (!raw) return null;

  const map: Record<string, ViewId> = {
    dashboard: 'view-dashboard',
    logs: 'view-logs',
    scheduler: 'view-scheduler',
    tuition: 'view-tuition',
    'student-class-hub': 'view-student-class-hub',
    'scores-v2': 'view-scores-v2',
    scores: 'view-scores-v2',
    album: 'view-album',
    albums: 'view-album',
    users: 'view-users',
    assistants: 'view-users',
    feedback: 'view-feedback',
    'subscription-renewal': 'view-subscription-renewal',
    'user-guide': 'view-user-guide',
  };

  if (map[raw]) return map[raw];
  if (raw.startsWith('view-') && raw in VIEW_METADATA) {
    return raw as ViewId;
  }
  return null;
}

export function navigateToView(viewId: ViewId, updateUrl = true): void {
  const meta = VIEW_METADATA[viewId] || VIEW_METADATA['view-dashboard'];

  store.update((draft) => {
    draft.currentView = viewId;
  });

  // 1. Toggle .view-section visibility
  document.querySelectorAll<HTMLElement>('section.view-section').forEach((sec) => {
    const isTarget = sec.id === viewId;
    sec.classList.toggle('active-view', isTarget);
    sec.classList.remove('sf-hidden');
    if (isTarget) {
      sec.removeAttribute('hidden');
      sec.style.display = 'block';
    } else {
      sec.setAttribute('hidden', '');
      sec.style.display = 'none';
    }
  });

  // 2. Update sidebar active link
  document.querySelectorAll<HTMLElement>('.sidebar-menu a.menu-item').forEach((link) => {
    const target = link.dataset.target;
    link.classList.toggle('active', target === viewId);
  });

  // 3. Update header title, subtitle, and contextual buttons
  const titleEl = document.getElementById('view-title');
  const subtitleEl = document.getElementById('view-subtitle');
  if (titleEl) titleEl.textContent = meta.title;
  if (subtitleEl) subtitleEl.textContent = meta.subtitle;

  const monthPicker = document.getElementById('monthFilterPicker');
  if (monthPicker) {
    monthPicker.classList.remove('sf-hidden');
    monthPicker.toggleAttribute('hidden', !meta.showMonthPicker);
    monthPicker.style.display = meta.showMonthPicker ? ' inline-flex' : 'none';
  }

  const createSessionBtn = document.getElementById('btnOpenCreateSession');
  if (createSessionBtn) {
    createSessionBtn.classList.remove('sf-hidden');
    createSessionBtn.toggleAttribute('hidden', !meta.showCreateSessionBtn);
    createSessionBtn.style.display = meta.showCreateSessionBtn ? 'inline-flex' : 'none';
  }

  const guideRunBtn = document.getElementById('userGuideHeaderRunBtn');
  if (guideRunBtn) {
    guideRunBtn.classList.remove('sf-hidden');
    guideRunBtn.toggleAttribute('hidden', !meta.showGuideRunBtn);
    guideRunBtn.style.display = meta.showGuideRunBtn ? 'inline-flex' : 'none';
  }

  // 4. Update URL query parameter
  if (updateUrl) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('view', meta.urlParam);
      window.history.pushState({ viewId }, '', url.toString());
    } catch {
      // Ignore history errors on file:// protocol
    }
  }
}

function syncHeaderMonthControls(): void {
  const state = store.getState();
  const ym = state.selectedMonth || '2026-10';
  const label = formatMonthLabel(ym);

  document.querySelectorAll<HTMLElement>('[data-month-nav-label]').forEach((el) => {
    el.textContent = label;
  });
  document.querySelectorAll<HTMLElement>('[data-journal-month-range-label]').forEach((el) => {
    el.textContent = label;
  });

  const selectEl = document.getElementById('globalMonthFilter') as HTMLSelectElement | null;
  if (selectEl) {
    const months = [
      '2026-12',
      '2026-11',
      '2026-10',
      '2026-09',
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
    ];
    if (ym && !months.includes(ym)) months.unshift(ym);
    selectEl.innerHTML =
      `<option value="" ${!ym ? 'selected' : ''}>Tất cả tháng</option>` +
      months
        .map(
          (m) =>
            `<option value="${m}" ${m === ym ? 'selected' : ''}>${formatMonthLabel(m)}</option>`
        )
        .join('');
  }

  const fromInput = document.getElementById('journalFromDate') as HTMLInputElement | null;
  const toInput = document.getElementById('journalToDate') as HTMLInputElement | null;
  if (fromInput && state.dateRangeStart) {
    fromInput.value = state.dateRangeStart;
    const disp = fromInput.parentElement?.querySelector('.form-date-display');
    if (disp) disp.textContent = formatDateDMY(state.dateRangeStart);
  }
  if (toInput && state.dateRangeEnd) {
    toInput.value = state.dateRangeEnd;
    const disp = toInput.parentElement?.querySelector('.form-date-display');
    if (disp) disp.textContent = formatDateDMY(state.dateRangeEnd);
  }
}

function renderAllViews(): void {
  applyAppearancePreferences();
  syncHeaderMonthControls();
  renderDashboardView();
  renderLogsView();
  renderScoresView();
  renderAlbumView();
  renderSchedulerView();
  renderClassHubView();
  renderTuitionView();
  renderUsersView();
  renderFeedbackView();
  renderRenewalView();
}

function bindGlobalNavigationAndHeader(): void {
  // 1. Sidebar menu item clicks
  document.querySelector('.sidebar-menu')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const link = target.closest<HTMLAnchorElement>('a.menu-item[data-target]');
    if (!link) return;
    e.preventDefault();
    const viewId = link.dataset.target as ViewId;
    if (viewId && viewId in VIEW_METADATA) {
      navigateToView(viewId, true);
    }
  });

  // 2. Popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    const v = parseViewFromUrl();
    if (v) navigateToView(v, false);
  });

  // 3. Sidebar collapse toggle
  document.getElementById('sidebarCollapseToggle')?.addEventListener('click', () => {
    store.update((draft) => {
      draft.preferences.sidebarCollapsed = !draft.preferences.sidebarCollapsed;
    });
  });

  // 4. Sidebar resize handle drag
  const resizeHandle = document.getElementById('sidebarResizeHandle');
  resizeHandle?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const onMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(286, moveEvent.clientX));
      document.documentElement.style.setProperty('--sidebar-open-width', `${newWidth}px`);
    };
    const onUp = (upEvent: MouseEvent) => {
      const finalWidth = Math.max(200, Math.min(286, upEvent.clientX));
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      store.update((draft) => {
        draft.preferences.sidebarWidth = finalWidth;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  // 5. User box in sidebar opens Account Settings
  document.querySelector('.sidebar .user-box')?.addEventListener('click', () => {
    openModal('accountSettingsModal');
  });

  // 6. Header Month Navigation (Previous / Next / Select)
  document.querySelectorAll<HTMLElement>('[data-month-nav-direction]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.monthNavDirection;
      const delta = dir === 'previous' ? -1 : 1;
      const currentYm = store.getState().selectedMonth || '2026-10';
      const nextYm = shiftMonth(currentYm, delta);
      const { start, end } = getMonthStartEnd(nextYm);
      store.update((draft) => {
        draft.selectedMonth = nextYm;
        draft.dateRangeStart = start;
        draft.dateRangeEnd = end;
      });
    });
  });

  const globalMonthSelect = document.getElementById(
    'globalMonthFilter'
  ) as HTMLSelectElement | null;
  globalMonthSelect?.addEventListener('change', () => {
    const nextYm = globalMonthSelect.value;
    const { start, end } = getMonthStartEnd(nextYm || '2026-10');
    store.update((draft) => {
      draft.selectedMonth = nextYm;
      draft.dateRangeStart = start;
      draft.dateRangeEnd = end;
    });
  });

  // 7. 3-Month Date Range Popover inside #journalMonthRangeControl
  const rangeDetails = document.getElementById(
    'journalMonthRangeControl'
  ) as HTMLDetailsElement | null;
  let rangeDraftStart = '';
  let rangeDraftEnd = '';

  rangeDetails?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const dayBtn = target.closest<HTMLButtonElement>('[data-journal-range-date]');
    if (dayBtn) {
      const clickedDate = dayBtn.dataset.journalRangeDate || '';
      if (!rangeDraftStart || (rangeDraftStart && rangeDraftEnd)) {
        rangeDraftStart = clickedDate;
        rangeDraftEnd = '';
      } else {
        if (clickedDate < rangeDraftStart) {
          rangeDraftEnd = rangeDraftStart;
          rangeDraftStart = clickedDate;
        } else {
          rangeDraftEnd = clickedDate;
        }
      }

      rangeDetails.querySelectorAll<HTMLButtonElement>('[data-journal-range-date]').forEach((b) => {
        const d = b.dataset.journalRangeDate || '';
        const isStart = d === rangeDraftStart;
        const isEnd = d === rangeDraftEnd;
        const inRange =
          Boolean(rangeDraftStart && rangeDraftEnd) && d >= rangeDraftStart && d <= rangeDraftEnd;
        b.classList.toggle('is-range-start', isStart);
        b.classList.toggle('is-range-end', isEnd);
        b.classList.toggle('is-in-range', inRange);
        b.setAttribute('aria-pressed', String(isStart || isEnd));
      });

      const confirmBtn = rangeDetails.querySelector<HTMLButtonElement>(
        '[data-journal-range-calendar-confirm]'
      );
      if (confirmBtn) confirmBtn.disabled = !rangeDraftStart;
      return;
    }

    if (target.closest('[data-journal-range-calendar-cancel]')) {
      rangeDetails.removeAttribute('open');
      return;
    }

    if (target.closest('[data-journal-range-calendar-confirm]')) {
      if (rangeDraftStart) {
        const start = rangeDraftStart;
        const end = rangeDraftEnd || rangeDraftStart;
        const ym = start.slice(0, 7);
        store.update((draft) => {
          draft.selectedMonth = ym;
          draft.dateRangeStart = start;
          draft.dateRangeEnd = end;
        });
        showToast(`Đã lọc dữ liệu từ ${formatDateDMY(start)} đến ${formatDateDMY(end)}.`);
      }
      rangeDetails.removeAttribute('open');
    }
  });
}

function bindGlobalModalAndFormHelpers(): void {
  // 1. Undo button in toast notification
  document.getElementById('undoDeleteBtn')?.addEventListener('click', () => {
    const label = store.undo();
    if (label) {
      showToast(`Đã hoàn tác: ${label}.`, 'success', false);
    }
  });

  // 2. Delegated modal close on .modal-close, Cancel/Close footer buttons, or backdrop click
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Close button (×) inside modal header
    const closeBtn = target.closest<HTMLElement>('.modal-close');
    if (closeBtn) {
      const backdrop = closeBtn.closest<HTMLElement>('.modal-backdrop');
      if (backdrop?.id) closeModal(backdrop.id);
      return;
    }

    // Secondary cancel/close buttons inside .modal-footer
    const footerBtn = target.closest<HTMLButtonElement>('.modal-footer button.btn-secondary');
    if (footerBtn && footerBtn.type === 'button') {
      const text = (footerBtn.textContent || '').trim().toLowerCase();
      if (text === 'đóng' || text === 'hủy' || text === 'hủy bỏ') {
        const backdrop = footerBtn.closest<HTMLElement>('.modal-backdrop');
        if (backdrop?.id) closeModal(backdrop.id);
        return;
      }
    }

    // Clicking directly on .modal-backdrop outside .modal-container
    if (target.classList.contains('modal-backdrop') && target.id) {
      closeModal(target.id);
    }
  });

  // 3. Escape key closes active modals & dialogs
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
      const sv2Dialog = document.querySelector<HTMLDialogElement>('[data-sv2-dialog]');
      if (sv2Dialog) {
        delete sv2Dialog.dataset.keepOpen;
        sv2Dialog.removeAttribute('open');
      }
    }
  });

  // 4. Auto-format money inputs (`[data-money-input]`) and sync date displays (`[data-form-date-display-bound]`)
  document.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (!target || target.tagName !== 'INPUT') return;

    if (target.hasAttribute('data-money-input')) {
      const num = parseMoneyInput(target.value);
      target.value = num > 0 ? formatMoney(num, '') : target.value === '0' ? '0' : '';
    }

    if (target.type === 'date') {
      const disp = target.parentElement?.querySelector('.form-date-display, .tuition-adjustment-date-display');
      if (disp) {
        disp.textContent = target.value ? formatDateDMY(target.value) : 'dd/mm/yyyy';
        disp.classList.toggle('is-placeholder', !target.value);
      }
    }
  });
}

function initApp(): void {
  // Ensure toast starts hidden on initial load
  const toast = document.getElementById('toastNotification');
  if (toast) {
    toast.classList.remove('show', 'success');
    toast.setAttribute('hidden', '');
    toast.style.display = 'none';
  }

  // Ensure all modals start closed
  closeAllModals();

  // Bind global and per-view events
  bindGlobalNavigationAndHeader();
  bindGlobalModalAndFormHelpers();
  bindDashboardEvents(navigateToView);
  bindLogsEvents();
  bindScoresEvents();
  bindAlbumEvents();
  bindSchedulerEvents();
  bindClassHubEvents();
  bindTuitionEvents();
  bindOtherViewsEvents(navigateToView);

  // Subscribe to store updates
  store.subscribe(() => {
    renderAllViews();
  });

  // Determine initial view from URL `?view=...` or persisted state
  const urlView = parseViewFromUrl();
  const initialView = urlView || store.getState().currentView || 'view-logs';
  renderAllViews();
  navigateToView(initialView, Boolean(urlView));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
