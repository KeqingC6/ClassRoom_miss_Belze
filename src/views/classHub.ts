import { store } from '../store';
import type { BillingMode, ClassGroup, Student } from '../types';
import {
  closeModal,
  downloadCsv,
  escapeHtml,
  formatDateDMY,
  formatMoney,
  formatMonthLabel,
  generateId,
  getVietDayFull,
  openModal,
  parseMoneyInput,
  showToast,
} from '../utils';
import { openInvoiceModal } from './tuition';

let selectedHubClassKey = 'tieng anh 2';
let activeHubTab: 'students' | 'details' = 'students';
let studentSearchQuery = '';
let isSelectionMode = false;
const selectedStudentIds = new Set<string>();
let selectedCalendarDate = '2026-10-03';
let selectedRevenueRange: '3' | '6' | '12' | 'all' = '6';

function ensureValidClassSelection(): ClassGroup | undefined {
  const state = store.getState();
  let cls = store.getClassByKey(selectedHubClassKey);
  if (!cls && state.classes.length > 0) {
    cls = state.classes[0];
    selectedHubClassKey = cls.id;
  }
  return cls;
}

function getBillingModeLabel(mode: BillingMode): string {
  switch (mode) {
    case 'session':
      return 'Thu theo buổi';
    case 'hour':
      return 'Thu theo giờ';
    case 'course':
      return 'Thu theo khóa';
    case 'month':
    default:
      return 'Thu theo tháng';
  }
}

function getFeeUnitSuffix(mode: BillingMode): string {
  switch (mode) {
    case 'session':
      return '₫/buổi';
    case 'hour':
      return '₫/giờ';
    case 'course':
      return '₫/khóa';
    case 'month':
    default:
      return '₫/tháng';
  }
}

export function renderClassHubView(): void {
  const state = store.getState();
  const root = document.getElementById('studentClassHubRoot');
  if (!root) return;

  const activeCls = ensureValidClassSelection();

  // 1. Render Sidebar Class List (`[data-hub-class-list]`)
  const classListEl = root.querySelector<HTMLElement>('[data-hub-class-list]');
  if (classListEl) {
    classListEl.innerHTML = state.classes
      .map((c) => {
        const count = state.students.filter(
          (s) =>
            !s.isFormer &&
            s.classIds.some((cid) => cid.toLowerCase() === c.id.toLowerCase())
        ).length;
        const selected = activeCls && c.id.toLowerCase() === activeCls.id.toLowerCase();
        const feeLabel = formatMoney(c.fee, getFeeUnitSuffix(c.billingMode));
        return `<button type="button" class="student-class-hub-class ${
          selected ? 'is-selected' : ''
        }" data-hub-class="${escapeHtml(c.id)}">
          <i style="--hub-class-color:${escapeHtml(c.color || '#B0E0FF')}" aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(c.name)}</strong>
            <small><span>${escapeHtml(feeLabel)}</span><span>${count} học sinh</span></small>
          </span>
          <b aria-hidden="true">›</b>
        </button>`;
      })
      .join('');
  }

  // 2. Render Former students section if any
  const formerSection = root.querySelector<HTMLElement>('[data-hub-former-section]');
  const formerStudents = state.students.filter((s) => s.isFormer);
  if (formerSection) {
    if (formerStudents.length === 0) {
      formerSection.setAttribute('hidden', '');
    } else {
      formerSection.removeAttribute('hidden');
      formerSection.innerHTML = `<h4 style="font-size:12px;margin:10px 0 6px;color:var(--text-muted)">Học sinh đã nghỉ (${
        formerStudents.length
      })</h4>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${formerStudents
          .map(
            (s) =>
              `<button type="button" class="btn btn-secondary btn-sm" style="justify-content:space-between" data-hub-action="edit-student" data-student-id="${escapeHtml(
                s.id
              )}"><span>${escapeHtml(s.name)}</span><small>${formatDateDMY(
                s.endDate
              )}</small></button>`
          )
          .join('')}
      </div>`;
    }
  }

  if (!activeCls) return;

  // 3. Render Main Class Heading
  const mainEl = root.querySelector<HTMLElement>('[data-hub-main]');
  if (mainEl) {
    mainEl.style.setProperty('--hub-selected-color', activeCls.color || '#B0E0FF');
  }
  const colorIcon = root.querySelector<HTMLElement>('[data-hub-class-color]');
  if (colorIcon) {
    colorIcon.style.setProperty('--hub-class-color', activeCls.color || '#B0E0FF');
  }
  const classNameEl = root.querySelector<HTMLElement>('[data-hub-class-name]');
  const subjectEl = root.querySelector<HTMLElement>('[data-hub-class-subject]');
  const billingEl = root.querySelector<HTMLElement>('[data-hub-class-billing]');
  const countEls = root.querySelectorAll<HTMLElement>(
    '[data-hub-student-count], [data-hub-student-tab-count]'
  );

  const classStudents = state.students.filter(
    (s) =>
      !s.isFormer &&
      s.classIds.some((cid) => cid.toLowerCase() === activeCls.id.toLowerCase())
  );

  if (classNameEl) classNameEl.textContent = activeCls.name;
  if (subjectEl) subjectEl.textContent = activeCls.subject || 'Môn học';
  if (billingEl) billingEl.textContent = getBillingModeLabel(activeCls.billingMode);
  countEls.forEach((el) => (el.textContent = String(classStudents.length)));

  // 4. Tabs state (`students` vs `details`)
  root.querySelectorAll<HTMLElement>('[data-hub-tab]').forEach((btn) => {
    const isAct = btn.dataset.hubTab === activeHubTab;
    btn.classList.toggle('is-active', isAct);
  });
  const studentsPanel = root.querySelector<HTMLElement>('[data-hub-panel="students"]');
  const detailsPanel = root.querySelector<HTMLElement>('[data-hub-panel="details"]');
  if (studentsPanel) {
    if (activeHubTab === 'students') studentsPanel.removeAttribute('hidden');
    else studentsPanel.setAttribute('hidden', '');
  }
  if (detailsPanel) {
    if (activeHubTab === 'details') detailsPanel.removeAttribute('hidden');
    else detailsPanel.setAttribute('hidden', '');
  }

  // 5. Render Students Tab
  renderStudentsTab(root, activeCls, classStudents);

  // 6. Render Details Tab
  if (detailsPanel) {
    renderClassDetailsTab(detailsPanel, activeCls, classStudents);
  }
}

function renderStudentsTab(
  root: HTMLElement,
  activeCls: ClassGroup,
  classStudents: Student[]
): void {
  const state = store.getState();
  const colPrefs = {
    ...state.preferences.hubColumns,
    select: isSelectionMode || state.preferences.hubColumns.select,
  };

  // Sync column checkboxes
  root.querySelectorAll<HTMLInputElement>('[data-hub-column-toggle]').forEach((cb) => {
    const k = cb.dataset.hubColumnToggle || '';
    cb.checked = Boolean(colPrefs[k]);
  });

  // Update selection buttons
  const selectBtn = root.querySelector<HTMLElement>('[data-hub-action="select-students"]');
  const deleteSelectedBtn = root.querySelector<HTMLElement>('[data-hub-action="delete-selected"]');
  if (selectBtn) {
    selectBtn.setAttribute('aria-pressed', String(isSelectionMode));
    selectBtn.textContent = isSelectionMode ? 'Bỏ chọn' : 'Chọn học sinh';
  }
  if (deleteSelectedBtn) {
    if (isSelectionMode && selectedStudentIds.size > 0) {
      deleteSelectedBtn.removeAttribute('hidden');
      deleteSelectedBtn.textContent = `Xóa đã chọn (${selectedStudentIds.size})`;
    } else {
      deleteSelectedBtn.setAttribute('hidden', '');
    }
  }

  const q = studentSearchQuery.trim().toLowerCase();
  const displayedStudents = q
    ? state.students.filter(
        (s) =>
          !s.isFormer &&
          (s.name.toLowerCase().includes(q) ||
            s.phone.toLowerCase().includes(q) ||
            s.school.toLowerCase().includes(q))
      )
    : classStudents;

  const tableHost = root.querySelector<HTMLElement>('[data-hub-student-table]');
  if (!tableHost) return;

  const feeSuffix = getFeeUnitSuffix(activeCls.billingMode);

  const rowsHtml = displayedStudents
    .map((stu, idx) => {
      const checked = selectedStudentIds.has(stu.id);
      const feeText = formatMoney(stu.basePrice || activeCls.fee, feeSuffix);
      return `<tr>
        <td data-hub-column="select" ${colPrefs.select ? '' : 'hidden'}>
          <input type="checkbox" data-hub-student-checkbox="${escapeHtml(stu.id)}" ${
        checked ? 'checked' : ''
      }>
        </td>
        <td data-hub-column="index" ${colPrefs.index !== false ? '' : 'hidden'}>${idx + 1}</td>
        <td data-hub-column="student" ${colPrefs.student !== false ? '' : 'hidden'}><strong>${escapeHtml(
        stu.name
      )}</strong></td>
        <td data-hub-column="school" ${colPrefs.school ? '' : 'hidden'}>${escapeHtml(
        stu.school || '-'
      )}</td>
        <td data-hub-column="dob" ${colPrefs.dob ? '' : 'hidden'}>${formatDateDMY(stu.dob)}</td>
        <td data-hub-column="startDate" ${colPrefs.startDate ? '' : 'hidden'}>${formatDateDMY(
        stu.startDate
      )}</td>
        <td data-hub-column="phone" ${colPrefs.phone ? '' : 'hidden'}>${escapeHtml(
        stu.phone || '-'
      )}</td>
        <td data-hub-column="note" ${colPrefs.note ? '' : 'hidden'}>${escapeHtml(
        stu.note || '-'
      )}</td>
        <td data-hub-column="fee" ${colPrefs.fee !== false ? '' : 'hidden'}>${escapeHtml(
        feeText
      )}</td>
        <td data-hub-column="actions" ${colPrefs.actions !== false ? '' : 'hidden'}>
          <div class="student-class-hub-row-actions">
            <button type="button" class="btn btn-primary btn-sm student-class-hub-export-trigger" data-hub-action="export-student" data-student-id="${escapeHtml(
              stu.id
            )}" title="Xuất phiếu">Xuất phiếu</button>
            <button type="button" class="btn btn-secondary btn-sm ui-action-icon" data-ui-action="edit" data-hub-action="edit-student" data-student-id="${escapeHtml(
              stu.id
            )}" title="Chỉnh sửa" aria-label="Chỉnh sửa ${escapeHtml(stu.name)}"></button>
          </div>
        </td>
      </tr>`;
    })
    .join('');

  const colTracks: string[] = [];
  const colMinExprs: string[] = [];
  if (colPrefs.select) {
    colTracks.push('minmax(48px,56px)');
    colMinExprs.push('48px');
  }
  if (colPrefs.index !== false) {
    colTracks.push('minmax(var(--hub-col-index-min),var(--hub-col-index-max))');
    colMinExprs.push('var(--hub-col-index-min)');
  }
  if (colPrefs.student !== false) {
    colTracks.push('minmax(var(--hub-col-student-min),1fr)');
    colMinExprs.push('var(--hub-col-student-min)');
  }
  if (colPrefs.school) {
    colTracks.push('minmax(130px,180px)');
    colMinExprs.push('130px');
  }
  if (colPrefs.dob) {
    colTracks.push('minmax(105px,125px)');
    colMinExprs.push('105px');
  }
  if (colPrefs.startDate) {
    colTracks.push('minmax(115px,135px)');
    colMinExprs.push('115px');
  }
  if (colPrefs.phone) {
    colTracks.push('minmax(115px,140px)');
    colMinExprs.push('115px');
  }
  if (colPrefs.note) {
    colTracks.push('minmax(140px,1fr)');
    colMinExprs.push('140px');
  }
  if (colPrefs.fee !== false) {
    colTracks.push('minmax(var(--hub-col-fee-min),var(--hub-col-fee-max))');
    colMinExprs.push('var(--hub-col-fee-min)');
  }
  if (colPrefs.actions !== false) {
    colTracks.push('minmax(var(--hub-col-actions-min),var(--hub-col-actions-max))');
    colMinExprs.push('var(--hub-col-actions-min)');
  }
  const hubTableStyle = `--hub-table-columns:${colTracks.join(
    ' '
  )};--hub-table-min-width:calc(${colMinExprs.join(
    ' + '
  )});--sidebar-table-min-width:538px;--sidebar-table-max-width:700px`;

  tableHost.innerHTML = `<div class="table-wrapper student-class-hub-table-wrap">
    <table class="custom-table sidebar-aware-table" style="${hubTableStyle}">
      <thead>
        <tr>
          <th data-hub-column="select" ${colPrefs.select ? '' : 'hidden'}>CHỌN</th>
          <th data-hub-column="index" ${colPrefs.index !== false ? '' : 'hidden'}>STT</th>
          <th data-hub-column="student" ${colPrefs.student !== false ? '' : 'hidden'}>HỌ VÀ TÊN</th>
          <th data-hub-column="school" ${colPrefs.school ? '' : 'hidden'}>TRƯỜNG HỌC</th>
          <th data-hub-column="dob" ${colPrefs.dob ? '' : 'hidden'}>NGÀY SINH</th>
          <th data-hub-column="startDate" ${colPrefs.startDate ? '' : 'hidden'}>NGÀY BẮT ĐẦU</th>
          <th data-hub-column="phone" ${colPrefs.phone ? '' : 'hidden'}>SĐT</th>
          <th data-hub-column="note" ${colPrefs.note ? '' : 'hidden'}>GHI CHÚ</th>
          <th data-hub-column="fee" ${colPrefs.fee !== false ? '' : 'hidden'}>HỌC PHÍ</th>
          <th data-hub-column="actions" ${colPrefs.actions !== false ? '' : 'hidden'}>THAO TÁC</th>
        </tr>
      </thead>
      <tbody>
        ${
          rowsHtml ||
          `<tr><td colspan="10" style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-muted)">Chưa có học sinh nào trong lớp.</td></tr>`
        }
      </tbody>
    </table>
  </div>`;
}

function renderClassDetailsTab(
  detailsPanel: HTMLElement,
  activeCls: ClassGroup,
  classStudents: Student[]
): void {
  const state = store.getState();
  const ym = state.selectedMonth || '2026-10';
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);

  // Class sessions in month
  const classSessions = state.sessions.filter(
    (s) =>
      s.classKey.toLowerCase() === activeCls.id.toLowerCase() &&
      s.date.startsWith(ym)
  );
  const totalHours = classSessions.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

  let totalClassTuition = 0;
  const studentTuitionRows = classStudents.map((stu, idx) => {
    const calc = store.calculateStudentTuitionForMonth(stu, activeCls, ym);
    totalClassTuition += calc.total;
    return `<tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(stu.name)}</td>
      <td data-hub-tuition-column="sessionCount">${calc.sessionCount}</td>
      <td data-hub-tuition-column="hours">${String(calc.totalHours).replace('.', ',')} giờ</td>
      <td>${formatMoney(calc.total)}</td>
    </tr>`;
  });

  // Build calendar grid for ym
  const firstDay = new Date(y, m - 1, 1);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const calButtons: string[] = [];
  for (let i = 0; i < startOffset; i++) {
    calButtons.push(`<div class="student-class-hub-calendar-day is-outside" aria-hidden="true"></div>`);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateIso = `${ym}-${String(d).padStart(2, '0')}`;
    const daySessions = classSessions.filter((s) => s.date === dateIso);
    const hasSession = daySessions.length > 0;
    const isSel = dateIso === selectedCalendarDate;
    const isToday = dateIso === '2026-10-30';
    calButtons.push(`<button type="button" class="student-class-hub-calendar-day ${
      hasSession ? 'has-session' : ''
    } ${isSel ? 'is-selected' : ''} ${
      isToday ? 'is-today' : ''
    }" data-hub-calendar-date="${dateIso}" aria-pressed="${isSel}">
      <span class="student-class-hub-calendar-day-number">${d}</span>
      ${
        hasSession
          ? `<span class="student-class-hub-calendar-dots" aria-hidden="true"><span class="student-class-hub-calendar-dot"></span></span>`
          : ''
      }
    </button>`);
  }

  const selectedDaySessions = classSessions.filter((s) => s.date === selectedCalendarDate);
  const selectedDayDetailsHtml =
    selectedDaySessions.length > 0
      ? selectedDaySessions
          .map(
            (s) =>
              `<div style="padding:8px 10px;border-radius:8px;background:var(--primary-soft);margin-top:6px;display:flex;justify-content:space-between;align-items:center">
                <div>
                  <strong>${escapeHtml(s.startTime)} - ${escapeHtml(s.endTime)}</strong>
                  <div style="font-size:12px">${escapeHtml(s.content || s.lessonTitle || s.name)}</div>
                </div>
                <span style="font-size:11px;font-weight:700">${s.studentIds.length} HS</span>
              </div>`
          )
          .join('')
      : `<p class="student-class-hub-calendar-empty">Chưa có buổi học trong ngày này.</p>`;

  const feeSuffix = getFeeUnitSuffix(activeCls.billingMode);

  detailsPanel.innerHTML = `<div class="student-class-hub-class-details">
    <div class="student-class-hub-details-content">
      <div class="student-class-hub-details-column student-class-hub-details-column-left">
        <section class="student-class-hub-details-card" style="--hub-class-color:${escapeHtml(
          activeCls.color || '#B0E0FF'
        )}">
          <h4 class="student-class-hub-section-heading">Thông tin lớp</h4>
          <dl class="student-class-hub-details-fee">
            <dt>Mức học phí</dt>
            <dd>${formatMoney(activeCls.fee, feeSuffix)}</dd>
          </dl>
          <dl class="student-class-hub-details-grid">
            <div><dt>Học sinh</dt><dd>${classStudents.length} học sinh</dd></div>
            <div><dt>Môn học</dt><dd>${escapeHtml(activeCls.subject)}</dd></div>
            <div><dt>Thời gian thu</dt><dd>${getBillingModeLabel(activeCls.billingMode)}</dd></div>
            <div><dt>Thời lượng một buổi</dt><dd>${activeCls.defaultDuration} giờ</dd></div>
            <div><dt>Thời gian bắt đầu</dt><dd>${formatDateDMY(activeCls.billingStartDate || '')}</dd></div>
            <div><dt>Thời gian kết thúc</dt><dd>${formatDateDMY(activeCls.billingEndDate || '')}</dd></div>
          </dl>
        </section>

        <section class="student-class-hub-calendar">
          <div class="student-class-hub-calendar-heading">
            <h4 class="student-class-hub-calendar-title">Lịch học ${formatMonthLabel(ym)}</h4>
          </div>
          <div class="student-class-hub-calendar-weekdays">
            <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span>CN</span>
          </div>
          <div class="student-class-hub-calendar-grid">${calButtons.join('')}</div>
          <div class="student-class-hub-calendar-details">
            <div class="student-class-hub-calendar-details-heading">
              <strong>${getVietDayFull(selectedCalendarDate)}</strong>
              <span class="student-class-hub-calendar-status">${
                selectedDaySessions.length > 0
                  ? `${selectedDaySessions.length} ca học`
                  : 'Chưa có buổi học'
              }</span>
            </div>
            <div class="student-class-hub-calendar-session-list">${selectedDayDetailsHtml}</div>
          </div>
        </section>
      </div>

      <div class="student-class-hub-details-column student-class-hub-details-column-right">
        <section class="student-class-hub-overview">
          <h4 class="student-class-hub-section-heading">Tổng quan ${formatMonthLabel(ym)}</h4>
          <div class="student-class-hub-overview-grid">
            <div><span>Số buổi</span><strong>${classSessions.length}</strong></div>
            <div><span>Số giờ</span><strong>${String(totalHours).replace('.', ',')} giờ</strong></div>
            <div><span>Học phí</span><strong>${formatMoney(totalClassTuition)}</strong></div>
          </div>
        </section>

        <section class="student-class-hub-tuition">
          <h4 class="student-class-hub-section-heading">Danh sách học phí của học viên</h4>
          <div class="student-class-hub-tuition-wrap">
            <table class="student-class-hub-tuition-table">
              <thead>
                <tr>
                  <th>STT</th>
                  <th>Họ và tên</th>
                  <th>Số buổi</th>
                  <th>Số giờ</th>
                  <th>Học phí</th>
                </tr>
              </thead>
              <tbody>${studentTuitionRows.join('')}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}

// Open Class Setup Modal (#classSetupModal) for create or edit
export function openClassSetupModal(editClassKey?: string): void {
  const modal = document.getElementById('classSetupModal');
  if (!modal) return;
  const existing = editClassKey ? store.getClassByKey(editClassKey) : undefined;
  modal.dataset.editingClassId = existing ? existing.id : '';

  const titleEl = modal.querySelector('.modal-title');
  if (titleEl) {
    titleEl.textContent = existing ? 'Chỉnh sửa lớp học' : 'Tạo lớp học';
  }

  const nameInput = document.getElementById('classSetupName') as HTMLInputElement | null;
  const colorInput = document.getElementById('classSetupColor') as HTMLInputElement | null;
  const subjectInput = document.getElementById('classSetupSubject') as HTMLInputElement | null;
  const durationInput = document.getElementById(
    'classSetupDefaultDuration'
  ) as HTMLInputElement | null;
  const billingSelect = document.getElementById(
    'classSetupBillingMode'
  ) as HTMLSelectElement | null;
  const feeInput = document.getElementById('classSetupFee') as HTMLInputElement | null;
  const startDateInput = document.getElementById(
    'classSetupBillingStartDate'
  ) as HTMLInputElement | null;
  const endDateInput = document.getElementById(
    'classSetupBillingEndDate'
  ) as HTMLInputElement | null;

  if (nameInput) nameInput.value = existing?.name || '';
  if (colorInput) colorInput.value = existing?.color || '#b0e0ff';
  if (subjectInput) subjectInput.value = existing?.subject || '';
  if (durationInput) durationInput.value = String(existing?.defaultDuration || 2);
  if (billingSelect) billingSelect.value = existing?.billingMode || 'month';
  if (feeInput)
    feeInput.value = (existing?.fee || 500000)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (startDateInput) startDateInput.value = existing?.billingStartDate || '2026-10-01';
  if (endDateInput) endDateInput.value = existing?.billingEndDate || '2026-10-31';

  openModal('classSetupModal');
}

// Open Add / Edit Student Modal (#addStudentModal)
export function openStudentModal(editStudentId?: string): void {
  const state = store.getState();
  const modal = document.getElementById('addStudentModal');
  if (!modal) return;

  const existing = editStudentId ? store.getStudentById(editStudentId) : undefined;
  modal.dataset.editingStudentId = existing ? existing.id : '';

  const titleEl = modal.querySelector('.modal-title');
  const saveBtn = document.getElementById('saveStudentBtn');
  if (titleEl) titleEl.textContent = existing ? 'Chỉnh Sửa Học Sinh' : 'Thêm Học Sinh Mới';
  if (saveBtn) saveBtn.textContent = existing ? 'Lưu thay đổi' : 'Thêm học sinh';

  const nameInput = document.getElementById('studentName') as HTMLInputElement | null;
  const dobInput = document.getElementById('studentDob') as HTMLInputElement | null;
  const phoneInput = document.getElementById('studentPhone') as HTMLInputElement | null;
  const schoolInput = document.getElementById('studentSchool') as HTMLInputElement | null;
  const noteInput = document.getElementById('studentNote') as HTMLTextAreaElement | null;
  const priceInput = document.getElementById('studentBasePrice') as HTMLInputElement | null;
  const startInput = document.getElementById('studentStartDate') as HTMLInputElement | null;
  const formerToggle = document.getElementById('studentFormerToggle') as HTMLInputElement | null;

  if (nameInput) nameInput.value = existing?.name || '';
  if (dobInput) dobInput.value = existing?.dob || '';
  if (phoneInput) phoneInput.value = existing?.phone || '';
  if (schoolInput) schoolInput.value = existing?.school || '';
  if (noteInput) noteInput.value = existing?.note || '';
  if (priceInput)
    priceInput.value = (existing?.basePrice || 500000)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (startInput) startInput.value = existing?.startDate || '2026-10-01';
  if (formerToggle) formerToggle.checked = Boolean(existing?.isFormer);

  // Render class membership checkboxes inside #studentClassMemberships
  const membershipsEl = document.getElementById('studentClassMemberships');
  const defaultClassIds = existing ? existing.classIds : [selectedHubClassKey];
  if (membershipsEl) {
    membershipsEl.innerHTML = state.classes
      .map((c) => {
        const checked = defaultClassIds.some(
          (cid) => cid.toLowerCase() === c.id.toLowerCase()
        );
        return `<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border-color);border-radius:8px;cursor:pointer">
          <input type="checkbox" name="studentClassMember" value="${escapeHtml(c.id)}" ${
          checked ? 'checked' : ''
        }>
          <span><strong>${escapeHtml(c.name)}</strong> (${formatMoney(
          c.fee,
          getFeeUnitSuffix(c.billingMode)
        )})</span>
        </label>`;
      })
      .join('');
  }

  openModal('addStudentModal');
}

export function bindClassHubEvents(): void {
  const root = document.getElementById('studentClassHubRoot');
  if (!root) return;

  // Search input
  const searchInput = root.querySelector<HTMLInputElement>('[data-hub-student-search]');
  searchInput?.addEventListener('input', () => {
    studentSearchQuery = searchInput.value;
    renderClassHubView();
  });

  // Column visibility toggles
  root.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.dataset.hubColumnToggle) {
      const k = target.dataset.hubColumnToggle;
      store.update((draft) => {
        draft.preferences.hubColumns[k] = target.checked;
      });
      return;
    }
    if (target.dataset.hubStudentCheckbox) {
      const sid = target.dataset.hubStudentCheckbox;
      if (target.checked) selectedStudentIds.add(sid);
      else selectedStudentIds.delete(sid);
      renderClassHubView();
    }
  });

  // Delegated clicks inside #studentClassHubRoot
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Select class in sidebar
    const clsBtn = target.closest<HTMLElement>('[data-hub-class]');
    if (clsBtn) {
      selectedHubClassKey = clsBtn.dataset.hubClass || '';
      renderClassHubView();
      return;
    }

    // Switch tab (`students` | `details`)
    const tabBtn = target.closest<HTMLElement>('[data-hub-tab]');
    if (tabBtn) {
      activeHubTab = (tabBtn.dataset.hubTab as 'students' | 'details') || 'students';
      renderClassHubView();
      return;
    }

    // Calendar day click in details tab
    const calDayBtn = target.closest<HTMLElement>('[data-hub-calendar-date]');
    if (calDayBtn) {
      selectedCalendarDate = calDayBtn.dataset.hubCalendarDate || '2026-10-03';
      renderClassHubView();
      return;
    }

    // Hub actions (`data-hub-action`)
    const actBtn = target.closest<HTMLElement>('[data-hub-action]');
    if (actBtn) {
      const action = actBtn.dataset.hubAction;
      if (action === 'create-class') {
        openClassSetupModal();
      } else if (action === 'edit-class') {
        openClassSetupModal(selectedHubClassKey);
      } else if (action === 'delete-class') {
        const cls = store.getClassByKey(selectedHubClassKey);
        if (!cls) return;
        const warn = document.getElementById('classDeleteConfirmModalWarning');
        if (warn) {
          warn.textContent = `Bạn có chắc chắn muốn xóa lớp "${cls.name}"? Các buổi học thuộc lớp này cũng sẽ bị gỡ.`;
        }
        openModal('classDeleteConfirmModal');
      } else if (action === 'create-student') {
        openStudentModal();
      } else if (action === 'edit-student') {
        openStudentModal(actBtn.dataset.studentId);
      } else if (action === 'export-student') {
        if (actBtn.dataset.studentId) {
          openInvoiceModal(actBtn.dataset.studentId);
        }
      } else if (action === 'select-students') {
        isSelectionMode = !isSelectionMode;
        if (!isSelectionMode) selectedStudentIds.clear();
        renderClassHubView();
      } else if (action === 'delete-selected') {
        if (selectedStudentIds.size === 0) return;
        const confirmBtn = document.getElementById('studentBulkDeleteConfirm');
        if (confirmBtn) {
          confirmBtn.textContent = `Xóa ${selectedStudentIds.size} học sinh`;
        }
        openModal('studentBulkDeleteModal');
      } else if (action === 'import') {
        openModal('studentImportModal');
      } else if (action === 'export') {
        const st = store.getState();
        const rows = st.students.map((s, i) => [
          i + 1,
          s.name,
          s.classIds.join('; '),
          s.phone,
          s.dob,
          s.school,
          s.basePrice,
          s.startDate,
          s.note,
        ]);
        downloadCsv(
          'danh-sach-hoc-sinh.csv',
          ['STT', 'Họ và tên', 'Lớp', 'SĐT', 'Ngày sinh', 'Trường học', 'Học phí', 'Ngày bắt đầu', 'Ghi chú'],
          rows
        );
        showToast('Đã xuất danh sách học sinh ra file CSV.');
      }
    }
  });

  // Class Setup Form Submit (#classSetupForm)
  const classSetupForm = document.getElementById('classSetupForm') as HTMLFormElement | null;
  classSetupForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const modal = document.getElementById('classSetupModal');
    const editingId = modal?.dataset.editingClassId || '';

    const name =
      (document.getElementById('classSetupName') as HTMLInputElement | null)?.value.trim() || '';
    if (!name) {
      showToast('Vui lòng nhập tên lớp học.', 'error');
      return;
    }
    const color =
      (document.getElementById('classSetupColor') as HTMLInputElement | null)?.value || '#B0E0FF';
    const subject =
      (document.getElementById('classSetupSubject') as HTMLInputElement | null)?.value.trim() ||
      name;
    const defaultDuration =
      parseFloat(
        (document.getElementById('classSetupDefaultDuration') as HTMLInputElement | null)?.value ||
          '2'
      ) || 2;
    const billingMode = ((
      document.getElementById('classSetupBillingMode') as HTMLSelectElement | null
    )?.value || 'month') as BillingMode;
    const fee = parseMoneyInput(
      (document.getElementById('classSetupFee') as HTMLInputElement | null)?.value || '500000'
    );
    const billingStartDate =
      (document.getElementById('classSetupBillingStartDate') as HTMLInputElement | null)?.value ||
      '2026-10-01';
    const billingEndDate =
      (document.getElementById('classSetupBillingEndDate') as HTMLInputElement | null)?.value ||
      '2026-10-31';

    store.update((draft) => {
      if (editingId) {
        const cls = draft.classes.find(
          (c) => c.id.toLowerCase() === editingId.toLowerCase()
        );
        if (cls) {
          cls.name = name;
          cls.color = color;
          cls.subject = subject;
          cls.defaultDuration = defaultDuration;
          cls.billingMode = billingMode;
          cls.fee = fee;
          cls.billingStartDate = billingStartDate;
          cls.billingEndDate = billingEndDate;
        }
      } else {
        const newId = name.toLowerCase();
        draft.classes.push({
          id: newId,
          name,
          subject,
          color,
          colorMode: 'custom',
          defaultDuration,
          billingMode,
          fee,
          billingStartDate,
          billingEndDate,
        });
        selectedHubClassKey = newId;
      }
    });

    closeModal('classSetupModal');
    showToast(editingId ? 'Đã cập nhật thông tin lớp học.' : 'Đã tạo lớp học mới.');
  });

  // Confirm delete class (#classDeleteConfirmModalAction)
  document.getElementById('classDeleteConfirmModalAction')?.addEventListener('click', () => {
    const keyToDelete = selectedHubClassKey;
    store.update((draft) => {
      draft.classes = draft.classes.filter(
        (c) => c.id.toLowerCase() !== keyToDelete.toLowerCase()
      );
      draft.sessions = draft.sessions.filter(
        (s) => s.classKey.toLowerCase() !== keyToDelete.toLowerCase()
      );
    }, 'Xóa lớp học');
    closeModal('classDeleteConfirmModal');
    showToast('Đã xóa lớp học.', 'info', true);
  });

  // Add / Edit Student Form Submit (#addStudentForm)
  const addStudentForm = document.getElementById('addStudentForm') as HTMLFormElement | null;
  addStudentForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const modal = document.getElementById('addStudentModal');
    const editingId = modal?.dataset.editingStudentId || '';

    const name =
      (document.getElementById('studentName') as HTMLInputElement | null)?.value.trim() || '';
    if (!name) {
      showToast('Vui lòng nhập họ và tên học sinh.', 'error');
      return;
    }
    const dob = (document.getElementById('studentDob') as HTMLInputElement | null)?.value || '';
    const phone =
      (document.getElementById('studentPhone') as HTMLInputElement | null)?.value.trim() || '';
    const school =
      (document.getElementById('studentSchool') as HTMLInputElement | null)?.value.trim() || '';
    const note =
      (document.getElementById('studentNote') as HTMLTextAreaElement | null)?.value.trim() || '';
    const basePrice = parseMoneyInput(
      (document.getElementById('studentBasePrice') as HTMLInputElement | null)?.value || '500000'
    );
    const startDate =
      (document.getElementById('studentStartDate') as HTMLInputElement | null)?.value ||
      '2026-10-01';
    const isFormer = Boolean(
      (document.getElementById('studentFormerToggle') as HTMLInputElement | null)?.checked
    );

    const checkedClasses = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="studentClassMember"]:checked')
    ).map((cb) => cb.value);
    const finalClassIds = checkedClasses.length > 0 ? checkedClasses : [selectedHubClassKey];

    store.update((draft) => {
      if (editingId) {
        const stu = draft.students.find((s) => s.id === editingId);
        if (stu) {
          stu.name = name;
          stu.dob = dob;
          stu.phone = phone;
          stu.school = school;
          stu.note = note;
          stu.basePrice = basePrice;
          stu.startDate = startDate;
          stu.isFormer = isFormer;
          stu.endDate = isFormer ? new Date().toISOString().slice(0, 10) : '';
          stu.classIds = finalClassIds;
        }
      } else {
        draft.students.push({
          id: generateId('hs'),
          name,
          dob,
          phone,
          school,
          note,
          basePrice,
          startDate,
          endDate: '',
          isFormer,
          classIds: finalClassIds,
        });
      }
    });

    closeModal('addStudentModal');
    showToast(editingId ? 'Đã cập nhật thông tin học sinh.' : 'Đã thêm học sinh mới.');
  });

  // Bulk delete students confirm (#studentBulkDeleteConfirm)
  document.getElementById('studentBulkDeleteConfirm')?.addEventListener('click', () => {
    const idsToDelete = new Set(selectedStudentIds);
    store.update((draft) => {
      draft.students = draft.students.filter((s) => !idsToDelete.has(s.id));
      draft.sessions.forEach((sess) => {
        sess.studentIds = sess.studentIds.filter((id) => !idsToDelete.has(id));
      });
      draft.scores = draft.scores.filter((sc) => !idsToDelete.has(sc.studentId));
    }, 'Xóa học sinh đã chọn');

    selectedStudentIds.clear();
    isSelectionMode = false;
    closeModal('studentBulkDeleteModal');
    showToast(`Đã xóa ${idsToDelete.size} học sinh.`, 'info', true);
  });
}
