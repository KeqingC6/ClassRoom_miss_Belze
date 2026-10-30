import { store } from './store';

const VIET_DAYS = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const VIET_FULL_DAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

export function formatMoney(amount: number, suffix = '\u00a0₫'): string {
  const num = Math.round(Number(amount) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + suffix;
}

export function parseMoneyInput(raw: string): number {
  const digits = (raw || '').replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export function formatDateDMY(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDateDM(isoDate: string): string {
  if (!isoDate) return '-';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function getVietDayShort(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return VIET_DAYS[d.getDay()];
}

export function getVietDayFull(isoDate: string): string {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  return `${VIET_FULL_DAYS[d.getDay()]}, ${formatDateDMY(isoDate)}`;
}

export function formatMonthLabel(ym: string): string {
  if (!ym) return 'Tất cả tháng';
  const [y, m] = ym.split('-');
  return `Tháng ${parseInt(m, 10)}/${y}`;
}

export function shiftMonth(ym: string, delta: number): string {
  const base = ym || '2026-10';
  const [yStr, mStr] = base.split('-');
  const d = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

export function getMonthStartEnd(ym: string): { start: string; end: string } {
  if (!ym) return { start: '2026-01-01', end: '2026-12-31' };
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function computeHoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = (startTime || '00:00').split(':').map(Number);
  const [eh, em] = (endTime || '00:00').split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  const diffMinutes = eh * 60 + em - (sh * 60 + sm);
  return Math.max(0, Math.round((diffMinutes / 60) * 100) / 100);
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function escapeHtml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Modal Management
export function openModal(modalId: string): void {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.add('show');
  el.setAttribute('aria-hidden', 'false');
  el.removeAttribute('inert');
  el.removeAttribute('hidden');
}

export function closeModal(modalId: string): void {
  const el = document.getElementById(modalId);
  if (!el) return;
  el.classList.remove('show');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('inert', '');
}

export function closeAllModals(): void {
  document.querySelectorAll<HTMLElement>('.modal-backdrop.show').forEach((el) => {
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('inert', '');
  });
}

// Toast Notification
let toastTimeout: number | undefined;

export function showToast(
  message: string,
  type: 'success' | 'error' | 'info' = 'success',
  withUndo = false
): void {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;
  toast.className = `notification ${type} show`;
  const undoBtn = document.getElementById('undoDeleteBtn');

  // Clear text nodes inside toast except undoBtn
  Array.from(toast.childNodes).forEach((node) => {
    if (node !== undoBtn) toast.removeChild(node);
  });
  toast.appendChild(document.createTextNode(' ' + message));

  if (undoBtn) {
    if (withUndo && store.canUndo()) {
      undoBtn.removeAttribute('hidden');
      undoBtn.classList.remove('sf-hidden');
    } else {
      undoBtn.setAttribute('hidden', '');
    }
  }

  if (toastTimeout) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 3800);
}

// CSV / Excel Export Helper
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const bom = '\uFEFF';
  const csvLines = [
    headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
