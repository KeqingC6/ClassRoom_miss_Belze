import { store } from '../store';
import type { ClassSession, SessionStudentRecord } from '../types';
import {
  closeModal,
  computeHoursBetween,
  escapeHtml,
  formatDateDM,
  formatDateDMY,
  formatMoney,
  generateId,
  openModal,
  parseMoneyInput,
  showToast,
} from '../utils';

let calendarViewMode: 'week' | 'month' = 'week';
let currentWeekMonday = '2026-10-26'; // Week containing 2026-10-30
let filterClassKey = '';
let filterStudentId = '';

// Temporary state for editSessionModal & createSessionModal
let editingSessionId = '';
let editStudentRecordsDraft: Record<string, SessionStudentRecord> = {};
let editScoresDraft: Record<string, { value: string; note: string }> = {};
let editScoreMetaDraft = { type: 'KTTX', testName: '', maxScore: 10 };
let editStudentFilterMode: 'all' | 'incomplete-hw' | 'missing-comment' = 'all';

function getMondayOf(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return '2026-10-26';
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function renderSchedulerView(): void {
  const state = store.getState();
  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekDays.push(addDays(currentWeekMonday, i));
  }
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];

  // Update week range label
  const rangeLabelEl = document.getElementById('weekRangeLabel');
  if (rangeLabelEl) {
    if (calendarViewMode === 'week') {
      rangeLabelEl.textContent = `${formatDateDM(weekStart)} - ${formatDateDMY(weekEnd)}`;
    } else {
      const ym = weekStart.slice(0, 7);
      const [y, m] = ym.split('-');
      rangeLabelEl.textContent = `Tháng ${parseInt(m, 10)}/${y}`;
    }
  }

  // Toggle buttons active state
  document.querySelectorAll<HTMLElement>('.cal-view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === calendarViewMode);
  });

  // Google Calendar button visibility
  const gcalBtn = document.getElementById('googleCalendarToolbarBtn');
  if (gcalBtn) {
    if (state.preferences.featureToggles.googleCalendar) {
      gcalBtn.removeAttribute('hidden');
      gcalBtn.classList.remove('sf-hidden');
    } else {
      gcalBtn.setAttribute('hidden', '');
    }
  }

  // Filter sessions in view range
  const relevantSessions = state.sessions.filter((s) => {
    if (filterClassKey && s.classKey.toLowerCase() !== filterClassKey.toLowerCase()) return false;
    if (filterStudentId && !s.studentIds.includes(filterStudentId)) return false;
    if (calendarViewMode === 'week') {
      return s.date >= weekStart && s.date <= weekEnd;
    } else {
      const ym = weekStart.slice(0, 7);
      return s.date.startsWith(ym);
    }
  });

  // Update 4 Summary Cards
  const totalSessions = relevantSessions.length;
  const totalHours = relevantSessions.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);
  const count1on1 = relevantSessions.filter((s) => s.type === 'riêng' || s.studentIds.length === 1).length;
  const countGroup = totalSessions - count1on1;
  const totalMoney = relevantSessions.reduce((acc, s) => acc + (Number(s.price) || 0), 0);

  const elTotalSess = document.getElementById('summary-total-sessions');
  const elTotalHours = document.getElementById('summary-total-hours');
  const elRatio = document.getElementById('summary-ratio');
  const elMoney = document.getElementById('summary-total-money');
  if (elTotalSess) elTotalSess.textContent = String(totalSessions);
  if (elTotalHours) elTotalHours.textContent = totalHours.toFixed(1);
  if (elRatio) elRatio.textContent = `${count1on1}/${countGroup}`;
  if (elMoney) elMoney.textContent = formatMoney(totalMoney);

  const weekWrapper = document.getElementById('weekCalendarWrapper');
  const monthGrid = document.getElementById('monthCalendarGrid');

  if (calendarViewMode === 'week') {
    if (weekWrapper) weekWrapper.style.display = 'block';
    if (monthGrid) monthGrid.style.display = 'none';
    renderWeekCalendar(weekDays, relevantSessions);
  } else {
    if (weekWrapper) weekWrapper.style.display = 'none';
    if (monthGrid) {
      monthGrid.style.display = 'grid';
      renderMonthCalendar(weekStart.slice(0, 7), relevantSessions);
    }
  }
}

function renderWeekCalendar(weekDays: string[], sessions: ClassSession[]): void {
  const state = store.getState();
  const dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const headerRow = document.getElementById('weekCalendarHeaderRow');
  const todayIso = '2026-10-30';

  if (headerRow) {
    headerRow.innerHTML =
      `<div style="grid-column:1"></div>` +
      weekDays
        .map((dateIso, idx) => {
          const daySessions = sessions.filter((s) => s.date === dateIso);
          const dayMoney = daySessions.reduce((acc, s) => acc + (s.price || 0), 0);
          const isToday = dateIso === todayIso;
          return `<div class="week-day-header ${isToday ? 'is-today' : ''}" style="grid-column:${
            idx + 2
          }">
            <span class="day-label">${dayNames[idx]} · ${formatDateDM(dateIso)}</span>
            <span class="day-total">${formatMoney(dayMoney)}</span>
          </div>`;
        })
        .join('');
  }

  const bodyEl = document.getElementById('weekCalendarBody');
  if (!bodyEl) return;

  // Update the 7 week-day-column divs
  const columns = bodyEl.querySelectorAll<HTMLElement>('.week-day-column');
  columns.forEach((col, idx) => {
    const dateIso = weekDays[idx];
    col.dataset.date = dateIso;
    col.classList.toggle('is-today', dateIso === todayIso);

    const daySessions = sessions.filter((s) => s.date === dateIso);
    col.innerHTML = daySessions
      .map((sess) => {
        const [sh, sm] = sess.startTime.split(':').map(Number);
        const [eh, em] = sess.endTime.split(':').map(Number);
        const startFrom7 = Math.max(0, sh + sm / 60 - 7);
        const duration = Math.max(0.75, eh + em / 60 - (sh + sm / 60));
        const topPx = Math.round(startFrom7 * 44);
        const heightPx = Math.max(36, Math.round(duration * 44));
        const cls = store.getClassByKey(sess.classKey);
        const accent = cls?.color || '#2679d8';
        const totalClassStudents = cls
          ? state.students.filter((st) =>
              st.classIds.some((c) => c.toLowerCase() === cls.id.toLowerCase())
            ).length
          : sess.studentIds.length;

        return `<div class="week-event-block" data-session-id="${escapeHtml(
          sess.id
        )}" style="top:${topPx}px;height:${heightPx}px;border-left-color:${escapeHtml(accent)}">
          <strong>${escapeHtml(sess.name || cls?.name || 'Buổi học')}</strong>
          <div class="week-event-meta">
            <span>${escapeHtml(sess.startTime)} - ${escapeHtml(sess.endTime)}</span>
            ${
              state.preferences.calendarShowAttendanceTag
                ? `<span>· ${sess.studentIds.length}/${totalClassStudents} HS</span>`
                : ''
            }
            ${
              state.preferences.calendarShowSessionPrices && sess.price > 0
                ? `<span>· ${formatMoney(sess.price)}</span>`
                : ''
            }
          </div>
        </div>`;
      })
      .join('');
  });
}

function renderMonthCalendar(ym: string, sessions: ClassSession[]): void {
  const monthGrid = document.getElementById('monthCalendarGrid');
  if (!monthGrid) return;

  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const firstDay = new Date(y, m - 1, 1);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayIso = '2026-10-30';

  const dayHeaders = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
    .map((d) => `<div class="month-weekday-header">${d}</div>`)
    .join('');

  const cells: string[] = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push(`<div class="month-day-cell is-outside"></div>`);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateIso = `${ym}-${String(d).padStart(2, '0')}`;
    const daySessions = sessions.filter((s) => s.date === dateIso);
    const isToday = dateIso === todayIso;
    const eventsHtml = daySessions
      .map(
        (s) =>
          `<div class="month-day-event" data-session-id="${escapeHtml(s.id)}">
            <strong>${escapeHtml(s.startTime)}</strong> ${escapeHtml(s.name)}
          </div>`
      )
      .join('');

    cells.push(`<div class="month-day-cell ${isToday ? 'is-today' : ''}" data-month-date="${dateIso}">
      <div class="month-day-number">${d}</div>
      ${eventsHtml}
    </div>`);
  }

  monthGrid.innerHTML = dayHeaders + cells.join('');
}

// Populate student checkbox grid in #createSessionModal or #editSessionModal
function renderSessionStudentsCheckboxGrid(
  gridId: string,
  checkboxName: string,
  selectedIds: string[],
  searchQuery = ''
): void {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const state = store.getState();
  const q = searchQuery.trim().toLowerCase();

  const html = state.classes
    .map((cls) => {
      const students = state.students.filter(
        (s) =>
          !s.isFormer &&
          s.classIds.some((cid) => cid.toLowerCase() === cls.id.toLowerCase()) &&
          (!q ||
            s.name.toLowerCase().includes(q) ||
            cls.name.toLowerCase().includes(q))
      );
      if (students.length === 0) return '';
      const allChecked =
        students.length > 0 && students.every((s) => selectedIds.includes(s.id));

      return `<div class="student-class-group" data-class-key="${escapeHtml(cls.id)}">
        <div class="student-class-group-header">
          <button type="button" class="student-class-toggle-btn" aria-expanded="true">
            <svg class="chevron-icon" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
            <span class="student-class-name">${escapeHtml(cls.name)}</span>
            <span class="student-class-count">(${students.length})</span>
          </button>
          <label class="student-class-select-all">
            <input type="checkbox" class="select-all-class-checkbox" data-select-all-class="${escapeHtml(
              cls.id
            )}" ${allChecked ? 'checked' : ''}>
            <span>Chọn cả lớp</span>
          </label>
        </div>
        <div class="student-class-group-body">
          ${students
            .map(
              (s) => `<label class="student-check-item">
                <input type="checkbox" value="${escapeHtml(s.id)}" name="${checkboxName}" ${
                selectedIds.includes(s.id) ? 'checked' : ''
              }>
                <span>${escapeHtml(s.name)}</span>
              </label>`
            )
            .join('')}
        </div>
      </div>`;
    })
    .join('');

  grid.innerHTML = html || `<p style="padding:10px;color:var(--text-muted)">Không tìm thấy học sinh phù hợp.</p>`;
}

export function openCreateSessionModal(defaultDate?: string): void {
  const state = store.getState();
  const defaultCls = state.classes[0];
  const defaultStudentIds = defaultCls
    ? state.students
        .filter((s) => !s.isFormer && s.classIds.includes(defaultCls.id))
        .map((s) => s.id)
    : [];

  renderSessionStudentsCheckboxGrid(
    'studentsCheckboxGrid',
    'createSessionStudents',
    defaultStudentIds
  );

  const nameInput = document.getElementById('sessionName') as HTMLInputElement | null;
  const dateInput = document.getElementById('sessionDate') as HTMLInputElement | null;
  const startInput = document.getElementById('sessionStartTime') as HTMLInputElement | null;
  const endInput = document.getElementById('sessionEndTime') as HTMLInputElement | null;
  const hoursInput = document.getElementById('sessionHours') as HTMLInputElement | null;
  const titleInput = document.getElementById('sessionLessonTitle') as HTMLInputElement | null;
  const contentInput = document.getElementById('sessionContent') as HTMLTextAreaElement | null;
  const hwInput = document.getElementById('sessionHomeworkContent') as HTMLTextAreaElement | null;

  if (nameInput) nameInput.value = defaultCls?.name || '';
  if (dateInput) dateInput.value = defaultDate || '2026-10-30';
  if (startInput) startInput.value = '19:30';
  if (endInput) endInput.value = '21:00';
  if (hoursInput) hoursInput.value = '1.5';
  if (titleInput) titleInput.value = '';
  if (contentInput) contentInput.value = '';
  if (hwInput) hwInput.value = '';

  openModal('createSessionModal');
}

export function openEditSessionModal(sessionId: string, expandScorePanel = false): void {
  const state = store.getState();
  const sess = state.sessions.find((s) => s.id === sessionId);
  if (!sess) return;

  editingSessionId = sess.id;
  editStudentFilterMode = 'all';

  // Clone student records into draft
  editStudentRecordsDraft = {};
  for (const sid of sess.studentIds) {
    const existing = sess.records[sid];
    editStudentRecordsDraft[sid] = {
      studentId: sid,
      homeworkPercent: existing?.homeworkPercent || '',
      attitude: existing?.attitude || '',
      comment: existing?.comment || '',
      note: existing?.note || '',
    };
  }

  // Clone session scores into draft
  const sessionScores = state.scores.filter((sc) => sc.sessionId === sess.id);
  editScoresDraft = {};
  if (sessionScores.length > 0) {
    editScoreMetaDraft = {
      type: sessionScores[0].type,
      testName: sessionScores[0].testName,
      maxScore: sessionScores[0].maxScore,
    };
    for (const sc of sessionScores) {
      editScoresDraft[sc.studentId] = { value: String(sc.value), note: sc.note || '' };
    }
  } else {
    editScoreMetaDraft = {
      type: 'BTVN',
      testName: sess.lessonTitle || sess.name || 'Kiểm tra buổi học',
      maxScore: 10,
    };
  }

  renderSessionStudentsCheckboxGrid(
    'editStudentsCheckboxGrid',
    'editSessionStudents',
    sess.studentIds
  );

  const nameInput = document.getElementById('editSessionName') as HTMLInputElement | null;
  const dateInput = document.getElementById('editSessionDate') as HTMLInputElement | null;
  const startInput = document.getElementById('editSessionStartTime') as HTMLInputElement | null;
  const endInput = document.getElementById('editSessionEndTime') as HTMLInputElement | null;
  const hoursInput = document.getElementById('editSessionHours') as HTMLInputElement | null;
  const titleInput = document.getElementById('editSessionLessonTitle') as HTMLInputElement | null;
  const contentInput = document.getElementById('editSessionContent') as HTMLTextAreaElement | null;
  const hwInput = document.getElementById(
    'editSessionHomeworkContent'
  ) as HTMLTextAreaElement | null;

  if (nameInput) nameInput.value = sess.name;
  if (dateInput) {
    dateInput.value = sess.date;
    const disp = dateInput.parentElement?.querySelector('.form-date-display');
    if (disp) disp.textContent = formatDateDMY(sess.date);
  }
  if (startInput) startInput.value = sess.startTime;
  if (endInput) endInput.value = sess.endTime;
  if (hoursInput) hoursInput.value = String(sess.hours);
  if (titleInput) titleInput.value = sess.lessonTitle || '';
  if (contentInput) contentInput.value = sess.content || '';
  if (hwInput) hwInput.value = sess.homeworkContent || '';

  renderEditSessionQuickEntryTables(sess.studentIds);
  renderQuickEntryScorePanel(sess.studentIds, expandScorePanel || sessionScores.length > 0);

  openModal('editSessionModal');
}

function renderQuickEntryScorePanel(studentIds: string[], isExpanded: boolean): void {
  const toggleBtn = document.getElementById('quickEntryScoreToggle');
  const panel = document.getElementById('quickEntryScorePanel');
  if (!toggleBtn || !panel) return;

  toggleBtn.setAttribute('aria-expanded', String(isExpanded));
  if (!isExpanded) {
    panel.setAttribute('hidden', '');
    return;
  }
  panel.removeAttribute('hidden');
  panel.classList.remove('sf-hidden');

  const state = store.getState();
  const presetNames = Array.from(
    new Set(['BTVN', 'KTTX', ...state.scorePresets.map((p) => p.name)])
  );

  const rowsHtml = studentIds
    .map((sid, idx) => {
      const stu = store.getStudentById(sid);
      const draft = editScoresDraft[sid] || { value: '', note: '' };
      return `<tr data-qe-score-student="${escapeHtml(sid)}">
        <td style="width:44px">${idx + 1}</td>
        <td><strong>${escapeHtml(stu?.name || sid)}</strong></td>
        <td style="width:130px">
          <input type="text" inputmode="decimal" class="form-control" data-qe-score-val="${escapeHtml(
            sid
          )}" placeholder="VD: 8.5" value="${escapeHtml(draft.value)}">
        </td>
        <td>
          <input type="text" class="form-control" data-qe-score-note="${escapeHtml(
            sid
          )}" placeholder="Nhận xét điểm..." value="${escapeHtml(draft.note)}">
        </td>
      </tr>`;
    })
    .join('');

  panel.innerHTML = `<div class="qe-score-box">
    <div class="qe-score-header-grid">
      <div>
        <label style="font-size:11px;font-weight:700">Loại điểm</label>
        <select id="qeScoreType" class="form-control">
          ${presetNames
            .map(
              (n) =>
                `<option value="${escapeHtml(n)}" ${
                  n === editScoreMetaDraft.type ? 'selected' : ''
                }>${escapeHtml(n)}</option>`
            )
            .join('')}
        </select>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700">Tên bài kiểm tra</label>
        <input type="text" id="qeScoreTestName" class="form-control" placeholder="VD: Mini test Unit 4" value="${escapeHtml(
          editScoreMetaDraft.testName
        )}">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700">Thang điểm</label>
        <input type="number" id="qeScoreMax" class="form-control" value="${
          editScoreMetaDraft.maxScore
        }">
      </div>
    </div>
    <table class="quick-entry-table" style="width:100%">
      <thead>
        <tr><th>STT</th><th>Học sinh</th><th>Điểm</th><th>Ghi chú điểm</th></tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>`;
}

function renderEditSessionQuickEntryTables(
  studentIds: string[],
  searchFilter = ''
): void {
  const container = document.getElementById('quickEntryStudentsList');
  if (!container) return;

  const q = searchFilter.trim().toLowerCase();
  const filteredIds = studentIds.filter((sid) => {
    const stu = store.getStudentById(sid);
    if (!stu) return false;
    if (q && !stu.name.toLowerCase().includes(q)) return false;
    const rec = editStudentRecordsDraft[sid];
    if (editStudentFilterMode === 'incomplete-hw') {
      return !rec?.homeworkPercent || rec.homeworkPercent !== '100%';
    }
    if (editStudentFilterMode === 'missing-comment') {
      return !rec?.comment?.trim();
    }
    return true;
  });

  const pctOptions = ['0%', '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%'];

  const hwTbody = container.querySelector('.quick-entry-homework-table tbody');
  if (hwTbody) {
    hwTbody.innerHTML = filteredIds
      .map((sid, idx) => {
        const stu = store.getStudentById(sid);
        const rec = editStudentRecordsDraft[sid] || {
          studentId: sid,
          homeworkPercent: '',
          attitude: '',
          comment: '',
          note: '',
        };
        const btns = pctOptions
          .map((pct) => {
            const selected = rec.homeworkPercent === pct;
            return `<button type="button" class="qe-homework-option ${
              selected ? 'is-selected' : ''
            }" data-student-id="${escapeHtml(sid)}" data-homework-value="${pct}" aria-pressed="${selected}">${pct}</button>`;
          })
          .join('');
        return `<tr class="quick-entry-homework-row quick-entry-student-row" data-student-id="${escapeHtml(
          sid
        )}">
          <td class="quick-entry-index-cell">${idx + 1}</td>
          <td class="qe-student-name">${escapeHtml(stu?.name || sid)}</td>
          <td><div class="qe-homework-options" role="group">${btns}</div></td>
        </tr>`;
      })
      .join('');
  }

  const commentsTbody = container.querySelector('.quick-entry-comments-table tbody');
  if (commentsTbody) {
    commentsTbody.innerHTML = filteredIds
      .map((sid, idx) => {
        const stu = store.getStudentById(sid);
        const rec = editStudentRecordsDraft[sid] || {
          studentId: sid,
          homeworkPercent: '',
          attitude: '',
          comment: '',
          note: '',
        };
        return `<tr class="quick-entry-student-row" data-student-id="${escapeHtml(sid)}">
          <td class="quick-entry-index-cell">${idx + 1}</td>
          <td class="qe-student-name">${escapeHtml(stu?.name || sid)}</td>
          <td><textarea class="qe-attitude" data-qe-field="attitude" data-student-id="${escapeHtml(
            sid
          )}" rows="1" maxlength="500" placeholder="Nhập tự do..." style="height:36px">${escapeHtml(
          rec.attitude
        )}</textarea></td>
          <td><textarea class="qe-comment" data-qe-field="comment" data-student-id="${escapeHtml(
            sid
          )}" rows="1" maxlength="1500" placeholder="Nhận xét riêng..." style="height:50px">${escapeHtml(
          rec.comment
        )}</textarea></td>
          <td><textarea class="qe-note" data-qe-field="note" data-student-id="${escapeHtml(
            sid
          )}" rows="1" maxlength="1000" placeholder="Ghi chú riêng..." style="height:36px">${escapeHtml(
          rec.note
        )}</textarea></td>
        </tr>`;
      })
      .join('');
  }

  // Populate Filter Menu & Bulk Menu
  const filterMenu = document.getElementById('quickEntryStudentSearchFilterMenu');
  if (filterMenu) {
    filterMenu.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" style="width:100%;margin-bottom:4px" data-qe-filter-mode="all">Tất cả học sinh</button>
      <button type="button" class="btn btn-secondary btn-sm" style="width:100%;margin-bottom:4px" data-qe-filter-mode="incomplete-hw">Chưa hoàn thành 100% BTVN</button>
      <button type="button" class="btn btn-secondary btn-sm" style="width:100%" data-qe-filter-mode="missing-comment">Chưa có nhận xét</button>
    `;
  }

  const bulkMenu = document.getElementById('quickEntryStudentSearchBulkMenu');
  if (bulkMenu) {
    bulkMenu.innerHTML = `
      <div style="padding:8px;display:flex;flex-direction:column;gap:6px;min-width:220px">
        <strong style="font-size:11px">Áp dụng nhanh cho cả buổi:</strong>
        <button type="button" class="btn btn-secondary btn-sm" data-qe-bulk-action="hw-100">Đặt 100% BTVN cho tất cả</button>
        <button type="button" class="btn btn-secondary btn-sm" data-qe-bulk-action="hw-80">Đặt 80% BTVN cho tất cả</button>
        <button type="button" class="btn btn-secondary btn-sm" data-qe-bulk-action="attitude-good">Đặt Ý thức "Tốt" cho tất cả</button>
        <button type="button" class="btn btn-secondary btn-sm" data-qe-bulk-action="comment-good">Điền mẫu nhận xét tốt cho tất cả</button>
      </div>
    `;
  }
}

function getCheckedStudentIds(checkboxName: string): string[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[name="${checkboxName}"]:checked`)
  ).map((el) => el.value);
}

export function bindSchedulerEvents(): void {
  // Header "+ Ghi buổi học mới" button
  document.getElementById('btnOpenCreateSession')?.addEventListener('click', () => {
    openCreateSessionModal();
  });

  // Week / Month switcher
  document.querySelectorAll<HTMLElement>('.cal-view-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      calendarViewMode = (btn.dataset.view as 'week' | 'month') || 'week';
      renderSchedulerView();
    });
  });

  // Prev / Today / Next navigation
  document.getElementById('prevWeekBtn')?.addEventListener('click', () => {
    currentWeekMonday = addDays(currentWeekMonday, calendarViewMode === 'week' ? -7 : -30);
    renderSchedulerView();
  });
  document.getElementById('nextWeekBtn')?.addEventListener('click', () => {
    currentWeekMonday = addDays(currentWeekMonday, calendarViewMode === 'week' ? 7 : 30);
    renderSchedulerView();
  });
  document.getElementById('todayWeekBtn')?.addEventListener('click', () => {
    currentWeekMonday = getMondayOf('2026-10-30');
    renderSchedulerView();
  });

  // Calendar Preferences & Google Calendar modals
  document.getElementById('calendarPreferencesBtn')?.addEventListener('click', () => {
    openModal('calendarPreferencesModal');
  });
  document.getElementById('googleCalendarToolbarBtn')?.addEventListener('click', () => {
    openModal('googleCalendarModal');
  });

  // Click on event block in week/month calendar to open editSessionModal
  const viewScheduler = document.getElementById('view-scheduler');
  viewScheduler?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const evBlock = target.closest<HTMLElement>('[data-session-id]');
    if (evBlock && evBlock.dataset.sessionId) {
      openEditSessionModal(evBlock.dataset.sessionId);
      return;
    }
    const dayCol = target.closest<HTMLElement>('.week-day-column');
    if (dayCol && dayCol.dataset.date && e.target === dayCol) {
      openCreateSessionModal(dayCol.dataset.date);
    }
  });

  // Auto-compute hours when start/end time changes in create/edit modals
  const bindTimeRange = (startId: string, endId: string, hoursId: string) => {
    const sEl = document.getElementById(startId) as HTMLInputElement | null;
    const eEl = document.getElementById(endId) as HTMLInputElement | null;
    const hEl = document.getElementById(hoursId) as HTMLInputElement | null;
    const update = () => {
      if (sEl && eEl && hEl) {
        hEl.value = String(computeHoursBetween(sEl.value, eEl.value));
      }
    };
    sEl?.addEventListener('input', update);
    eEl?.addEventListener('input', update);
  };
  bindTimeRange('sessionStartTime', 'sessionEndTime', 'sessionHours');
  bindTimeRange('editSessionStartTime', 'editSessionEndTime', 'editSessionHours');

  // Select-all class checkbox in student grids
  document.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.classList.contains('select-all-class-checkbox')) {
      const group = target.closest('.student-class-group');
      group
        ?.querySelectorAll<HTMLInputElement>('.student-class-group-body input[type="checkbox"]')
        .forEach((cb) => {
          cb.checked = target.checked;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    if (target.name === 'editSessionStudents') {
      const checkedIds = getCheckedStudentIds('editSessionStudents');
      checkedIds.forEach((id) => {
        if (!editStudentRecordsDraft[id]) {
          editStudentRecordsDraft[id] = {
            studentId: id,
            homeworkPercent: '',
            attitude: '',
            comment: '',
            note: '',
          };
        }
      });
      renderEditSessionQuickEntryTables(checkedIds);
    }
  });

  // Create Session Form submit (#sessionLoggerForm)
  const createForm = document.getElementById('sessionLoggerForm') as HTMLFormElement | null;
  createForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const studentIds = getCheckedStudentIds('createSessionStudents');
    if (studentIds.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 học sinh tham gia.', 'error');
      return;
    }
    const state = store.getState();
    const primaryCls = state.classes[0];
    const name =
      (document.getElementById('sessionName') as HTMLInputElement | null)?.value.trim() ||
      primaryCls?.name ||
      'Buổi học';
    const date =
      (document.getElementById('sessionDate') as HTMLInputElement | null)?.value || '2026-10-30';
    const startTime =
      (document.getElementById('sessionStartTime') as HTMLInputElement | null)?.value || '19:30';
    const endTime =
      (document.getElementById('sessionEndTime') as HTMLInputElement | null)?.value || '21:00';
    const hours = computeHoursBetween(startTime, endTime) || 1.5;
    const price = parseMoneyInput(
      (document.getElementById('sessionPrice') as HTMLInputElement | null)?.value || '0'
    );
    const lessonTitle =
      (document.getElementById('sessionLessonTitle') as HTMLInputElement | null)?.value.trim() || '';
    const content =
      (document.getElementById('sessionContent') as HTMLTextAreaElement | null)?.value.trim() || '';
    const homeworkContent =
      (document.getElementById('sessionHomeworkContent') as HTMLTextAreaElement | null)?.value.trim() ||
      '';

    const records: Record<string, SessionStudentRecord> = {};
    studentIds.forEach((sid) => {
      records[sid] = {
        studentId: sid,
        homeworkPercent: '',
        attitude: '',
        comment: '',
        note: '',
      };
    });

    const newSess: ClassSession = {
      id: generateId('sess'),
      type: studentIds.length > 1 ? 'chung' : 'riêng',
      classKey: primaryCls?.id || 'tieng anh 2',
      name,
      date,
      startTime,
      endTime,
      hours,
      price,
      lessonTitle,
      content,
      homeworkContent,
      studentIds,
      records,
    };

    store.update((draft) => {
      draft.sessions.push(newSess);
    });

    currentWeekMonday = getMondayOf(date);
    closeModal('createSessionModal');
    showToast('Đã ghi buổi học mới thành công.');
  });

  // Reset form button
  document.getElementById('resetLoggerFormBtn')?.addEventListener('click', () => {
    createForm?.reset();
  });

  // Edit Session Modal interactions (#editSessionModal)
  const editModal = document.getElementById('editSessionModal');
  editModal?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // 0%-100% homework button click
    const hwBtn = target.closest<HTMLElement>('.qe-homework-option');
    if (hwBtn) {
      const sid = hwBtn.dataset.studentId || '';
      const val = hwBtn.dataset.homeworkValue || '';
      if (!editStudentRecordsDraft[sid]) {
        editStudentRecordsDraft[sid] = {
          studentId: sid,
          homeworkPercent: '',
          attitude: '',
          comment: '',
          note: '',
        };
      }
      // Toggle off if clicking already selected percentage
      const current = editStudentRecordsDraft[sid].homeworkPercent;
      editStudentRecordsDraft[sid].homeworkPercent = current === val ? '' : val;
      renderEditSessionQuickEntryTables(
        getCheckedStudentIds('editSessionStudents'),
        (document.getElementById('quickEntryStudentSearch') as HTMLInputElement | null)?.value || ''
      );
      return;
    }

    // Toggle inline score panel
    if (target.closest('#quickEntryScoreToggle')) {
      const panel = document.getElementById('quickEntryScorePanel');
      const isHidden = panel?.hasAttribute('hidden') ?? true;
      renderQuickEntryScorePanel(getCheckedStudentIds('editSessionStudents'), isHidden);
      return;
    }

    // Filter menu toggle
    if (target.closest('[data-table-filter-toggle]')) {
      const menu = document.getElementById('quickEntryStudentSearchFilterMenu');
      if (menu) {
        menu.classList.remove('sf-hidden');
        if (menu.hasAttribute('hidden')) menu.removeAttribute('hidden');
        else menu.setAttribute('hidden', '');
      }
      return;
    }

    // Filter mode choice
    const filterChoice = target.closest<HTMLElement>('[data-qe-filter-mode]');
    if (filterChoice) {
      editStudentFilterMode =
        (filterChoice.dataset.qeFilterMode as 'all' | 'incomplete-hw' | 'missing-comment') || 'all';
      document.getElementById('quickEntryStudentSearchFilterMenu')?.setAttribute('hidden', '');
      renderEditSessionQuickEntryTables(getCheckedStudentIds('editSessionStudents'));
      return;
    }

    // Bulk menu toggle
    if (target.closest('[data-table-bulk-toggle]')) {
      const menu = document.getElementById('quickEntryStudentSearchBulkMenu');
      if (menu) {
        menu.classList.remove('sf-hidden');
        if (menu.hasAttribute('hidden')) menu.removeAttribute('hidden');
        else menu.setAttribute('hidden', '');
      }
      return;
    }

    // Bulk action choice
    const bulkChoice = target.closest<HTMLElement>('[data-qe-bulk-action]');
    if (bulkChoice) {
      const act = bulkChoice.dataset.qeBulkAction;
      const checkedIds = getCheckedStudentIds('editSessionStudents');
      checkedIds.forEach((sid) => {
        if (!editStudentRecordsDraft[sid]) {
          editStudentRecordsDraft[sid] = {
            studentId: sid,
            homeworkPercent: '',
            attitude: '',
            comment: '',
            note: '',
          };
        }
        if (act === 'hw-100') editStudentRecordsDraft[sid].homeworkPercent = '100%';
        else if (act === 'hw-80') editStudentRecordsDraft[sid].homeworkPercent = '80%';
        else if (act === 'attitude-good') editStudentRecordsDraft[sid].attitude = 'Tốt';
        else if (act === 'comment-good')
          editStudentRecordsDraft[sid].comment =
            'Con hoàn thành BTVN đầy đủ và tập trung học bài tốt.';
      });
      document.getElementById('quickEntryStudentSearchBulkMenu')?.setAttribute('hidden', '');
      renderEditSessionQuickEntryTables(checkedIds);
      showToast('Đã áp dụng hàng loạt cho tất cả học sinh trong buổi.');
      return;
    }
  });

  // Sync live typing in attitude/comment/note textareas and inline score inputs
  editModal?.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.dataset.qeField && target.dataset.studentId) {
      const sid = target.dataset.studentId;
      const field = target.dataset.qeField as 'attitude' | 'comment' | 'note';
      if (editStudentRecordsDraft[sid]) {
        editStudentRecordsDraft[sid][field] = target.value;
      }
    }
    if (target.dataset.qeScoreVal) {
      const sid = target.dataset.qeScoreVal;
      if (!editScoresDraft[sid]) editScoresDraft[sid] = { value: '', note: '' };
      editScoresDraft[sid].value = target.value;
    }
    if (target.dataset.qeScoreNote) {
      const sid = target.dataset.qeScoreNote;
      if (!editScoresDraft[sid]) editScoresDraft[sid] = { value: '', note: '' };
      editScoresDraft[sid].note = target.value;
    }
    if (target.id === 'qeScoreType') editScoreMetaDraft.type = target.value;
    if (target.id === 'qeScoreTestName') editScoreMetaDraft.testName = target.value;
    if (target.id === 'qeScoreMax') editScoreMetaDraft.maxScore = parseFloat(target.value) || 10;
    if (target.id === 'quickEntryStudentSearch') {
      renderEditSessionQuickEntryTables(getCheckedStudentIds('editSessionStudents'), target.value);
    }
  });

  // Save Edit Session Form (#editSessionForm)
  const editForm = document.getElementById('editSessionForm') as HTMLFormElement | null;
  editForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editingSessionId) return;

    const studentIds = getCheckedStudentIds('editSessionStudents');
    const name =
      (document.getElementById('editSessionName') as HTMLInputElement | null)?.value.trim() ||
      'Buổi học';
    const date =
      (document.getElementById('editSessionDate') as HTMLInputElement | null)?.value || '2026-10-03';
    const startTime =
      (document.getElementById('editSessionStartTime') as HTMLInputElement | null)?.value || '19:30';
    const endTime =
      (document.getElementById('editSessionEndTime') as HTMLInputElement | null)?.value || '21:00';
    const hours = computeHoursBetween(startTime, endTime) || 1.5;
    const lessonTitle =
      (document.getElementById('editSessionLessonTitle') as HTMLInputElement | null)?.value.trim() ||
      '';
    const content =
      (document.getElementById('editSessionContent') as HTMLTextAreaElement | null)?.value.trim() ||
      '';
    const homeworkContent =
      (
        document.getElementById('editSessionHomeworkContent') as HTMLTextAreaElement | null
      )?.value.trim() || '';

    store.update((draft) => {
      const sess = draft.sessions.find((s) => s.id === editingSessionId);
      if (!sess) return;
      sess.name = name;
      sess.date = date;
      sess.startTime = startTime;
      sess.endTime = endTime;
      sess.hours = hours;
      sess.lessonTitle = lessonTitle;
      sess.content = content;
      sess.homeworkContent = homeworkContent;
      sess.studentIds = studentIds;
      sess.records = { ...editStudentRecordsDraft };

      // Save inline session scores if any numeric score was entered
      Object.entries(editScoresDraft).forEach(([sid, scDraft]) => {
        const valNum = parseFloat((scDraft.value || '').replace(',', '.'));
        const existingIdx = draft.scores.findIndex(
          (sc) => sc.sessionId === editingSessionId && sc.studentId === sid
        );
        if (!isNaN(valNum)) {
          if (existingIdx >= 0) {
            draft.scores[existingIdx].type = editScoreMetaDraft.type || 'BTVN';
            draft.scores[existingIdx].testName =
              editScoreMetaDraft.testName || sess.lessonTitle || sess.name;
            draft.scores[existingIdx].maxScore = editScoreMetaDraft.maxScore || 10;
            draft.scores[existingIdx].date = sess.date;
            draft.scores[existingIdx].value = valNum;
            draft.scores[existingIdx].note = scDraft.note || '';
          } else {
            draft.scores.push({
              id: generateId('score'),
              studentId: sid,
              classKey: sess.classKey,
              sessionId: editingSessionId,
              type: editScoreMetaDraft.type || 'BTVN',
              testName: editScoreMetaDraft.testName || sess.lessonTitle || sess.name,
              maxScore: editScoreMetaDraft.maxScore || 10,
              date: sess.date,
              value: valNum,
              note: scDraft.note || '',
            });
          }
        }
      });
    });

    closeModal('editSessionModal');
    showToast('Đã lưu thông tin buổi học, nhật ký và điểm số.');
  });

  // Delete session button
  document.getElementById('deleteEditSessionBtn')?.addEventListener('click', () => {
    if (!editingSessionId) return;
    const idToDelete = editingSessionId;
    store.update((draft) => {
      draft.sessions = draft.sessions.filter((s) => s.id !== idToDelete);
    }, 'Xóa buổi học');
    closeModal('editSessionModal');
    showToast('Đã xóa buổi học.', 'info', true);
  });

  // Export session summary button
  document.getElementById('exportEditSessionBtn')?.addEventListener('click', () => {
    openModal('sessionSummaryExportModal');
  });
}
