import { store } from '../store';
import type { ViewId } from '../types';
import {
  addDaysIso,
  escapeHtml,
  formatDateDMY,
  formatMoney,
  getTodayIso,
  getVietDayShort,
} from '../utils';
import { openEditSessionModal } from './scheduler';

export function renderDashboardView(): void {
  const state = store.getState();
  const ym = state.selectedMonth || '2026-10';

  const activeStudents = state.students.filter((s) => !s.isFormer);
  const monthSessions = store.getSessionsInMonth(ym);
  const totalHours = monthSessions.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

  let monthlyTuitionTotal = 0;
  let monthlyPaidTotal = 0;
  state.classes.forEach((cls) => {
    activeStudents
      .filter((s) => s.classIds.some((cid) => cid.toLowerCase() === cls.id.toLowerCase()))
      .forEach((stu) => {
        const calc = store.calculateStudentTuitionForMonth(stu, cls, ym);
        monthlyTuitionTotal += calc.total;
        monthlyPaidTotal += calc.paid;
      });
  });

  // 1. Update 5 Stat Cards
  const elStu = document.getElementById('stat-total-students');
  const elSess = document.getElementById('stat-total-sessions');
  const elHrs = document.getElementById('stat-total-hours');
  const elTuition = document.getElementById('stat-monthly-tuition');
  const elClasses = document.getElementById('stat-total-classes');

  if (elStu) elStu.textContent = String(activeStudents.length);
  if (elSess) elSess.textContent = String(monthSessions.length);
  if (elHrs) elHrs.textContent = `${totalHours}h`;
  if (elTuition) elTuition.textContent = formatMoney(monthlyTuitionTotal);
  if (elClasses) elClasses.textContent = String(state.classes.length);

  // 2. Upcoming schedule (Today & Tomorrow)
  const todayIso = getTodayIso();
  const tomorrowIso = addDaysIso(todayIso, 1);
  const todayDisplay = `${getVietDayShort(todayIso)} - ${formatDateDMY(todayIso)}`;
  const tomorrowDisplay = `${getVietDayShort(tomorrowIso)} - ${formatDateDMY(tomorrowIso)}`;

  const todayLabelEl = document.getElementById('today-date-label');
  const tomorrowLabelEl = document.getElementById('tomorrow-date-label');
  if (todayLabelEl) todayLabelEl.textContent = todayDisplay;
  if (tomorrowLabelEl) tomorrowLabelEl.textContent = tomorrowDisplay;

  const todayContainer = document.getElementById('today-sessions-container');
  const tomorrowContainer = document.getElementById('tomorrow-sessions-container');

  const renderDaySessionsList = (dateIso: string, labelText: string): string => {
    const list = state.sessions
      .filter((s) => s.date === dateIso)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (list.length === 0) {
      return `<div>Không có ca dạy nào được xếp ${labelText}.</div>`;
    }
    return list
      .map(
        (s) =>
          `<div style="padding:10px 12px;border-radius:10px;background:var(--primary-soft);margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;cursor:pointer" data-dash-session="${escapeHtml(
            s.id
          )}">
            <div>
              <strong>${escapeHtml(s.startTime)} - ${escapeHtml(s.endTime)} · ${escapeHtml(
            s.name
          )}</strong>
              <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(
                s.lessonTitle || s.content || `${s.studentIds.length} học sinh`
              )}</div>
            </div>
            <span class="btn btn-secondary btn-sm">Mở</span>
          </div>`
      )
      .join('');
  };

  if (todayContainer) {
    todayContainer.innerHTML = renderDaySessionsList(todayIso, `hôm nay (${todayDisplay})`);
  }
  if (tomorrowContainer) {
    tomorrowContainer.innerHTML = renderDaySessionsList(
      tomorrowIso,
      `ngày mai (${tomorrowDisplay})`
    );
  }

  // 3. Revenue bar chart
  const yearTotalEl = document.getElementById('dashboardRevenueYearTotal');
  if (yearTotalEl) {
    yearTotalEl.textContent = formatMoney(monthlyPaidTotal);
  }

  const barsEl = document.getElementById('dashboardRevenueBars');
  if (barsEl) {
    const rangeSelect = document.getElementById(
      'dashboardRevenueRange'
    ) as HTMLSelectElement | null;
    const count = parseInt(rangeSelect?.value || '6', 10) || 6;
    const monthsList: { label: string; ym: string; val: number }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const mNum = 10 - i;
      const actualM = mNum <= 0 ? mNum + 12 : mNum;
      const actualY = mNum <= 0 ? 2025 : 2026;
      const mKey = `${actualY}-${String(actualM).padStart(2, '0')}`;
      const val = mKey === '2026-10' ? monthlyPaidTotal : 0;
      monthsList.push({ label: `T${actualM}`, ym: mKey, val });
    }
    const maxVal = Math.max(1, ...monthsList.map((m) => m.val));
    barsEl.innerHTML = monthsList
      .map((m) => {
        const pct = Math.round((m.val / maxVal) * 100);
        return `<div class="dashboard-revenue-bar-item" title="Tháng ${m.label}/2026: ${formatMoney(
          m.val
        )}" data-money-hidden="false">
          <span>${formatMoney(m.val)}</span>
          <i style="height:${Math.max(6, pct)}%"></i>
          <strong>${m.label}</strong>
        </div>`;
      })
      .join('');
  }

  // 4. Class Revenue Donut & List
  const classRevHost = document.getElementById('dashboardClassRevenue');
  if (classRevHost) {
    const strongEl = classRevHost.querySelector('.dashboard-class-revenue-donut strong');
    if (strongEl) strongEl.textContent = formatMoney(monthlyPaidTotal);

    const listEl = classRevHost.querySelector('.dashboard-class-revenue-list');
    if (listEl) {
      listEl.innerHTML = state.classes
        .map((cls) => {
          let clsPaid = 0;
          activeStudents
            .filter((s) => s.classIds.some((c) => c.toLowerCase() === cls.id.toLowerCase()))
            .forEach((stu) => {
              clsPaid += store.calculateStudentTuitionForMonth(stu, cls, ym).paid;
            });
          return `<div class="dashboard-class-revenue-row">
            <div>
              <strong><i style="background:${escapeHtml(cls.color)}"></i>${escapeHtml(
            cls.name
          )}</strong>
              <span>${formatMoney(clsPaid)}</span>
            </div>
            <i><span style="width:${
              monthlyPaidTotal > 0 ? Math.round((clsPaid / monthlyPaidTotal) * 100) : 0
            }%"></span></i>
          </div>`;
        })
        .join('');
    }
  }
}

export function bindDashboardEvents(navigateToView: (v: ViewId) => void): void {
  const dash = document.getElementById('view-dashboard');
  if (!dash) return;

  dash.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    const sessRow = target.closest<HTMLElement>('[data-dash-session]');
    if (sessRow && sessRow.dataset.dashSession) {
      openEditSessionModal(sessRow.dataset.dashSession);
      return;
    }

    const card = target.closest<HTMLElement>('.stat-card, button[title="Xem lịch dạy"]');
    if (card) {
      const title = card.getAttribute('title') || '';
      if (title.includes('học sinh') || title.includes('lớp học')) {
        navigateToView('view-student-class-hub');
      } else if (title.includes('lịch dạy')) {
        navigateToView('view-scheduler');
      } else if (title.includes('học phí')) {
        navigateToView('view-tuition');
      }
    }
  });

  ['dashboardRevenueRange', 'dashboardRevenueChartMode', 'dashboardRevenueMonth'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => renderDashboardView());
  });
}
