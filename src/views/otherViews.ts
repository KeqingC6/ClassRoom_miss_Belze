import { store } from '../store';
import type { ViewId } from '../types';
import {
  closeModal,
  escapeHtml,
  formatDateDMY,
  formatMoney,
  generateId,
  openModal,
  showToast,
} from '../utils';

let assistantSearchQuery = '';
let selectedRenewalPlanId = 'custom-mu30a7ht';
let appliedCouponDiscount = 0;

// 1. Assistants View (#view-users)
export function renderUsersView(): void {
  const state = store.getState();
  const q = assistantSearchQuery.trim().toLowerCase();
  const list = state.assistants.filter(
    (u) =>
      !q ||
      u.name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
  );

  const onlineCount = state.assistants.filter((u) => u.isOnline).length;
  const summaryEl = document.getElementById('userOnlineSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `<strong>${onlineCount}</strong> đang online trên ${state.assistants.length} tài khoản`;
  }

  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted)">Chưa có tài khoản trong nhóm Trợ giảng.</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      (u, idx) => `<tr>
        <td>#${idx + 1}</td>
        <td><strong>${escapeHtml(u.name)}</strong><div style="font-size:11px;color:var(--text-muted)">@${escapeHtml(
        u.username
      )}</div></td>
        <td><span style="color:#16a34a;font-weight:700">● Online</span> (${escapeHtml(
          u.lastOnline
        )})</td>
        <td>${formatDateDMY(u.createdAt)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>Trợ giảng</td>
        <td>${state.students.filter((s) => !s.isFormer).length} HS</td>
        <td>
          <button type="button" class="btn btn-danger btn-sm" data-delete-assistant="${escapeHtml(
            u.id
          )}">Xóa</button>
        </td>
      </tr>`
    )
    .join('');
}

// 2. Feedback / Support View (#view-feedback)
export function renderFeedbackView(): void {
  const state = store.getState();
  const listEl = document.getElementById('feedbackList');
  if (!listEl) return;

  if (state.feedbacks.length === 0) {
    listEl.innerHTML = `<p style="padding:18px;text-align:center;color:var(--text-muted)">Bạn chưa gửi tin nhắn nào.</p>`;
    return;
  }

  listEl.innerHTML = state.feedbacks
    .map(
      (msg) => `<div style="padding:12px 14px;border-radius:12px;margin-bottom:8px;background:${
        msg.sender === 'teacher' ? 'var(--primary-soft)' : 'var(--card-bg,#fff)'
      };border:1px solid var(--border-color)">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px">
          <strong>${msg.sender === 'teacher' ? escapeHtml(state.profile.displayName) : 'Quản trị viên NTTCLASS'}</strong>
          <span>${escapeHtml(msg.createdAt)}</span>
        </div>
        <div style="font-size:13px">${escapeHtml(msg.text)}</div>
      </div>`
    )
    .join('');
}

// 3. Subscription Renewal View (#view-subscription-renewal)
export function renderRenewalView(): void {
  const state = store.getState();
  const view = document.getElementById('view-subscription-renewal');
  if (!view) return;

  view.querySelectorAll<HTMLElement>('[data-customer-plan-id]').forEach((btn) => {
    const isSel = btn.dataset.customerPlanId === selectedRenewalPlanId;
    btn.classList.toggle('is-selected', isSel);
    btn.setAttribute('aria-pressed', String(isSel));
  });

  const ordersEl = document.getElementById('billingCustomerOrders');
  if (ordersEl) {
    if (state.renewalOrders.length === 0) {
      ordersEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px">Bạn chưa tạo yêu cầu gia hạn nào.</p>`;
    } else {
      ordersEl.innerHTML = state.renewalOrders
        .map(
          (ord) => `<div style="padding:10px 14px;border:1px solid var(--border-color);border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <strong>${escapeHtml(ord.planName)} (${ord.months} tháng)</strong>
              <div style="font-size:11px;color:var(--text-muted)">Mã đơn: ${escapeHtml(
                ord.id
              )} · ${escapeHtml(ord.createdAt)}</div>
            </div>
            <strong>${formatMoney(ord.amount)}</strong>
          </div>`
        )
        .join('');
    }
  }
}

// 4. Settings Modal & Theme Manager (#accountSettingsModal)
export function applyAppearancePreferences(): void {
  const state = store.getState();
  const prefs = state.preferences;
  const html = document.documentElement;

  html.setAttribute('data-app-variant', prefs.themeId || 'pink');
  html.setAttribute('data-app-glass-opacity', String(prefs.glassOpacity || 85));
  html.style.setProperty('--sidebar-open-width', `${prefs.sidebarWidth || 220}px`);

  const sidebar = document.querySelector<HTMLElement>('aside.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('collapsed', Boolean(prefs.sidebarCollapsed));
  }

  // Update user box in sidebar
  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatarEl = document.getElementById('sidebarUserAvatar');
  if (nameEl) nameEl.textContent = state.profile.displayName;
  if (roleEl) roleEl.textContent = state.profile.roleLabel;
  if (avatarEl) avatarEl.textContent = state.profile.avatarLetter || state.profile.displayName[0] || 'Q';

  // Sync feature toggles on sidebar nav items
  const ft = prefs.featureToggles;
  const navLogs = document.getElementById('nav-logs');
  const navScores = document.getElementById('nav-scores');
  const navAlbum = document.getElementById('nav-album');
  const navAssistants = document.getElementById('nav-assistants');
  if (navLogs) {
    navLogs.toggleAttribute('hidden', !ft.learningJournal);
    navLogs.style.display = ft.learningJournal ? 'flex' : 'none';
  }
  if (navScores) {
    navScores.toggleAttribute('hidden', !ft.scores);
    navScores.style.display = ft.scores ? 'flex' : 'none';
  }
  if (navAlbum) {
    const showAlbum = ft.album !== false;
    navAlbum.toggleAttribute('hidden', !showAlbum);
    navAlbum.style.display = showAlbum ? 'flex' : 'none';
  }
  if (navAssistants) {
    navAssistants.toggleAttribute('hidden', !ft.assistants);
    navAssistants.style.display = ft.assistants ? 'flex' : 'none';
  }
}

export function bindOtherViewsEvents(navigateToView: (v: ViewId) => void): void {
  // --- Assistants (#view-users & #userModal) ---
  const userSearch = document.getElementById('userAccountSearch') as HTMLInputElement | null;
  userSearch?.addEventListener('input', () => {
    assistantSearchQuery = userSearch.value;
    renderUsersView();
  });

  document.getElementById('addNewUserBtn')?.addEventListener('click', () => {
    openModal('userModal');
  });

  const addUserForm = document.getElementById('addUserForm') as HTMLFormElement | null;
  addUserForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name =
      (document.getElementById('userName') as HTMLInputElement | null)?.value.trim() || '';
    const username =
      (document.getElementById('userUsername') as HTMLInputElement | null)?.value.trim() || '';
    const email =
      (document.getElementById('userRecoveryEmail') as HTMLInputElement | null)?.value.trim() || '';

    if (!name || !username) {
      showToast('Vui lòng nhập đầy đủ họ tên và tên đăng nhập trợ giảng.', 'error');
      return;
    }

    store.update((draft) => {
      draft.assistants.push({
        id: generateId('ast'),
        name,
        username,
        email,
        role: 'assistant',
        createdAt: '2026-10-30',
        lastOnline: 'Vừa xong',
        isOnline: true,
      });
    });

    addUserForm.reset();
    closeModal('userModal');
    showToast('Đã tạo tài khoản trợ giảng mới.');
  });

  document.getElementById('view-users')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const delBtn = target.closest<HTMLElement>('[data-delete-assistant]');
    if (delBtn) {
      const id = delBtn.dataset.deleteAssistant;
      store.update((draft) => {
        draft.assistants = draft.assistants.filter((a) => a.id !== id);
      }, 'Xóa trợ giảng');
      showToast('Đã xóa tài khoản trợ giảng.', 'info', true);
    }
  });

  // --- Feedback (#view-feedback) ---
  const feedbackForm = document.getElementById('feedbackCreateForm') as HTMLFormElement | null;
  feedbackForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const msgInput = document.getElementById('feedbackMessageInput') as HTMLTextAreaElement | null;
    const text = msgInput?.value.trim() || '';
    if (!text) {
      showToast('Vui lòng nhập nội dung tin nhắn.', 'error');
      return;
    }

    store.update((draft) => {
      draft.feedbacks.push({
        id: generateId('fb'),
        sender: 'teacher',
        text,
        createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' 30/10/2026',
      });
      draft.feedbacks.push({
        id: generateId('fb_reply'),
        sender: 'admin',
        text: 'Cảm ơn cô đã gửi phản hồi! Đội ngũ NTTCLASS đã ghi nhận và sẽ hỗ trợ sớm nhất.',
        createdAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' 30/10/2026',
      });
    });

    if (msgInput) msgInput.value = '';
    showToast('Đã gửi tin nhắn tới quản trị viên.');
  });

  // --- Subscription Renewal (#view-subscription-renewal) ---
  const renewalView = document.getElementById('view-subscription-renewal');
  renewalView?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const planBtn = target.closest<HTMLElement>('[data-customer-plan-id]');
    if (planBtn) {
      selectedRenewalPlanId = planBtn.dataset.customerPlanId || 'custom-mu30a7ht';
      renderRenewalView();
      return;
    }
    const copyBtn = target.closest<HTMLElement>('[data-copy-target]');
    if (copyBtn) {
      showToast('Đã sao chép vào bộ nhớ tạm.');
    }
  });

  document.getElementById('billingCustomerQuoteBtn')?.addEventListener('click', () => {
    const code =
      (document.getElementById('billingCustomerCoupon') as HTMLInputElement | null)?.value.trim() ||
      '';
    if (!code) {
      showToast('Vui lòng nhập mã ưu đãi.', 'info');
      return;
    }
    appliedCouponDiscount = 1000;
    showToast(`Đã áp dụng mã ưu đãi "${code}" (-1.000 ₫).`);
  });

  document.getElementById('billingCustomerCreateOrderBtn')?.addEventListener('click', () => {
    const is3Months = selectedRenewalPlanId === 'custom-mu71440f';
    const months = is3Months ? 3 : 1;
    const planName = is3Months ? 'Linh hoạt' : 'Trải nghiệm';
    const baseAmt = is3Months ? 14550 : 5000;
    const amount = Math.max(0, baseAmt - appliedCouponDiscount);
    const orderId = `ORD${Date.now().toString().slice(-6)}`;

    store.update((draft) => {
      draft.renewalOrders.unshift({
        id: orderId,
        planId: selectedRenewalPlanId,
        planName,
        months,
        amount,
        createdAt: '30/10/2026',
        status: 'pending',
        bankName: 'MBBank',
        bankAccount: '0785193837',
        bankHolder: 'NTTCLASS SYSTEM',
        transferContent: `NTT ${orderId}`,
      });
    });

    const qrEmpty = document.getElementById('billingPaymentQrEmpty');
    if (qrEmpty) {
      qrEmpty.innerHTML = `<div style="padding:16px;text-align:center;border:2px dashed var(--primary);border-radius:12px;background:#fff">
        <div style="font-weight:700;color:var(--primary);margin-bottom:6px">MÃ QR GIA HẠN (${escapeHtml(
          orderId
        )})</div>
        <div style="font-size:12px">Ngân hàng: <strong>MBBank</strong> · STK: <strong>0785193837</strong></div>
        <div style="font-size:12px">Số tiền: <strong>${formatMoney(
          amount
        )}</strong> · Nội dung: <strong>NTT ${escapeHtml(orderId)}</strong></div>
      </div>`;
    }
    showToast('Đã tạo đơn và mã QR gia hạn.');
  });

  // --- User Guide (#view-user-guide) ---
  const guideView = document.getElementById('view-user-guide');
  guideView?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('button');
    if (!btn) return;
    const cardText = btn.closest('article, div')?.textContent || '';
    if (cardText.includes('Lịch dạy')) navigateToView('view-scheduler');
    else if (cardText.includes('Nhật ký')) navigateToView('view-logs');
    else if (cardText.includes('Điểm số')) navigateToView('view-scores-v2');
    else if (cardText.includes('học phí')) navigateToView('view-tuition');
    else if (cardText.includes('lớp')) navigateToView('view-student-class-hub');
    else navigateToView('view-dashboard');
    showToast('Đang mở khu vực tương ứng theo hướng dẫn.');
  });

  document.getElementById('userGuideHeaderRunBtn')?.addEventListener('click', () => {
    openModal('featureOnboardingModal');
  });

  // --- Account Settings Modal (#accountSettingsModal) ---
  document.getElementById('sidebarSettingsBtn')?.addEventListener('click', () => {
    openModal('accountSettingsModal');
  });

  const settingsModal = document.getElementById('accountSettingsModal');
  const tabOrder = [
    'account',
    'security',
    'devices',
    'features',
    'journal',
    'drive',
    'legal',
    'appearance',
    'sharing',
    'invoice',
  ];

  settingsModal?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Settings sidebar tab switch (`data-settings-tab`)
    const tabBtn = target.closest<HTMLElement>('[data-settings-tab]');
    if (tabBtn) {
      const tabKey = tabBtn.dataset.settingsTab || 'account';
      settingsModal.querySelectorAll<HTMLElement>('[data-settings-tab]').forEach((b) => {
        b.classList.toggle('active', b === tabBtn);
      });
      const panels = settingsModal.querySelectorAll<HTMLElement>('section.settings-panel');
      const targetIdx = tabOrder.indexOf(tabKey);
      panels.forEach((p, idx) => {
        const panelKey = p.dataset.settingsPanel;
        const isMatch = panelKey
          ? panelKey === tabKey
          : idx === (targetIdx >= 0 ? targetIdx : 0);
        p.classList.toggle('active', isMatch);
        if (isMatch) p.removeAttribute('hidden');
        else p.setAttribute('hidden', '');
      });
      return;
    }

    // Theme picker button (`data-theme-id`)
    const themeBtn = target.closest<HTMLElement>('[data-theme-id]');
    if (themeBtn) {
      const themeId = themeBtn.dataset.themeId || 'blue';
      store.update((draft) => {
        draft.preferences.themeId = themeId;
      });
      applyAppearancePreferences();
      showToast(`Đã áp dụng giao diện "${themeBtn.textContent?.trim() || themeId}".`);
      return;
    }

    // Save Account Profile
    if (target.closest('#btnSaveAccountProfile')) {
      const dispName =
        (document.getElementById('settingsDisplayName') as HTMLInputElement | null)?.value.trim() ||
        'Quỳnh Hương';
      const dob =
        (document.getElementById('settingsDateOfBirth') as HTMLInputElement | null)?.value.trim() ||
        '';
      store.update((draft) => {
        draft.profile.displayName = dispName;
        draft.profile.avatarLetter = dispName[0]?.toUpperCase() || 'Q';
        if (dob) draft.profile.dob = dob;
      });
      applyAppearancePreferences();
      showToast('Đã lưu thông tin hồ sơ cá nhân.');
      return;
    }

    // Save Invoice Setup
    if (target.closest('#btnSaveInvoiceSetup')) {
      const teacherName =
        (
          document.getElementById('settingsInvoiceTeacherName') as HTMLInputElement | null
        )?.value.trim() || 'Quỳnh Hương';
      const teacherPhone =
        (
          document.getElementById('settingsInvoiceTeacherPhone') as HTMLInputElement | null
        )?.value.trim() || '';
      const bankName =
        (
          document.getElementById('settingsInvoiceBankName') as HTMLInputElement | null
        )?.value.trim() || '';
      const bankAcc =
        (
          document.getElementById('settingsInvoiceBankAccountNumber') as HTMLInputElement | null
        )?.value.trim() || '';
      const bankHolder =
        (
          document.getElementById('settingsInvoiceBankAccountHolder') as HTMLInputElement | null
        )?.value.trim() || '';

      store.update((draft) => {
        draft.invoiceSettings.teacherName = teacherName;
        if (teacherPhone) draft.invoiceSettings.teacherPhone = teacherPhone;
        if (bankName) draft.invoiceSettings.bankName = bankName;
        if (bankAcc) draft.invoiceSettings.bankAccountNumber = bankAcc;
        if (bankHolder) draft.invoiceSettings.bankAccountHolder = bankHolder;
      });
      showToast('Đã lưu thiết lập phiếu học phí.');
    }
  });

  // Feature toggles inside Settings -> Features (`data-feature-toggle`)
  settingsModal?.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.dataset.featureToggle) {
      const key = target.dataset.featureToggle as keyof ReturnType<
        typeof store.getState
      >['preferences']['featureToggles'];
      store.update((draft) => {
        draft.preferences.featureToggles[key] = target.checked;
      });
      applyAppearancePreferences();
      showToast('Đã cập nhật tùy chọn hiển thị tính năng.');
    }
    if (target.id === 'personalGlassOpacity') {
      const val = parseInt(target.value, 10) || 85;
      store.update((draft) => {
        draft.preferences.glassOpacity = val;
      });
      applyAppearancePreferences();
    }
  });
}
