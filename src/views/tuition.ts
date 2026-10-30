import { store } from '../store';
import type { TuitionStatusValue } from '../types';
import {
  closeModal,
  escapeHtml,
  formatDateDM,
  formatDateDMY,
  formatMoney,
  formatMonthLabel,
  generateId,
  getMonthStartEnd,
  openModal,
  parseMoneyInput,
  shiftMonth,
  showToast,
} from '../utils';

let selectedTuitionClassTab = ''; // '' = all classes
const collapsedTuitionGroups = new Set<string>();
let activeInvoiceStudentId = '';
let activeCommentPresetField: 'overview' | 'algebra' | 'geometry' | 'roadmap' = 'overview';

export function renderTuitionView(): void {
  const state = store.getState();
  const ym = state.selectedMonth || '2026-10';
  const { start, end } = getMonthStartEnd(ym);

  // 1. Update Date Range Summary & Inputs
  const summaryEl = document.getElementById('tuitionDateRangeSummary');
  const fromInput = document.getElementById('tuitionFromDate') as HTMLInputElement | null;
  const toInput = document.getElementById('tuitionToDate') as HTMLInputElement | null;
  if (summaryEl) {
    summaryEl.textContent = `${formatDateDMY(start)} - ${formatDateDMY(end)}`;
  }
  if (fromInput) fromInput.value = start;
  if (toInput) toInput.value = end;

  // 2. Sync Column Visibility Checkboxes
  const colPrefs = state.preferences.tuitionColumns;
  document
    .querySelectorAll<HTMLInputElement>('[data-tuition-column-toggle]')
    .forEach((cb) => {
      const k = cb.dataset.tuitionColumnToggle || '';
      cb.checked = Boolean(colPrefs[k]);
    });

  // 3. Render Class Filter Tabs (`#tuitionClassTabs`)
  const tabsEl = document.getElementById('tuitionClassTabs');
  if (tabsEl) {
    tabsEl.innerHTML =
      `<button type="button" class="data-class-tab ${
        !selectedTuitionClassTab ? 'is-active' : ''
      }" role="tab" aria-selected="${!selectedTuitionClassTab}" data-class-key="">Tất cả lớp</button>` +
      state.classes
        .map((c) => {
          const isAct = selectedTuitionClassTab.toLowerCase() === c.id.toLowerCase();
          return `<button type="button" class="data-class-tab ${
            isAct ? 'is-active' : ''
          }" role="tab" aria-selected="${isAct}" data-class-key="${escapeHtml(
            c.id
          )}">${escapeHtml(c.name)}</button>`;
        })
        .join('');
  }

  // 4. Calculate rows & totals across classes
  let sumPaid = 0;
  let sumUnpaid = 0;
  let sumTotal = 0;

  const tbody = document.getElementById('tuitionOverviewTableBody');
  const tableEl = document.getElementById('tuitionOverviewTable');

  if (tableEl) {
    Object.keys(colPrefs).forEach((colKey) => {
      const visible = Boolean(colPrefs[colKey]);
      tableEl
        .querySelectorAll<HTMLElement>(`th[data-tuition-column="${colKey}"]`)
        .forEach((th) => {
          th.classList.toggle('is-column-hidden', !visible);
          if (visible) th.removeAttribute('hidden');
          else th.setAttribute('hidden', '');
        });
    });
  }

  const groupRowsHtml: string[] = [];

  state.classes.forEach((cls) => {
    const studentsInClass = state.students.filter(
      (s) =>
        !s.isFormer &&
        s.classIds.some((cid) => cid.toLowerCase() === cls.id.toLowerCase())
    );

    const isClassFilteredOut =
      selectedTuitionClassTab &&
      selectedTuitionClassTab.toLowerCase() !== cls.id.toLowerCase();

    const isExpanded = !collapsedTuitionGroups.has(cls.id);

    if (!isClassFilteredOut) {
      groupRowsHtml.push(`<tr class="student-grade-group-row tuition-class-group-row ${
        isExpanded ? 'is-expanded' : ''
      }" data-tuition-class-group="${escapeHtml(cls.id)}">
        <td colspan="12">
          <button type="button" class="student-grade-toggle tuition-class-toggle" data-tuition-toggle-group="${escapeHtml(
            cls.id
          )}" aria-expanded="${isExpanded}">
            <span class="student-grade-toggle-content">
              <span class="student-grade-label">${escapeHtml(
                cls.name
              )} <span class="student-grade-count">(${studentsInClass.length})</span></span>
              <svg class="student-grade-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M5.75 7.5 10 11.75 14.25 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </span>
          </button>
        </td>
      </tr>`);
    }

    studentsInClass.forEach((stu, idx) => {
      const calc = store.calculateStudentTuitionForMonth(stu, cls, ym);
      sumPaid += calc.paid;
      sumUnpaid += calc.unpaid;
      sumTotal += calc.total;

      if (isClassFilteredOut || !isExpanded) return;

      const statusCls =
        calc.status === 'paid'
          ? 'status-paid'
          : calc.status === 'partial'
          ? 'status-partial'
          : 'status-unpaid';

      groupRowsHtml.push(`<tr class="tuition-data-row" data-tuition-class-group="${escapeHtml(
        cls.id
      )}">
        <td class="tuition-center" data-tuition-column="index" ${
          colPrefs.index ? '' : 'hidden'
        }>${idx + 1}</td>
        <td class="tuition-student-name" data-tuition-column="student" ${
          colPrefs.student ? '' : 'hidden'
        }><strong>${escapeHtml(stu.name)}</strong></td>
        <td class="tuition-center" data-tuition-column="class" ${
          colPrefs.class ? '' : 'hidden'
        }>${escapeHtml(cls.name)}</td>
        <td class="tuition-center tuition-number" data-tuition-column="sessions" ${
          colPrefs.sessions ? '' : 'hidden'
        }>${calc.sessionCount}</td>
        <td class="tuition-center tuition-number tuition-hours" data-tuition-column="hours" ${
          colPrefs.hours ? '' : 'hidden'
        }>${calc.totalHours}</td>
        <td class="tuition-center tuition-money tuition-surcharge" data-tuition-column="surcharge" ${
          colPrefs.surcharge ? '' : 'hidden'
        }>${formatMoney(calc.surcharge)}</td>
        <td class="tuition-center tuition-money tuition-discount" data-tuition-column="discount" ${
          colPrefs.discount ? '' : 'hidden'
        }>${formatMoney(calc.discount)}</td>
        <td class="tuition-center tuition-money" data-tuition-column="total" ${
          colPrefs.total ? '' : 'hidden'
        }>${formatMoney(calc.total)}</td>
        <td class="tuition-center tuition-money tuition-paid" data-tuition-column="paid" ${
          colPrefs.paid ? '' : 'hidden'
        }>${formatMoney(calc.paid)}</td>
        <td class="tuition-center tuition-money tuition-unpaid" data-tuition-column="unpaid" ${
          colPrefs.unpaid ? '' : 'hidden'
        }>${formatMoney(calc.unpaid)}</td>
        <td class="tuition-center" data-tuition-column="status" ${
          colPrefs.status ? '' : 'hidden'
        }>
          <div class="tuition-status-cell" data-student="${escapeHtml(
            stu.id
          )}" data-month="${escapeHtml(ym)}" data-class-key="${escapeHtml(
        cls.id
      )}" data-status="${calc.status}" title="Nhấn đúp để chuyển sang đã thanh toán">
            <select class="tuition-status-select ${statusCls}" data-student="${escapeHtml(
        stu.id
      )}" data-month="${escapeHtml(ym)}" data-class-key="${escapeHtml(cls.id)}">
              <option value="paid" ${calc.status === 'paid' ? 'selected' : ''}>Đã thu</option>
              <option value="unpaid" ${calc.status === 'unpaid' ? 'selected' : ''}>Chưa thu</option>
              <option value="partial" ${calc.status === 'partial' ? 'selected' : ''}>Một phần</option>
            </select>
          </div>
        </td>
        <td class="tuition-center" data-tuition-column="invoice" ${
          colPrefs.invoice ? '' : 'hidden'
        }>
          <div class="tuition-invoice-actions">
            <button type="button" class="btn btn-secondary btn-sm tuition-invoice-btn" data-student-id="${escapeHtml(
              stu.id
            )}" data-class-key="${escapeHtml(
        cls.id
      )}" title="Xuất phiếu học phí">Xuất phiếu</button>
            <button type="button" class="btn btn-secondary btn-sm ui-action-icon tuition-payment-history-btn" data-ui-action="history" data-student-id="${escapeHtml(
              stu.id
            )}" data-class-key="${escapeHtml(
        cls.id
      )}" title="Lịch sử giao dịch học phí"></button>
          </div>
        </td>
      </tr>`);
    });
  });

  if (tbody) {
    tbody.innerHTML =
      groupRowsHtml.join('') ||
      `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text-muted)">Chưa có dữ liệu học phí.</td></tr>`;
  }

  // 5. Update 3 Summary Cards
  const paidEl = document.getElementById('tuition-paid-sum');
  const unpaidEl = document.getElementById('tuition-unpaid-sum');
  const totalEl = document.getElementById('tuition-total-sum');
  if (paidEl) paidEl.textContent = formatMoney(sumPaid);
  if (unpaidEl) unpaidEl.textContent = formatMoney(sumUnpaid);
  if (totalEl) totalEl.textContent = formatMoney(sumTotal);
}

// Open Single Student Invoice Modal (#invoiceModal)
export function openInvoiceModal(studentId: string, classKey?: string): void {
  const state = store.getState();
  const stu = store.getStudentById(studentId);
  if (!stu) return;
  activeInvoiceStudentId = stu.id;

  const cls =
    store.getClassByKey(classKey || stu.classIds[0] || '') || state.classes[0];
  const ym = state.selectedMonth || '2026-10';
  const { start, end } = getMonthStartEnd(ym);

  const fromInput = document.getElementById('invoiceFromDate') as HTMLInputElement | null;
  const toInput = document.getElementById('invoiceToDate') as HTMLInputElement | null;
  const titleInput = document.getElementById('invoiceTitle') as HTMLInputElement | null;
  const noteInput = document.getElementById('invoiceNote') as HTMLTextAreaElement | null;

  if (fromInput) fromInput.value = start;
  if (toInput) toInput.value = end;
  if (titleInput) titleInput.value = `HỌC PHÍ ${formatMonthLabel(ym).toUpperCase()}`;
  if (noteInput && !noteInput.value) {
    noteInput.value = state.invoiceSettings.closingNote;
  }

  // Hide setup required banner since we pre-seeded teacher/bank info
  const banner = document.getElementById('invoiceSetupRequiredBanner');
  if (banner) banner.setAttribute('hidden', '');

  renderInvoicePresetList();
  renderInvoiceLivePreview(stu.id, cls?.id || '');

  openModal('invoiceModal');
}

function renderInvoicePresetList(): void {
  const state = store.getState();
  const listEl = document.getElementById('invoiceCommentPresetList');
  if (!listEl) return;

  const presets = state.invoiceSettings.commentPresets[activeCommentPresetField] || [];
  listEl.innerHTML = presets
    .map(
      (text) =>
        `<button type="button" class="btn btn-secondary btn-sm" style="text-align:left;justify-content:flex-start;width:100%;margin-bottom:6px;white-space:normal" data-invoice-preset-item="${escapeHtml(
          text
        )}">${escapeHtml(text)}</button>`
    )
    .join('');
}

function renderInvoiceLivePreview(studentId: string, classKey: string): void {
  const state = store.getState();
  const stu = store.getStudentById(studentId);
  const cls = store.getClassByKey(classKey) || state.classes[0];
  if (!stu || !cls) return;

  const ym = state.selectedMonth || '2026-10';
  const calc = store.calculateStudentTuitionForMonth(stu, cls, ym);
  const sessions = store.getStudentSessions(stu.id, ym);

  const titleVal =
    (document.getElementById('invoiceTitle') as HTMLInputElement | null)?.value ||
    `HỌC PHÍ ${formatMonthLabel(ym).toUpperCase()}`;
  const closingVal =
    (document.getElementById('invoiceNote') as HTMLTextAreaElement | null)?.value ||
    state.invoiceSettings.closingNote;

  const statusEl = document.getElementById('invoiceLivePreviewStatus');
  const previewEl = document.getElementById('invoiceLivePreview');
  if (statusEl) statusEl.setAttribute('hidden', '');
  if (!previewEl) return;

  previewEl.removeAttribute('hidden');
  previewEl.classList.remove('sf-hidden');

  const datesBadges = sessions
    .map(
      (s) =>
        `<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:var(--primary-soft);font-size:11px;font-weight:700;margin:2px">${formatDateDM(
          s.date
        )}</span>`
    )
    .join('');

  previewEl.innerHTML = `<div style="padding:20px;border-radius:16px;border:1px solid var(--border-color);background:var(--card-bg,#fff);color:var(--text-main)">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--primary);padding-bottom:12px;margin-bottom:14px">
      <div>
        <div style="font-size:12px;color:var(--text-muted);font-weight:700">GIÁO VIÊN: ${escapeHtml(
          state.invoiceSettings.teacherName
        )}</div>
        <div style="font-size:11px;color:var(--text-muted)">SĐT: ${escapeHtml(
          state.invoiceSettings.teacherPhone
        )}</div>
      </div>
      <div style="text-align:right">
        <h3 style="margin:0;color:var(--primary);font-size:16px">${escapeHtml(titleVal)}</h3>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:14px;padding:12px;border-radius:10px;background:var(--primary-soft)">
      <div><strong>Học sinh:</strong> ${escapeHtml(stu.name)}</div>
      <div><strong>Lớp:</strong> ${escapeHtml(cls.name)}</div>
      <div><strong>Số buổi học:</strong> ${calc.sessionCount} buổi</div>
      <div><strong>Tổng thời lượng:</strong> ${calc.totalHours} giờ</div>
      <div style="grid-column:1/-1"><strong>Ngày học:</strong> ${datesBadges || 'Chưa ghi nhận'}</div>
    </div>

    <div style="padding:14px;border-radius:10px;border:1px dashed var(--primary);margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span>Học phí cơ bản:</span><strong>${formatMoney(calc.baseFee)}</strong>
      </div>
      ${
        calc.surcharge > 0
          ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Phụ thu:</span><strong>+${formatMoney(
              calc.surcharge
            )}</strong></div>`
          : ''
      }
      ${
        calc.discount > 0
          ? `<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Giảm học phí:</span><strong>-${formatMoney(
              calc.discount
            )}</strong></div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;font-size:16px;color:var(--primary);border-top:1px solid var(--border-color);padding-top:8px;margin-top:6px">
        <strong>TỔNG CẦN THANH TOÁN:</strong>
        <strong>${formatMoney(calc.unpaid > 0 ? calc.unpaid : calc.total)}</strong>
      </div>
    </div>

    <div style="font-size:12px;margin-bottom:10px">
      <strong>Thông tin chuyển khoản:</strong> ${escapeHtml(
        state.invoiceSettings.bankName
      )} · STK: <strong>${escapeHtml(
    state.invoiceSettings.bankAccountNumber
  )}</strong> (${escapeHtml(state.invoiceSettings.bankAccountHolder)})
    </div>
    <p style="font-size:12px;font-style:italic;color:var(--text-muted);margin:0">${escapeHtml(
      closingVal
    )}</p>
  </div>`;
}

// Open Tuition Adjustment Modal (#tuitionAdjustmentModal) for surcharge or discount
function openTuitionAdjustmentModal(type: 'surcharge' | 'discount'): void {
  const state = store.getState();
  const modal = document.getElementById('tuitionAdjustmentModal');
  if (!modal) return;

  const titleEl = modal.querySelector('.modal-title');
  if (titleEl) {
    titleEl.textContent = type === 'surcharge' ? 'Phụ thu theo lớp' : 'Giảm học phí';
  }
  const typeSelect = document.getElementById('tuitionAdjustmentType') as HTMLSelectElement | null;
  if (typeSelect) typeSelect.value = type;

  const { start, end } = getMonthStartEnd(state.selectedMonth || '2026-10');
  const startInput = document.getElementById(
    'tuitionAdjustmentDateStart'
  ) as HTMLInputElement | null;
  const endInput = document.getElementById('tuitionAdjustmentDateEnd') as HTMLInputElement | null;
  if (startInput) startInput.value = start;
  if (endInput) endInput.value = end;

  // Populate student targets
  const targetsEl = document.getElementById('tuitionAdjustmentTargets');
  if (targetsEl) {
    targetsEl.innerHTML = state.students
      .filter((s) => !s.isFormer)
      .map(
        (s) =>
          `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px">
            <input type="checkbox" name="tuitionAdjustmentTarget" value="${escapeHtml(
              s.id
            )}" checked>
            <span>${escapeHtml(s.name)}</span>
          </label>`
      )
      .join('');
  }

  renderExistingAdjustmentsList();
  openModal('tuitionAdjustmentModal');
}

function renderExistingAdjustmentsList(): void {
  const state = store.getState();
  const listEl = document.getElementById('tuitionAdjustmentItems');
  if (!listEl) return;

  if (state.adjustments.length === 0) {
    listEl.innerHTML = `<p style="color:var(--text-muted);font-size:12px">Chưa có khoản phụ thu hoặc giảm phí nào.</p>`;
    return;
  }

  listEl.innerHTML = state.adjustments
    .map(
      (adj) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;margin-bottom:6px">
          <div>
            <strong>${escapeHtml(adj.name || (adj.type === 'surcharge' ? 'Phụ thu' : 'Giảm phí'))}</strong>
            <div style="font-size:11px;color:var(--text-muted)">${
              adj.mode === 'percent' ? `${adj.value}%` : formatMoney(adj.value)
            } · ${adj.studentIds.length} HS</div>
          </div>
          <button type="button" class="btn btn-danger btn-sm" data-delete-adjustment="${escapeHtml(
            adj.id
          )}">Xóa</button>
        </div>`
    )
    .join('');
}

// Open Bulk Payment Modal (#tuitionBulkPaymentModal)
function openBulkPaymentModal(): void {
  const state = store.getState();
  const ym = state.selectedMonth || '2026-10';
  const listEl = document.getElementById('tuitionBulkPaymentStudentList');
  if (!listEl) return;

  const unpaidItems: { studentId: string; classKey: string; name: string; className: string; unpaid: number }[] = [];
  state.classes.forEach((cls) => {
    state.students
      .filter(
        (s) =>
          !s.isFormer &&
          s.classIds.some((cid) => cid.toLowerCase() === cls.id.toLowerCase())
      )
      .forEach((stu) => {
        const calc = store.calculateStudentTuitionForMonth(stu, cls, ym);
        if (calc.unpaid > 0) {
          unpaidItems.push({
            studentId: stu.id,
            classKey: cls.id,
            name: stu.name,
            className: cls.name,
            unpaid: calc.unpaid,
          });
        }
      });
  });

  if (unpaidItems.length === 0) {
    listEl.innerHTML = `<p style="padding:14px;text-align:center;color:var(--text-muted)">Tất cả học sinh đã hoàn tất thanh toán trong kỳ này.</p>`;
  } else {
    listEl.innerHTML = unpaidItems
      .map(
        (item) =>
          `<label style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border-color);cursor:pointer">
            <span style="display:flex;align-items:center;gap:8px">
              <input type="checkbox" name="bulkPayStudent" value="${escapeHtml(
                item.studentId
              )}" data-class-key="${escapeHtml(item.classKey)}" checked>
              <strong>${escapeHtml(item.name)}</strong>
              <small style="color:var(--text-muted)">(${escapeHtml(item.className)})</small>
            </span>
            <strong style="color:var(--danger,#e43f51)">Còn nợ ${formatMoney(item.unpaid)}</strong>
          </label>`
      )
      .join('');
  }

  const summary = document.getElementById('tuitionBulkPaymentSelectionSummary');
  if (summary) {
    summary.textContent = `${unpaidItems.length}/${unpaidItems.length} học sinh được chọn`;
  }

  openModal('tuitionBulkPaymentModal');
}

export function bindTuitionEvents(): void {
  const viewTuition = document.getElementById('view-tuition');
  if (!viewTuition) return;

  // Column toggles
  viewTuition.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;

    if (target.matches('[data-tuition-column-toggle]')) {
      const cb = target as HTMLInputElement;
      const k = cb.dataset.tuitionColumnToggle || '';
      store.update((draft) => {
        draft.preferences.tuitionColumns[k] = cb.checked;
      });
      return;
    }

    // Tuition status select change (Đã thu / Chưa thu / Một phần)
    if (target.classList.contains('tuition-status-select')) {
      const sel = target as HTMLSelectElement;
      const sid = sel.dataset.student || '';
      const ym = sel.dataset.month || store.getState().selectedMonth || '2026-10';
      const ckey = sel.dataset.classKey || 'tieng anh 2';
      const newStatus = sel.value as TuitionStatusValue;

      if (newStatus === 'partial') {
        openPartialPaymentModal(sid, ckey, ym);
        return;
      }

      store.update((draft) => {
        draft.tuitionStatuses[`${sid}_${ym}_${ckey}`] = newStatus;
      });
      showToast(
        `Đã cập nhật trạng thái học phí: ${newStatus === 'paid' ? 'Đã thu' : 'Chưa thu'}.`
      );
    }
  });

  // Double click on status cell to mark paid
  viewTuition.addEventListener('dblclick', (e) => {
    const target = e.target as HTMLElement;
    const cell = target.closest<HTMLElement>('.tuition-status-cell');
    if (cell) {
      const sid = cell.dataset.student || '';
      const ym = cell.dataset.month || store.getState().selectedMonth || '2026-10';
      const ckey = cell.dataset.classKey || 'tieng anh 2';
      store.update((draft) => {
        draft.tuitionStatuses[`${sid}_${ym}_${ckey}`] = 'paid';
      });
      showToast('Đã đánh dấu Đã thu học phí.');
    }
  });

  // Delegated clicks inside #view-tuition
  viewTuition.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Class tab click
    const tabBtn = target.closest<HTMLElement>('#tuitionClassTabs [data-class-key]');
    if (tabBtn) {
      selectedTuitionClassTab = tabBtn.dataset.classKey || '';
      renderTuitionView();
      return;
    }

    // Group expand/collapse click
    const groupToggle = target.closest<HTMLElement>('[data-tuition-toggle-group]');
    if (groupToggle) {
      const gKey = groupToggle.dataset.tuitionToggleGroup || '';
      if (collapsedTuitionGroups.has(gKey)) collapsedTuitionGroups.delete(gKey);
      else collapsedTuitionGroups.add(gKey);
      renderTuitionView();
      return;
    }

    // Single student invoice button
    const invBtn = target.closest<HTMLElement>('.tuition-invoice-btn');
    if (invBtn && invBtn.dataset.studentId) {
      openInvoiceModal(invBtn.dataset.studentId, invBtn.dataset.classKey);
      return;
    }

    // Payment history button
    const histBtn = target.closest<HTMLElement>('.tuition-payment-history-btn');
    if (histBtn && histBtn.dataset.studentId) {
      openStudentPaymentHistoryModal(histBtn.dataset.studentId);
      return;
    }

    // Month prev/next inside tuition toolbar
    const navBtn = target.closest<HTMLElement>('.tuition-date-range-nav-btn');
    if (navBtn) {
      const isPrev = navBtn.getAttribute('aria-label')?.includes('trước');
      const nextYm = shiftMonth(store.getState().selectedMonth || '2026-10', isPrev ? -1 : 1);
      const { start, end } = getMonthStartEnd(nextYm);
      store.update((draft) => {
        draft.selectedMonth = nextYm;
        draft.dateRangeStart = start;
        draft.dateRangeEnd = end;
      });
    }
  });

  // Tuition Trend chart toggle
  document.getElementById('tuitionTrendToggle')?.addEventListener('click', () => {
    const chart = document.getElementById('tuitionTrendChart');
    const btn = document.getElementById('tuitionTrendToggle');
    if (!chart || !btn) return;
    const isHidden = chart.hasAttribute('hidden');
    if (isHidden) {
      chart.removeAttribute('hidden');
      chart.classList.remove('sf-hidden');
      btn.classList.remove('is-collapsed');
      chart.innerHTML = `<div style="padding:14px;font-size:13px;color:var(--text-muted)">Biểu đồ biến động học phí 6 tháng gần nhất (Tháng 5/2026 - Tháng 10/2026: <strong>2.000.000 ₫</strong>).</div>`;
    } else {
      chart.setAttribute('hidden', '');
      btn.classList.add('is-collapsed');
    }
  });

  // Toolbar action buttons
  document.getElementById('tuitionSurchargeBtn')?.addEventListener('click', () => {
    openTuitionAdjustmentModal('surcharge');
  });
  document.getElementById('tuitionDiscountBtn')?.addEventListener('click', () => {
    openTuitionAdjustmentModal('discount');
  });
  document.getElementById('classPrepaymentBtn')?.addEventListener('click', () => {
    openPrepaymentModal();
  });
  document.getElementById('btnBulkTuitionPayment')?.addEventListener('click', () => {
    openBulkPaymentModal();
  });
  document.getElementById('btnOpenBulkInvoices')?.addEventListener('click', () => {
    openModal('bulkInvoiceModal');
  });

  // Save Tuition Adjustment (#tuitionAdjustmentForm)
  const adjForm = document.getElementById('tuitionAdjustmentForm') as HTMLFormElement | null;
  adjForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = ((
      document.getElementById('tuitionAdjustmentType') as HTMLSelectElement | null
    )?.value || 'surcharge') as 'surcharge' | 'discount';
    const mode = ((
      document.getElementById('tuitionAdjustmentMode') as HTMLSelectElement | null
    )?.value || 'fixed') as 'fixed' | 'percent';
    const rawVal =
      (document.getElementById('tuitionAdjustmentValue') as HTMLInputElement | null)?.value || '0';
    const value = mode === 'percent' ? parseFloat(rawVal) || 0 : parseMoneyInput(rawVal);
    const name =
      (document.getElementById('tuitionAdjustmentName') as HTMLInputElement | null)?.value.trim() ||
      (type === 'surcharge' ? 'Khoản phụ thu' : 'Khoản giảm phí');
    const note =
      (document.getElementById('tuitionAdjustmentNote') as HTMLInputElement | null)?.value.trim() ||
      '';
    const dateStart =
      (document.getElementById('tuitionAdjustmentDateStart') as HTMLInputElement | null)?.value ||
      '2026-10-01';
    const dateEnd =
      (document.getElementById('tuitionAdjustmentDateEnd') as HTMLInputElement | null)?.value ||
      '2026-10-31';

    const studentIds = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="tuitionAdjustmentTarget"]:checked')
    ).map((cb) => cb.value);

    if (value <= 0 || studentIds.length === 0) {
      showToast('Vui lòng nhập mức điều chỉnh > 0 và chọn học sinh áp dụng.', 'error');
      return;
    }

    store.update((draft) => {
      draft.adjustments.push({
        id: generateId('adj'),
        type,
        mode,
        value,
        name,
        note,
        dateStart,
        dateEnd,
        studentIds,
        paid: false,
      });
    });

    renderExistingAdjustmentsList();
    showToast('Đã lưu khoản điều chỉnh học phí.');
  });

  // Delete adjustment inside #tuitionAdjustmentModal
  document.getElementById('tuitionAdjustmentModal')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const delBtn = target.closest<HTMLElement>('[data-delete-adjustment]');
    if (delBtn) {
      const id = delBtn.dataset.deleteAdjustment;
      store.update((draft) => {
        draft.adjustments = draft.adjustments.filter((a) => a.id !== id);
      });
      renderExistingAdjustmentsList();
    }
  });

  // Bulk payment confirm (#tuitionBulkPaymentConfirmButton)
  document.getElementById('tuitionBulkPaymentConfirmButton')?.addEventListener('click', () => {
    const ym = store.getState().selectedMonth || '2026-10';
    const checked = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="bulkPayStudent"]:checked')
    );
    if (checked.length === 0) {
      showToast('Vui lòng chọn ít nhất 1 học sinh.', 'error');
      return;
    }
    store.update((draft) => {
      checked.forEach((cb) => {
        const sid = cb.value;
        const ckey = cb.dataset.classKey || 'tieng anh 2';
        draft.tuitionStatuses[`${sid}_${ym}_${ckey}`] = 'paid';
      });
    });
    closeModal('tuitionBulkPaymentModal');
    showToast(`Đã xác nhận thanh toán cho ${checked.length} học sinh.`);
  });

  // Prepayment Form (#classPrepaymentForm)
  const prepayForm = document.getElementById('classPrepaymentForm') as HTMLFormElement | null;
  prepayForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const classKey =
      (document.getElementById('classPrepaymentClass') as HTMLSelectElement | null)?.value ||
      'tieng anh 2';
    const studentId =
      (document.getElementById('classPrepaymentStudent') as HTMLSelectElement | null)?.value || '';
    const amount = parseMoneyInput(
      (document.getElementById('classPrepaymentAmount') as HTMLInputElement | null)?.value || '0'
    );
    const date =
      (document.getElementById('classPrepaymentDate') as HTMLInputElement | null)?.value ||
      '2026-10-30';
    const note =
      (document.getElementById('classPrepaymentNote') as HTMLInputElement | null)?.value.trim() ||
      '';

    if (!studentId || amount <= 0) {
      showToast('Vui lòng chọn học sinh và nhập số tiền trả trước hợp lệ.', 'error');
      return;
    }

    store.update((draft) => {
      draft.prepayments.push({
        id: generateId('prepay'),
        classKey,
        studentId,
        amount,
        date,
        note,
      });
    });
    closeModal('classPrepaymentModal');
    showToast('Đã lưu khoản thanh toán trước.');
  });

  // Partial / Class Billing Payment Form (#classBillingPaymentForm)
  const billingForm = document.getElementById('classBillingPaymentForm') as HTMLFormElement | null;
  billingForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const studentId =
      (document.getElementById('classBillingPaymentStudent') as HTMLSelectElement | null)?.value ||
      '';
    const month =
      (document.getElementById('classBillingPaymentMonth') as HTMLSelectElement | null)?.value ||
      '2026-10';
    const date =
      (document.getElementById('classBillingPaymentDate') as HTMLInputElement | null)?.value ||
      '2026-10-30';
    const amount = parseMoneyInput(
      (document.getElementById('classBillingPaymentAmount') as HTMLInputElement | null)?.value ||
        '0'
    );
    const note =
      (
        document.getElementById('classBillingPaymentNote') as HTMLInputElement | null
      )?.value.trim() || '';

    if (!studentId || amount <= 0) {
      showToast('Vui lòng nhập số tiền thanh toán hợp lệ.', 'error');
      return;
    }

    const stu = store.getStudentById(studentId);
    const classKey = stu?.classIds[0] || 'tieng anh 2';

    store.update((draft) => {
      draft.payments.push({
        id: generateId('pay'),
        studentId,
        classKey,
        month,
        date,
        amount,
        note,
      });
      draft.tuitionStatuses[`${studentId}_${month}_${classKey}`] = 'partial';
    });

    closeModal('classBillingPaymentModal');
    showToast('Đã ghi nhận khoản thanh toán.');
  });

  // Invoice Modal interactions (#invoiceModal)
  const invoiceModal = document.getElementById('invoiceModal');
  invoiceModal?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const presetTab = target.closest<HTMLElement>('[data-preset-field]');
    if (presetTab) {
      activeCommentPresetField =
        (presetTab.dataset.presetField as 'overview' | 'algebra' | 'geometry' | 'roadmap') ||
        'overview';
      renderInvoicePresetList();
      return;
    }
    const presetItem = target.closest<HTMLElement>('[data-invoice-preset-item]');
    if (presetItem) {
      const noteEl = document.getElementById('invoiceNote') as HTMLTextAreaElement | null;
      if (noteEl) {
        noteEl.value = presetItem.dataset.invoicePresetItem || '';
        const stu = store.getStudentById(activeInvoiceStudentId);
        renderInvoiceLivePreview(activeInvoiceStudentId, stu?.classIds[0] || '');
      }
    }
  });

  invoiceModal?.addEventListener('input', () => {
    const stu = store.getStudentById(activeInvoiceStudentId);
    if (stu) renderInvoiceLivePreview(stu.id, stu.classIds[0] || '');
  });

  document.getElementById('btnSaveInvoiceDraft')?.addEventListener('click', () => {
    showToast('Đã lưu bản nháp phiếu học phí.');
  });
  document.getElementById('btnExportInvoicePdf')?.addEventListener('click', () => {
    window.print();
  });
  document.getElementById('btnExportInvoice')?.addEventListener('click', () => {
    closeModal('invoiceModal');
    showToast('Đã xuất phiếu học phí dạng ảnh.');
  });
  document.getElementById('btnExportBulkInvoices')?.addEventListener('click', () => {
    closeModal('bulkInvoiceModal');
    showToast('Đã xuất PDF phiếu học phí hàng loạt.');
  });
  document.getElementById('btnExportBulkInvoicesImages')?.addEventListener('click', () => {
    closeModal('bulkInvoiceModal');
    showToast('Đã xuất ảnh phiếu học phí hàng loạt.');
  });
}

function openPrepaymentModal(): void {
  const state = store.getState();
  const clsSelect = document.getElementById('classPrepaymentClass') as HTMLSelectElement | null;
  const stuSelect = document.getElementById('classPrepaymentStudent') as HTMLSelectElement | null;
  const entryFields = document.getElementById('classPrepaymentEntryFields');
  if (entryFields) entryFields.removeAttribute('hidden');

  if (clsSelect) {
    clsSelect.innerHTML = state.classes
      .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`)
      .join('');
  }
  if (stuSelect) {
    stuSelect.innerHTML = state.students
      .filter((s) => !s.isFormer)
      .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join('');
  }

  const histEl = document.getElementById('classPrepaymentHistory');
  if (histEl) {
    if (state.prepayments.length === 0) {
      histEl.innerHTML = `<p style="font-size:12px;color:var(--text-muted)">Chưa có khoản thanh toán trước nào.</p>`;
    } else {
      histEl.innerHTML = state.prepayments
        .map((p) => {
          const stu = store.getStudentById(p.studentId);
          return `<div style="padding:8px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between">
            <span><strong>${escapeHtml(stu?.name || '')}</strong> · ${formatDateDMY(p.date)}</span>
            <strong>${formatMoney(p.amount)}</strong>
          </div>`;
        })
        .join('');
    }
  }

  openModal('classPrepaymentModal');
}

function openPartialPaymentModal(studentId: string, classKey: string, month: string): void {
  const state = store.getState();
  const stuSelect = document.getElementById('classBillingPaymentStudent') as HTMLSelectElement | null;
  const monthSelect = document.getElementById('classBillingPaymentMonth') as HTMLSelectElement | null;
  const dateInput = document.getElementById('classBillingPaymentDate') as HTMLInputElement | null;

  if (stuSelect) {
    stuSelect.innerHTML = state.students
      .map(
        (s) =>
          `<option value="${escapeHtml(s.id)}" ${
            s.id === studentId ? 'selected' : ''
          }>${escapeHtml(s.name)}</option>`
      )
      .join('');
  }
  if (monthSelect) {
    monthSelect.innerHTML = `<option value="${escapeHtml(month)}" selected>${formatMonthLabel(
      month
    )}</option>`;
  }
  if (dateInput) dateInput.value = '2026-10-30';

  openModal('classBillingPaymentModal');
}

function openStudentPaymentHistoryModal(studentId: string): void {
  const state = store.getState();
  const stu = store.getStudentById(studentId);
  const summaryEl = document.getElementById('studentPrepaymentHistorySummary');
  const listEl = document.getElementById('studentPrepaymentHistoryList');

  if (summaryEl) {
    summaryEl.innerHTML = `<strong>Học sinh: ${escapeHtml(stu?.name || '-')}</strong>`;
  }
  if (listEl) {
    const items = state.payments.filter((p) => p.studentId === studentId);
    listEl.innerHTML =
      items.length > 0
        ? items
            .map(
              (p) =>
                `<div style="padding:8px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between">
                  <span>Ngày ${formatDateDMY(p.date)} (${escapeHtml(p.note || 'Thanh toán')})</span>
                  <strong>${formatMoney(p.amount)}</strong>
                </div>`
            )
            .join('')
        : `<p style="padding:12px;color:var(--text-muted)">Chưa có giao dịch thanh toán lẻ nào được ghi nhận.</p>`;
  }

  openModal('studentPrepaymentHistoryModal');
}
