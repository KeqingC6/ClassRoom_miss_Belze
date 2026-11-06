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

  const orderedStudentIds = getCheckedStudentIds('editSessionStudents');
  const activeStudentIds = orderedStudentIds.length > 0 ? orderedStudentIds : sess.studentIds;
  renderEditSessionQuickEntryTables(activeStudentIds);
  renderQuickEntryScorePanel(activeStudentIds, expandScorePanel || sessionScores.length > 0);

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

    // Export session summary button inside NHẬN XÉT HỌC SINH toolbar
    if (target.closest('[data-qe-export-summary]')) {
      openSessionSummaryExportModal();
      return;
    }
  });

  // Re-render quick entry tables when student attendance checkboxes change
  editModal?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (
      target.name === 'editSessionStudents' ||
      target.classList.contains('select-all-class-checkbox')
    ) {
      setTimeout(() => {
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
        });
        renderEditSessionQuickEntryTables(
          checkedIds,
          (document.getElementById('quickEntryStudentSearch') as HTMLInputElement | null)?.value ||
            ''
        );
        const scorePanel = document.getElementById('quickEntryScorePanel');
        if (scorePanel && !scorePanel.hasAttribute('hidden')) {
          renderQuickEntryScorePanel(checkedIds, true);
        }
      }, 0);
    }
  });

  // Sync live typing in attitude/comment/note textareas and inline score inputs
  editModal?.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.dataset.qeField && target.dataset.studentId) {
      const sid = target.dataset.studentId;
      const field = target.dataset.qeField as 'attitude' | 'comment' | 'note';
      if (!editStudentRecordsDraft[sid]) {
        editStudentRecordsDraft[sid] = {
          studentId: sid,
          homeworkPercent: '',
          attitude: '',
          comment: '',
          note: '',
        };
      }
      editStudentRecordsDraft[sid][field] = target.value;
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
    openSessionSummaryExportModal();
  });

  bindSessionSummaryExportModalEvents();
}

// =========================================================
// XUẤT NỘI DUNG BUỔI HỌC (#sessionSummaryExportModal)
// =========================================================

type SessionSummaryExportSectionKey =
  | 'schedule'
  | 'content'
  | 'homeworkContent'
  | 'homeworkPercent'
  | 'attitude'
  | 'comment'
  | 'scores'
  | 'note';

interface SessionSummaryStudentExportItem {
  id: string;
  index: number;
  name: string;
  homeworkPercent: string;
  attitude: string;
  comment: string;
  note: string;
  scoreText: string;
}

interface SessionSummaryExportData {
  sessionId: string;
  sessionName: string;
  dateIso: string;
  dateFormatted: string;
  startTime: string;
  endTime: string;
  timeRangeFormatted: string;
  lessonTitle: string;
  content: string;
  homeworkContent: string;
  students: SessionSummaryStudentExportItem[];
}

const SESSION_EXPORT_PREFS_STORAGE_KEY = 'ntt_session_summary_export_prefs_v1';

interface SessionSummaryOptionDef {
  key: SessionSummaryExportSectionKey;
  label: string;
  description: string;
}

const SESSION_SUMMARY_OPTION_DEFS: SessionSummaryOptionDef[] = [
  {
    key: 'schedule',
    label: 'Ngày & giờ dạy',
    description: 'Thanh thông tin ngày dạy và khung giờ học.',
  },
  {
    key: 'content',
    label: 'Nội dung buổi học',
    description: 'Tiêu đề bài học và chi tiết nội dung trên lớp.',
  },
  {
    key: 'homeworkContent',
    label: 'Bài tập về nhà',
    description: 'Nội dung dặn dò bài tập về nhà sau buổi học.',
  },
  {
    key: 'homeworkPercent',
    label: 'Mức độ BTVN',
    description: 'Tỷ lệ hoàn thành BTVN (%) của từng học sinh.',
  },
  {
    key: 'attitude',
    label: 'Ý thức học tập',
    description: 'Đánh giá thái độ, ý thức trong giờ học.',
  },
  {
    key: 'comment',
    label: 'Nhận xét học sinh',
    description: 'Nhận xét chi tiết từng học sinh trong buổi.',
  },
  {
    key: 'scores',
    label: 'Điểm buổi học',
    description: 'Điểm kiểm tra / BTVN của học sinh trong buổi.',
  },
  {
    key: 'note',
    label: 'Ghi chú riêng',
    description: 'Ghi chú thêm cho từng học sinh (nếu có).',
  },
];

let currentSessionExportData: SessionSummaryExportData | null = null;
let currentSessionExportChecked: Set<SessionSummaryExportSectionKey> = new Set([
  'schedule',
  'content',
  'homeworkContent',
  'homeworkPercent',
  'attitude',
  'comment',
]);

function loadSavedSessionExportPrefs(): SessionSummaryExportSectionKey[] | null {
  try {
    const raw = localStorage.getItem(SESSION_EXPORT_PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as SessionSummaryExportSectionKey[];
    }
  } catch {
    // ignore
  }
  return null;
}

function collectSessionSummaryExportData(): SessionSummaryExportData {
  // Sync any latest textareas from DOM into editStudentRecordsDraft first
  document
    .querySelectorAll<HTMLTextAreaElement>('#editSessionModal textarea[data-qe-field]')
    .forEach((ta) => {
      const sid = ta.dataset.studentId;
      const field = ta.dataset.qeField as 'attitude' | 'comment' | 'note' | undefined;
      if (sid && field) {
        if (!editStudentRecordsDraft[sid]) {
          editStudentRecordsDraft[sid] = {
            studentId: sid,
            homeworkPercent: '',
            attitude: '',
            comment: '',
            note: '',
          };
        }
        editStudentRecordsDraft[sid][field] = ta.value;
      }
    });

  const sessionName =
    (document.getElementById('editSessionName') as HTMLInputElement | null)?.value.trim() ||
    'Tiếng Anh 2';
  const dateIso =
    (document.getElementById('editSessionDate') as HTMLInputElement | null)?.value || '2026-10-03';
  const startTime =
    (document.getElementById('editSessionStartTime') as HTMLInputElement | null)?.value.trim() ||
    '19:30';
  const endTime =
    (document.getElementById('editSessionEndTime') as HTMLInputElement | null)?.value.trim() ||
    '21:00';
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

  const checkedStudentIds = getCheckedStudentIds('editSessionStudents');
  const students: SessionSummaryStudentExportItem[] = checkedStudentIds.map((sid, idx) => {
    const stu = store.getStudentById(sid);
    const rec = editStudentRecordsDraft[sid] || {
      studentId: sid,
      homeworkPercent: '',
      attitude: '',
      comment: '',
      note: '',
    };
    const scDraft = editScoresDraft[sid];
    let scoreText = '';
    if (scDraft && scDraft.value.trim() !== '') {
      const max = editScoreMetaDraft.maxScore || 10;
      scoreText = `${scDraft.value.trim()}/${max}${
        scDraft.note?.trim() ? ` (${scDraft.note.trim()})` : ''
      }`;
    }
    return {
      id: sid,
      index: idx + 1,
      name: stu?.name || sid,
      homeworkPercent: (rec.homeworkPercent || '').trim(),
      attitude: (rec.attitude || '').trim(),
      comment: (rec.comment || '').trim(),
      note: (rec.note || '').trim(),
      scoreText,
    };
  });

  return {
    sessionId: editingSessionId || 'preview',
    sessionName,
    dateIso,
    dateFormatted: formatDateDMY(dateIso),
    startTime,
    endTime,
    timeRangeFormatted: `${startTime} - ${endTime}`,
    lessonTitle,
    content,
    homeworkContent,
    students,
  };
}

function getAvailableExportSectionKeys(
  data: SessionSummaryExportData
): SessionSummaryExportSectionKey[] {
  const available: SessionSummaryExportSectionKey[] = [];
  if (data.dateFormatted || data.startTime || data.endTime) {
    available.push('schedule');
  }
  if (data.lessonTitle || data.content) {
    available.push('content');
  }
  if (data.homeworkContent) {
    available.push('homeworkContent');
  }
  if (data.students.some((s) => s.homeworkPercent !== '')) {
    available.push('homeworkPercent');
  }
  if (data.students.some((s) => s.attitude !== '')) {
    available.push('attitude');
  }
  if (data.students.some((s) => s.comment !== '')) {
    available.push('comment');
  }
  if (data.students.some((s) => s.scoreText !== '')) {
    available.push('scores');
  }
  if (data.students.some((s) => s.note !== '')) {
    available.push('note');
  }
  return available;
}

function openSessionSummaryExportModal(): void {
  const data = collectSessionSummaryExportData();
  currentSessionExportData = data;

  const nameEl = document.getElementById('sessionSummaryExportSessionName');
  const metaEl = document.getElementById('sessionSummaryExportSessionMeta');
  if (nameEl) nameEl.textContent = data.sessionName;
  if (metaEl) {
    metaEl.textContent = `${data.dateFormatted} · ${data.timeRangeFormatted} · ${data.students.length} học sinh`;
  }

  const availableKeys = getAvailableExportSectionKeys(data);
  const savedPrefs = loadSavedSessionExportPrefs();
  if (savedPrefs && savedPrefs.length > 0) {
    const filtered = availableKeys.filter((k) => savedPrefs.includes(k));
    currentSessionExportChecked = new Set(filtered.length > 0 ? filtered : availableKeys);
  } else {
    currentSessionExportChecked = new Set(availableKeys.filter((k) => k !== 'note'));
    if (currentSessionExportChecked.size === 0 && availableKeys.length > 0) {
      currentSessionExportChecked = new Set(availableKeys);
    }
  }

  renderSessionSummaryExportOptionsUI(availableKeys);
  renderSessionSummaryExportLivePreview();
  openModal('sessionSummaryExportModal');
}

function renderSessionSummaryExportOptionsUI(
  availableKeys: SessionSummaryExportSectionKey[]
): void {
  const optionsContainer = document.getElementById('sessionSummaryExportOptions');
  const emptyEl = document.getElementById('sessionSummaryExportEmpty');
  const selectAllInput = document.getElementById(
    'sessionSummaryExportSelectAll'
  ) as HTMLInputElement | null;

  if (!optionsContainer) return;

  if (availableKeys.length === 0) {
    optionsContainer.innerHTML = '';
    emptyEl?.removeAttribute('hidden');
    if (selectAllInput) selectAllInput.checked = false;
    return;
  }

  emptyEl?.setAttribute('hidden', '');

  const visibleDefs = SESSION_SUMMARY_OPTION_DEFS.filter((def) => availableKeys.includes(def.key));
  optionsContainer.innerHTML = visibleDefs
    .map((def) => {
      const isChecked = currentSessionExportChecked.has(def.key);
      return `<label class="session-summary-export-option">
        <input type="checkbox" data-session-export-key="${def.key}" ${
        isChecked ? 'checked' : ''
      } value="on">
        <span class="session-summary-export-option-copy">
          <strong>${escapeHtml(def.label)}</strong>
          <small>${escapeHtml(def.description)}</small>
        </span>
      </label>`;
    })
    .join('');

  if (selectAllInput) {
    selectAllInput.checked =
      visibleDefs.length > 0 && visibleDefs.every((d) => currentSessionExportChecked.has(d.key));
  }
}

function renderSessionSummaryCardHtml(
  data: SessionSummaryExportData,
  checked: Set<SessionSummaryExportSectionKey>
): string {
  const showSchedule = checked.has('schedule');
  const showContent = checked.has('content') && Boolean(data.lessonTitle || data.content);
  const showHomework = checked.has('homeworkContent') && Boolean(data.homeworkContent);
  const showHwPct = checked.has('homeworkPercent');
  const showAttitude = checked.has('attitude');
  const showComment = checked.has('comment');
  const showScores = checked.has('scores');
  const showNote = checked.has('note');

  const showStudentsSection =
    data.students.length > 0 &&
    (showHwPct || showAttitude || showComment || showScores || showNote);

  const bannerHtml = showSchedule
    ? `<div class="ss-export-banner">
        <div class="ss-export-banner-item">
          <span class="ss-export-banner-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" stroke-width="2"/>
              <path d="M8 3.5V6.5M16 3.5V6.5M3.5 9.5H20.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <div class="ss-export-banner-copy">
            <span class="ss-export-banner-label">NGÀY DẠY</span>
            <strong class="ss-export-banner-value">${escapeHtml(data.dateFormatted)}</strong>
          </div>
        </div>
        <div class="ss-export-banner-item">
          <span class="ss-export-banner-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2"/>
              <path d="M12 7.5V12L15 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <div class="ss-export-banner-copy">
            <span class="ss-export-banner-label">GIỜ DẠY</span>
            <strong class="ss-export-banner-value">${escapeHtml(data.timeRangeFormatted)}</strong>
          </div>
        </div>
      </div>`
    : '';

  const contentBoxHtml = showContent
    ? `<div class="ss-export-box">
        <div class="ss-export-box-header">
          <span class="ss-export-section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="5" y="3.5" width="14" height="17" rx="2.2" stroke="currentColor" stroke-width="2"/>
              <path d="M8.5 8.5H15.5M8.5 12H15.5M8.5 15.5H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <h4 class="ss-export-section-title">NỘI DUNG BUỔI HỌC</h4>
        </div>
        <div class="ss-export-box-body">${
          data.lessonTitle
            ? `<div class="ss-export-lesson-title">${escapeHtml(data.lessonTitle)}</div>`
            : ''
        }${escapeHtml(data.content)}</div>
      </div>`
    : '';

  const homeworkBoxHtml = showHomework
    ? `<div class="ss-export-box">
        <div class="ss-export-box-header">
          <span class="ss-export-section-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 10.5L12 4L20 10.5V19A1.5 1.5 0 0 1 18.5 20.5H5.5A1.5 1.5 0 0 1 4 19V10.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <path d="M9.5 20.5V14H14.5V20.5" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </span>
          <h4 class="ss-export-section-title">BÀI TẬP VỀ NHÀ</h4>
        </div>
        <div class="ss-export-box-body">${escapeHtml(data.homeworkContent)}</div>
      </div>`
    : '';

  const twoColHtml =
    showContent || showHomework
      ? `<div class="ss-export-two-col ${
          showContent && showHomework ? '' : 'is-single-col'
        }">${contentBoxHtml}${homeworkBoxHtml}</div>`
      : '';

  let studentsSectionHtml = '';
  if (showStudentsSection) {
    const cardsHtml = data.students
      .map((stu) => {
        const rows: string[] = [];
        if (showHwPct && stu.homeworkPercent) {
          rows.push(
            `<div class="ss-export-student-row"><span class="ss-export-student-key">BTVN:</span><span class="ss-export-student-val">${escapeHtml(
              stu.homeworkPercent
            )}</span></div>`
          );
        }
        if (showAttitude && stu.attitude) {
          rows.push(
            `<div class="ss-export-student-row"><span class="ss-export-student-key">Ý thức:</span><span class="ss-export-student-val">${escapeHtml(
              stu.attitude
            )}</span></div>`
          );
        }
        if (showScores && stu.scoreText) {
          rows.push(
            `<div class="ss-export-student-row"><span class="ss-export-student-key">Điểm:</span><span class="ss-export-student-val">${escapeHtml(
              stu.scoreText
            )}</span></div>`
          );
        }
        if (showComment && stu.comment) {
          rows.push(
            `<div class="ss-export-student-row"><span class="ss-export-student-key">Nhận xét:</span><span class="ss-export-student-val">${escapeHtml(
              stu.comment
            )}</span></div>`
          );
        }
        if (showNote && stu.note) {
          rows.push(
            `<div class="ss-export-student-row"><span class="ss-export-student-key">Ghi chú:</span><span class="ss-export-student-val">${escapeHtml(
              stu.note
            )}</span></div>`
          );
        }
        if (rows.length === 0) {
          rows.push(
            `<div class="ss-export-student-row"><span class="ss-export-student-key">Nhận xét:</span><span class="ss-export-student-val">Có mặt đầy đủ.</span></div>`
          );
        }
        return `<div class="ss-export-student-card">
          <div class="ss-export-student-top">
            <span class="ss-export-student-badge">${stu.index}</span>
            <strong class="ss-export-student-name">${escapeHtml(stu.name)}</strong>
          </div>
          <div class="ss-export-student-details">
            ${rows.join('')}
          </div>
        </div>`;
      })
      .join('');

    studentsSectionHtml = `<div class="ss-export-students-section">
      <div class="ss-export-box-header">
        <span class="ss-export-section-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 20C16.9706 20 21 16.4183 21 12C21 7.58172 16.9706 4 12 4C7.02944 4 3 7.58172 3 12C3 13.7825 3.65609 15.429 4.76821 16.7602L3.5 20L7.52269 18.9273C8.86737 19.6124 10.391 20 12 20Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
            <path d="M8.5 10.5H15.5M8.5 13.5H13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </span>
        <h4 class="ss-export-section-title">NHẬN XÉT HỌC SINH</h4>
        <span class="ss-export-section-line" aria-hidden="true"></span>
      </div>
      <div class="ss-export-students-grid">
        ${cardsHtml}
      </div>
    </div>`;
  }

  return `<div class="ss-export-sheet" id="sessionSummaryExportCard">
    <div class="ss-export-header">
      <h2 class="ss-export-title">NỘI DUNG BUỔI HỌC</h2>
      <div class="ss-export-subtitle-row">
        <span class="ss-export-subtitle-line" aria-hidden="true"></span>
        <span class="ss-export-subtitle">${escapeHtml(data.sessionName)}</span>
        <span class="ss-export-subtitle-line" aria-hidden="true"></span>
      </div>
    </div>
    ${bannerHtml}
    ${twoColHtml}
    ${studentsSectionHtml}
  </div>`;
}

function renderSessionSummaryExportLivePreview(): void {
  const stage = document.getElementById('sessionSummaryExportPreviewStage');
  const submitBtn = document.getElementById(
    'sessionSummaryExportSubmit'
  ) as HTMLButtonElement | null;
  const copyBtn = document.getElementById(
    'copySessionSummaryImageBtn'
  ) as HTMLButtonElement | null;

  if (!stage || !currentSessionExportData) return;

  const hasAnyChecked = currentSessionExportChecked.size > 0;
  if (submitBtn) submitBtn.disabled = !hasAnyChecked;
  if (copyBtn) copyBtn.disabled = !hasAnyChecked;

  stage.innerHTML = renderSessionSummaryCardHtml(
    currentSessionExportData,
    currentSessionExportChecked
  );
}

// =========================================================
// BỘ DỰNG CANVAS 2D ĐỘ PHÂN GIẢI CAO (2X RETINA PNG)
// =========================================================

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const rawParagraphs = (text || '').replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];

  for (const para of rawParagraphs) {
    const trimmedRight = para.trimEnd();
    if (!trimmedRight) {
      lines.push('');
      continue;
    }
    const words = trimmedRight.split(/\s+/);
    let currentLine = '';
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !currentLine) {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

function drawVectorIcon(
  ctx: CanvasRenderingContext2D,
  type: 'calendar' | 'clock' | 'doc' | 'home' | 'chat',
  cx: number,
  cy: number,
  strokeColor: string
): void {
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'calendar') {
    drawRoundedRectPath(ctx, cx - 8.5, cy - 7, 17, 15.5, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 8.5);
    ctx.lineTo(cx - 4, cy - 5.5);
    ctx.moveTo(cx + 4, cy - 8.5);
    ctx.lineTo(cx + 4, cy - 5.5);
    ctx.moveTo(cx - 8.5, cy - 2.5);
    ctx.lineTo(cx + 8.5, cy - 2.5);
    ctx.stroke();
  } else if (type === 'clock') {
    ctx.beginPath();
    ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4.5);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + 3, cy + 2);
    ctx.stroke();
  } else if (type === 'doc') {
    drawRoundedRectPath(ctx, cx - 6.5, cy - 8, 13, 16, 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 3.2, cy - 3.2);
    ctx.lineTo(cx + 3.2, cy - 3.2);
    ctx.moveTo(cx - 3.2, cy + 0.2);
    ctx.lineTo(cx + 3.2, cy + 0.2);
    ctx.moveTo(cx - 3.2, cy + 3.6);
    ctx.lineTo(cx + 1.2, cy + 3.6);
    ctx.stroke();
  } else if (type === 'home') {
    ctx.beginPath();
    ctx.moveTo(cx - 7.5, cy - 1);
    ctx.lineTo(cx, cy - 7.5);
    ctx.lineTo(cx + 7.5, cy - 1);
    ctx.lineTo(cx + 7.5, cy + 6.5);
    ctx.arcTo(cx + 7.5, cy + 8, cx + 6, cy + 8, 1.5);
    ctx.lineTo(cx - 6, cy + 8);
    ctx.arcTo(cx - 7.5, cy + 8, cx - 7.5, cy + 6.5, 1.5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 2.3, cy + 8);
    ctx.lineTo(cx - 2.3, cy + 2.2);
    ctx.lineTo(cx + 2.3, cy + 2.2);
    ctx.lineTo(cx + 2.3, cy + 8);
    ctx.stroke();
  } else if (type === 'chat') {
    ctx.beginPath();
    ctx.ellipse(cx, cy - 0.5, 8.2, 6.8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy - 2);
    ctx.lineTo(cx + 3.5, cy - 2);
    ctx.moveTo(cx - 3.5, cy + 1.2);
    ctx.lineTo(cx + 1.5, cy + 1.2);
    ctx.stroke();
  }

  ctx.restore();
}

async function renderSessionSummaryCanvas(
  data: SessionSummaryExportData,
  checked: Set<SessionSummaryExportSectionKey>
): Promise<HTMLCanvasElement> {
  if (document.fonts) {
    try {
      await Promise.all([
        document.fonts.load('500 14px "Roboto"'),
        document.fonts.load('700 16px "Roboto"'),
      ]);
      if (document.fonts.ready) {
        await document.fonts.ready;
      }
    } catch {
      // ignore
    }
  }

  const fontFamily = '"Roboto", sans-serif';
  const scale = 2; // 2x Retina
  const W = 960;
  const outerPad = 14;
  const cardX = outerPad;
  const cardY = outerPad;
  const cardW = W - outerPad * 2; // 932
  const innerPadX = 34;
  const innerPadY = 32;
  const contentX = cardX + innerPadX;
  const contentW = cardW - innerPadX * 2; // 864

  const showSchedule = checked.has('schedule');
  const showContent = checked.has('content') && Boolean(data.lessonTitle || data.content);
  const showHomework = checked.has('homeworkContent') && Boolean(data.homeworkContent);
  const showHwPct = checked.has('homeworkPercent');
  const showAttitude = checked.has('attitude');
  const showComment = checked.has('comment');
  const showScores = checked.has('scores');
  const showNote = checked.has('note');
  const showStudentsSection =
    data.students.length > 0 &&
    (showHwPct || showAttitude || showComment || showScores || showNote);

  // Use a scratch context to measure text wrapping accurately
  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;

  const lineH = 23;
  const colGap = 18;
  const twoColActive = showContent && showHomework;
  const boxW = twoColActive ? (contentW - colGap) / 2 : contentW;
  const boxTextW = boxW - 40;

  mctx.font = `700 14px ${fontFamily}`;
  const lessonTitleLines =
    showContent && data.lessonTitle
      ? wrapCanvasTextLines(mctx, data.lessonTitle, boxTextW)
      : [];

  mctx.font = `500 14px ${fontFamily}`;
  const contentLines =
    showContent && data.content ? wrapCanvasTextLines(mctx, data.content, boxTextW) : [];
  const homeworkLines =
    showHomework && data.homeworkContent
      ? wrapCanvasTextLines(mctx, data.homeworkContent, boxTextW)
      : [];

  const contentBodyH =
    (lessonTitleLines.length > 0 ? lessonTitleLines.length * lineH + 4 : 0) +
    contentLines.length * lineH;
  const homeworkBodyH = homeworkLines.length * lineH;
  const middleBoxH =
    showContent || showHomework
      ? Math.max(
          showContent ? 66 + contentBodyH + 20 : 0,
          showHomework ? 66 + homeworkBodyH + 20 : 0,
          126
        )
      : 0;

  // Measure student cards
  const stuGridPadX = 22;
  const stuGridGap = 16;
  const stuSectionInnerW = contentW - stuGridPadX * 2;
  const stuCardW = (stuSectionInnerW - stuGridGap) / 2;
  const stuKeyW = 78;
  const stuValMaxW = stuCardW - 18 * 2 - 35 - stuKeyW;
  const stuLineH = 21;

  interface MeasuredStudentRow {
    key: string;
    lines: string[];
    height: number;
  }
  interface MeasuredStudentCard {
    stu: SessionSummaryStudentExportItem;
    rows: MeasuredStudentRow[];
    cardHeight: number;
  }

  mctx.font = `500 13.5px ${fontFamily}`;
  const measuredStudents: MeasuredStudentCard[] = data.students.map((stu) => {
    const rawPairs: Array<{ key: string; val: string }> = [];
    if (showHwPct && stu.homeworkPercent) {
      rawPairs.push({ key: 'BTVN:', val: stu.homeworkPercent });
    }
    if (showAttitude && stu.attitude) {
      rawPairs.push({ key: 'Ý thức:', val: stu.attitude });
    }
    if (showScores && stu.scoreText) {
      rawPairs.push({ key: 'Điểm:', val: stu.scoreText });
    }
    if (showComment && stu.comment) {
      rawPairs.push({ key: 'Nhận xét:', val: stu.comment });
    }
    if (showNote && stu.note) {
      rawPairs.push({ key: 'Ghi chú:', val: stu.note });
    }
    if (rawPairs.length === 0) {
      rawPairs.push({ key: 'Nhận xét:', val: 'Có mặt đầy đủ.' });
    }

    const rows: MeasuredStudentRow[] = rawPairs.map((pair) => {
      const wrapped = wrapCanvasTextLines(mctx, pair.val, stuValMaxW);
      return {
        key: pair.key,
        lines: wrapped,
        height: wrapped.length * stuLineH,
      };
    });

    const detailsH =
      rows.reduce((sum, r) => sum + r.height, 0) + Math.max(0, rows.length - 1) * 7;
    const cardHeight = 16 + 28 + 10 + detailsH + 16;
    return { stu, rows, cardHeight };
  });

  // Group student cards into 2-column rows
  const stuRowHeights: number[] = [];
  for (let i = 0; i < measuredStudents.length; i += 2) {
    const h1 = measuredStudents[i].cardHeight;
    const h2 = i + 1 < measuredStudents.length ? measuredStudents[i + 1].cardHeight : 0;
    stuRowHeights.push(Math.max(h1, h2));
  }

  const stuCardsTotalH =
    stuRowHeights.reduce((a, b) => a + b, 0) + Math.max(0, stuRowHeights.length - 1) * stuGridGap;
  const studentsSectionH = showStudentsSection ? 20 + 34 + 16 + stuCardsTotalH + 22 : 0;

  // Compute total height
  let curY = cardY + innerPadY;
  const headerH = 68;
  curY += headerH + 20;

  const bannerY = curY;
  const bannerH = showSchedule ? 72 : 0;
  if (showSchedule) curY += bannerH + 20;

  const middleY = curY;
  if (showContent || showHomework) curY += middleBoxH + 20;

  const studentsSectionY = curY;
  if (showStudentsSection) curY += studentsSectionH;

  const cardH = curY - cardY + innerPadY;
  const H = cardH + outerPad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Outer canvas background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Main rounded card border
  drawRoundedRectPath(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E5C8D3';
  ctx.stroke();

  // 1. Header: Title + Subtitle with flanking lines
  const centerX = W / 2;
  ctx.fillStyle = '#922F56';
  ctx.font = `700 30px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('NỘI DUNG BUỔI HỌC', centerX, cardY + innerPadY);

  const subY = cardY + innerPadY + 42;
  ctx.font = `700 16px ${fontFamily}`;
  ctx.fillStyle = '#7D4E60';
  const subText = data.sessionName || 'Tiếng Anh 2';
  const subTextW = ctx.measureText(subText).width;
  ctx.fillText(subText, centerX, subY);

  const lineLen = 96;
  const lineGap = 14;
  const lineMidY = subY + 9;
  ctx.strokeStyle = '#E2C6D0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX - subTextW / 2 - lineGap - lineLen, lineMidY);
  ctx.lineTo(centerX - subTextW / 2 - lineGap, lineMidY);
  ctx.moveTo(centerX + subTextW / 2 + lineGap, lineMidY);
  ctx.lineTo(centerX + subTextW / 2 + lineGap + lineLen, lineMidY);
  ctx.stroke();

  // 2. Schedule Banner
  if (showSchedule) {
    drawRoundedRectPath(ctx, contentX, bannerY, contentW, bannerH, 16);
    const grad = ctx.createLinearGradient(contentX, bannerY, contentX + contentW, bannerY);
    grad.addColorStop(0, '#8A284F');
    grad.addColorStop(1, '#9E3862');
    ctx.fillStyle = grad;
    ctx.fill();

    // Vertical divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX, bannerY + 15);
    ctx.lineTo(centerX, bannerY + bannerH - 15);
    ctx.stroke();

    // Left item: NGÀY DẠY
    const leftIconCx = contentX + 28 + 19;
    const iconCy = bannerY + bannerH / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(leftIconCx, iconCy, 19, 0, Math.PI * 2);
    ctx.fill();
    drawVectorIcon(ctx, 'calendar', leftIconCx, iconCy, '#922F56');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `600 11px ${fontFamily}`;
    ctx.fillText('NGÀY DẠY', leftIconCx + 19 + 14, bannerY + 18);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 17px ${fontFamily}`;
    ctx.fillText(data.dateFormatted, leftIconCx + 19 + 14, bannerY + 35);

    // Right item: GIỜ DẠY
    const rightIconCx = centerX + 28 + 19;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(rightIconCx, iconCy, 19, 0, Math.PI * 2);
    ctx.fill();
    drawVectorIcon(ctx, 'clock', rightIconCx, iconCy, '#922F56');

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = `600 11px ${fontFamily}`;
    ctx.fillText('GIỜ DẠY', rightIconCx + 19 + 14, bannerY + 18);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `700 17px ${fontFamily}`;
    ctx.fillText(data.timeRangeFormatted, rightIconCx + 19 + 14, bannerY + 35);
  }

  // 3. Middle Boxes (NỘI DUNG BUỔI HỌC & BÀI TẬP VỀ NHÀ)
  const drawMiddleBox = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    iconType: 'doc' | 'home',
    heading: string,
    boldLines: string[],
    bodyLines: string[]
  ) => {
    drawRoundedRectPath(ctx, bx, by, bw, bh, 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#E5CFD7';
    ctx.stroke();

    const icx = bx + 20 + 17;
    const icy = by + 18 + 17;
    ctx.fillStyle = '#922F56';
    ctx.beginPath();
    ctx.arc(icx, icy, 17, 0, Math.PI * 2);
    ctx.fill();
    drawVectorIcon(ctx, iconType, icx, icy, '#FFFFFF');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#922F56';
    ctx.font = `700 15px ${fontFamily}`;
    ctx.fillText(heading, icx + 17 + 10, icy + 1);

    let ty = by + 18 + 34 + 14;
    ctx.textBaseline = 'top';
    if (boldLines.length > 0) {
      ctx.fillStyle = '#3A2A31';
      ctx.font = `700 14px ${fontFamily}`;
      for (const bl of boldLines) {
        ctx.fillText(bl, bx + 20, ty);
        ty += lineH;
      }
      ty += 4;
    }

    ctx.fillStyle = '#493840';
    ctx.font = `500 14px ${fontFamily}`;
    for (const ln of bodyLines) {
      ctx.fillText(ln, bx + 20, ty);
      ty += lineH;
    }
  };

  if (showContent && showHomework) {
    drawMiddleBox(
      contentX,
      middleY,
      boxW,
      middleBoxH,
      'doc',
      'NỘI DUNG BUỔI HỌC',
      lessonTitleLines,
      contentLines
    );
    drawMiddleBox(
      contentX + boxW + colGap,
      middleY,
      boxW,
      middleBoxH,
      'home',
      'BÀI TẬP VỀ NHÀ',
      [],
      homeworkLines
    );
  } else if (showContent) {
    drawMiddleBox(
      contentX,
      middleY,
      boxW,
      middleBoxH,
      'doc',
      'NỘI DUNG BUỔI HỌC',
      lessonTitleLines,
      contentLines
    );
  } else if (showHomework) {
    drawMiddleBox(
      contentX,
      middleY,
      boxW,
      middleBoxH,
      'home',
      'BÀI TẬP VỀ NHÀ',
      [],
      homeworkLines
    );
  }

  // 4. Students Section (NHẬN XÉT HỌC SINH)
  if (showStudentsSection) {
    drawRoundedRectPath(ctx, contentX, studentsSectionY, contentW, studentsSectionH, 16);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#E5CFD7';
    ctx.stroke();

    const secIcx = contentX + stuGridPadX + 17;
    const secIcy = studentsSectionY + 20 + 17;
    ctx.fillStyle = '#922F56';
    ctx.beginPath();
    ctx.arc(secIcx, secIcy, 17, 0, Math.PI * 2);
    ctx.fill();
    drawVectorIcon(ctx, 'chat', secIcx, secIcy, '#FFFFFF');

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#922F56';
    ctx.font = `700 15px ${fontFamily}`;
    const secTitle = 'NHẬN XÉT HỌC SINH';
    const secTitleX = secIcx + 17 + 10;
    ctx.fillText(secTitle, secTitleX, secIcy + 1);

    const secTitleW = ctx.measureText(secTitle).width;
    ctx.strokeStyle = '#EBD8DF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(secTitleX + secTitleW + 14, secIcy);
    ctx.lineTo(contentX + contentW - stuGridPadX, secIcy);
    ctx.stroke();

    let rowTopY = studentsSectionY + 20 + 34 + 16;
    for (let r = 0; r < stuRowHeights.length; r++) {
      const rowH = stuRowHeights[r];
      for (let c = 0; c < 2; c++) {
        const idx = r * 2 + c;
        if (idx >= measuredStudents.length) break;
        const item = measuredStudents[idx];
        const scX = contentX + stuGridPadX + c * (stuCardW + stuGridGap);
        const scY = rowTopY;

        drawRoundedRectPath(ctx, scX, scY, stuCardW, rowH, 14);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#EAD8DF';
        ctx.stroke();

        // Badge + Student Name
        const badgeCx = scX + 18 + 14;
        const badgeCy = scY + 16 + 14;
        ctx.fillStyle = '#F6E5EC';
        ctx.beginPath();
        ctx.arc(badgeCx, badgeCy, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#922F56';
        ctx.font = `700 13px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item.stu.index), badgeCx, badgeCy + 0.5);

        ctx.fillStyle = '#3A2A31';
        ctx.font = `700 15px ${fontFamily}`;
        ctx.textAlign = 'left';
        ctx.fillText(item.stu.name, badgeCx + 14 + 10, badgeCy + 0.5);

        // Dotted vertical line on left of details
        const detailsTopY = scY + 16 + 28 + 10;
        const detailsBottomY = scY + rowH - 16;
        const dottedX = scX + 18 + 13;
        ctx.save();
        ctx.strokeStyle = '#DFC5CF';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3.5]);
        ctx.beginPath();
        ctx.moveTo(dottedX, detailsTopY);
        ctx.lineTo(dottedX, detailsBottomY);
        ctx.stroke();
        ctx.restore();

        // Key-value rows
        let detailY = detailsTopY;
        const keyX = dottedX + 22;
        const valX = keyX + stuKeyW;
        ctx.textBaseline = 'top';
        for (const row of item.rows) {
          ctx.fillStyle = '#922F56';
          ctx.font = `700 13.5px ${fontFamily}`;
          ctx.fillText(row.key, keyX, detailY);

          ctx.fillStyle = '#493840';
          ctx.font = `500 13.5px ${fontFamily}`;
          for (let li = 0; li < row.lines.length; li++) {
            ctx.fillText(row.lines[li], valX, detailY + li * stuLineH);
          }
          detailY += row.height + 7;
        }
      }
      rowTopY += rowH + stuGridGap;
    }
  }

  return canvas;
}

function slugifyFileName(str: string): string {
  return (str || 'buoi-hoc')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function bindSessionSummaryExportModalEvents(): void {
  const modal = document.getElementById('sessionSummaryExportModal');
  if (!modal) return;

  // Individual checkbox or Select All toggle
  modal.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (!currentSessionExportData) return;

    if (target.id === 'sessionSummaryExportSelectAll') {
      const availableKeys = getAvailableExportSectionKeys(currentSessionExportData);
      if (target.checked) {
        currentSessionExportChecked = new Set(availableKeys);
      } else {
        currentSessionExportChecked.clear();
      }
      renderSessionSummaryExportOptionsUI(availableKeys);
      renderSessionSummaryExportLivePreview();
      return;
    }

    const sectionKey = target.dataset.sessionExportKey as
      | SessionSummaryExportSectionKey
      | undefined;
    if (sectionKey) {
      if (target.checked) {
        currentSessionExportChecked.add(sectionKey);
      } else {
        currentSessionExportChecked.delete(sectionKey);
      }
      const availableKeys = getAvailableExportSectionKeys(currentSessionExportData);
      const selectAllInput = document.getElementById(
        'sessionSummaryExportSelectAll'
      ) as HTMLInputElement | null;
      if (selectAllInput) {
        selectAllInput.checked =
          availableKeys.length > 0 &&
          availableKeys.every((k) => currentSessionExportChecked.has(k));
      }
      renderSessionSummaryExportLivePreview();
    }
  });

  // Save preferences for next time
  document.getElementById('saveSessionSummaryExportPrefsBtn')?.addEventListener('click', () => {
    const arr = Array.from(currentSessionExportChecked);
    try {
      localStorage.setItem(SESSION_EXPORT_PREFS_STORAGE_KEY, JSON.stringify(arr));
      const hint = document.getElementById('sessionSummaryExportSaveHint');
      if (hint) {
        hint.textContent = 'Đã lưu lựa chọn mặc định cho các lần xuất tiếp theo.';
      }
      showToast('Đã lưu thiết lập mục xuất cho lần sau.');
    } catch {
      showToast('Không thể lưu thiết lập.', 'error');
    }
  });

  // Copy PNG image to clipboard
  document.getElementById('copySessionSummaryImageBtn')?.addEventListener('click', async () => {
    if (!currentSessionExportData || currentSessionExportChecked.size === 0) return;
    const btn = document.getElementById('copySessionSummaryImageBtn') as HTMLButtonElement | null;
    const origText = btn?.textContent || 'Sao chép ảnh';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Đang tạo ảnh...';
    }
    try {
      const canvas = await renderSessionSummaryCanvas(
        currentSessionExportData,
        currentSessionExportChecked
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );
      if (
        blob &&
        navigator.clipboard &&
        typeof navigator.clipboard.write === 'function' &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Đã sao chép ảnh nội dung buổi học vào bộ nhớ tạm!');
      } else {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `noi-dung-buoi-hoc-${slugifyFileName(
          currentSessionExportData.sessionName
        )}-${currentSessionExportData.dateIso}.png`;
        a.click();
        showToast('Trình duyệt không hỗ trợ copy trực tiếp, đã tải file ảnh PNG.');
      }
    } catch {
      showToast('Không thể sao chép ảnh vào bộ nhớ tạm.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  });

  // Export / Download PNG image
  document.getElementById('sessionSummaryExportSubmit')?.addEventListener('click', async () => {
    if (!currentSessionExportData || currentSessionExportChecked.size === 0) return;
    const btn = document.getElementById('sessionSummaryExportSubmit') as HTMLButtonElement | null;
    const origText = btn?.textContent || 'Xuất nội dung';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Đang xuất ảnh...';
    }
    try {
      const canvas = await renderSessionSummaryCanvas(
        currentSessionExportData,
        currentSessionExportChecked
      );
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `noi-dung-buoi-hoc-${slugifyFileName(
        currentSessionExportData.sessionName
      )}-${currentSessionExportData.dateIso}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast('Đã xuất ảnh nội dung buổi học thành công!');
    } catch {
      showToast('Đã xảy ra lỗi khi xuất ảnh nội dung buổi học.', 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  });
}
