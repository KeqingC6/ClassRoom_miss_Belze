import { store } from '../store';
import type { ScoreRecord } from '../types';
import {
  closeModal,
  downloadCsv,
  escapeHtml,
  formatDateDMY,
  formatMonthLabel,
  generateId,
  getInitials,
  openModal,
  showToast,
} from '../utils';
import { openEditSessionModal } from './scheduler';

let selectedKind: 'class' | 'student' = 'class';
let selectedKey = 'tieng anh 2';
let searchQuery = '';
let selectedTypeFilter = '';
let isDashboardCollapsed = false;
const collapsedClasses = new Set<string>();
const collapsedTests = new Set<string>();

function ensureValidSelection(): void {
  const st = store.getState();
  if (selectedKind === 'class') {
    const found = st.classes.find((c) => c.id.toLowerCase() === selectedKey.toLowerCase());
    if (!found && st.classes[0]) {
      selectedKey = st.classes[0].id;
    }
  } else {
    const found = st.students.find((s) => s.id === selectedKey);
    if (!found) {
      selectedKind = 'class';
      selectedKey = st.classes[0]?.id || '';
    }
  }
}

function getScoreTierClass(scoreOn10: number): string {
  if (scoreOn10 >= 8) return 'tier-high';
  if (scoreOn10 >= 6) return 'tier-good';
  if (scoreOn10 >= 4) return 'tier-mid';
  return 'tier-low';
}

export function renderScoresView(): void {
  ensureValidSelection();
  const state = store.getState();
  const viewRoot = document.getElementById('view-scores-v2');
  if (!viewRoot) return;

  // Ensure dialog is closed by default when re-rendering view unless explicitly opened
  const dialog = viewRoot.querySelector<HTMLDialogElement>('[data-sv2-dialog]');
  if (dialog && !dialog.dataset.keepOpen) {
    dialog.removeAttribute('open');
  }

  // 1. Render Sidebar Roster (`[data-sv2-roster]`)
  const rosterEl = viewRoot.querySelector<HTMLElement>('[data-sv2-roster]');
  if (rosterEl) {
    const q = searchQuery.trim().toLowerCase();
    const groupsHtml: string[] = [];

    state.classes.forEach((cls, idx) => {
      const students = state.students.filter(
        (s) =>
          !s.isFormer &&
          s.classIds.some((cid) => cid.toLowerCase() === cls.id.toLowerCase())
      );
      const classMatch = !q || cls.name.toLowerCase().includes(q);
      const filteredStudents = students.filter(
        (s) => classMatch || s.name.toLowerCase().includes(q)
      );
      if (!classMatch && filteredStudents.length === 0) return;

      const isClassSelected =
        selectedKind === 'class' && selectedKey.toLowerCase() === cls.id.toLowerCase();
      const isExpanded = !collapsedClasses.has(cls.id);

      const childrenHtml = filteredStudents
        .map((stu) => {
          const isStuSelected = selectedKind === 'student' && selectedKey === stu.id;
          return `<button type="button" class="sv2-student-select ${
            isStuSelected ? 'is-selected' : ''
          }" data-sv2-select="${escapeHtml(stu.id)}" data-sv2-kind="student" data-class-key="${escapeHtml(
            cls.id
          )}" aria-pressed="${isStuSelected}">
            <span class="sv2-avatar" aria-hidden="true">${escapeHtml(getInitials(stu.name))}</span>
            <span>${escapeHtml(stu.name)}</span>
          </button>`;
        })
        .join('');

      groupsHtml.push(`<section class="sv2-roster-group" style="--student-group-accent:${escapeHtml(
        cls.color || '#B0E0FF'
      )}">
        <div class="sv2-class-row ${isClassSelected ? 'is-selected' : ''}">
          <button type="button" class="sv2-class-select" data-sv2-select="${escapeHtml(
            cls.id
          )}" data-sv2-kind="class" data-class-key="${escapeHtml(
        cls.id
      )}" aria-pressed="${isClassSelected}">
            <span class="sv2-swatch student-grade-color-dot" aria-hidden="true"></span>
            <span class="sv2-roster-copy">
              <strong>${escapeHtml(cls.name)}</strong>
              <small>${students.length} học sinh</small>
            </span>
          </button>
          <button type="button" class="sv2-class-toggle" data-sv2-class-toggle="${escapeHtml(
            cls.id
          )}" aria-expanded="${isExpanded}" aria-controls="sv2RosterGroup${idx}" aria-label="Thu gọn học sinh ${escapeHtml(
        cls.name
      )}">
            <svg class="sv2-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>
          </button>
        </div>
        <div class="sv2-children" id="sv2RosterGroup${idx}" ${isExpanded ? '' : 'hidden'}>
          ${childrenHtml}
        </div>
      </section>`);
    });

    rosterEl.innerHTML = groupsHtml.join('');
  }

  // 2. Resolve Selected Context & Filtered Scores
  const activeClass =
    selectedKind === 'class'
      ? store.getClassByKey(selectedKey)
      : store.getClassByKey(store.getStudentById(selectedKey)?.classIds[0] || '');
  const activeStudent = selectedKind === 'student' ? store.getStudentById(selectedKey) : undefined;

  const titleEl = viewRoot.querySelector<HTMLElement>('[data-sv2-title]');
  const subtitleEl = viewRoot.querySelector<HTMLElement>('[data-sv2-subtitle]');
  const colorDot = viewRoot.querySelector<HTMLElement>('[data-sv2-title-color]');
  const avatarEl = viewRoot.querySelector<HTMLElement>('[data-sv2-title-avatar]');

  const classStudents = activeClass
    ? state.students.filter(
        (s) =>
          !s.isFormer &&
          s.classIds.some((cid) => cid.toLowerCase() === activeClass.id.toLowerCase())
      )
    : [];

  if (selectedKind === 'class' && activeClass) {
    if (titleEl) titleEl.textContent = activeClass.name;
    if (subtitleEl)
      subtitleEl.innerHTML = `<span class="sv2-heading-tag">${classStudents.length} học sinh</span>`;
    if (colorDot) {
      colorDot.removeAttribute('hidden');
      colorDot.style.setProperty('--student-group-accent', activeClass.color || '#B0E0FF');
    }
    if (avatarEl) avatarEl.setAttribute('hidden', '');
  } else if (activeStudent) {
    if (titleEl) titleEl.textContent = activeStudent.name;
    if (subtitleEl)
      subtitleEl.innerHTML = `<span class="sv2-heading-tag">${escapeHtml(
        activeClass?.name || 'Học sinh'
      )}</span>`;
    if (colorDot) colorDot.setAttribute('hidden', '');
    if (avatarEl) {
      avatarEl.textContent = getInitials(activeStudent.name);
      avatarEl.removeAttribute('hidden');
      avatarEl.classList.remove('sf-hidden');
    }
  }

  // Filter scores by class/student & selectedMonth
  const allContextScores = state.scores.filter((sc) => {
    if (selectedKind === 'student') return sc.studentId === selectedKey;
    return sc.classKey.toLowerCase() === (activeClass?.id || '').toLowerCase();
  });

  const monthScores = allContextScores.filter(
    (sc) => !state.selectedMonth || sc.date.startsWith(state.selectedMonth)
  );

  // Group scores into distinct tests: key = `${date}__${type}__${testName}`
  interface TestGroup {
    key: string;
    date: string;
    type: string;
    testName: string;
    maxScore: number;
    sessionId?: string;
    records: ScoreRecord[];
    avgOn10: number;
  }

  function buildTestGroups(list: ScoreRecord[]): TestGroup[] {
    const map = new Map<string, TestGroup>();
    for (const sc of list) {
      const k = `${sc.date}__${sc.type}__${sc.testName}`;
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          date: sc.date,
          type: sc.type,
          testName: sc.testName,
          maxScore: sc.maxScore || 10,
          sessionId: sc.sessionId,
          records: [],
          avgOn10: 0,
        });
      }
      map.get(k)!.records.push(sc);
    }
    const groups = Array.from(map.values());
    for (const g of groups) {
      const sum10 = g.records.reduce(
        (acc, r) => acc + (r.value / (r.maxScore || 10)) * 10,
        0
      );
      g.avgOn10 = g.records.length > 0 ? Math.round((sum10 / g.records.length) * 100) / 100 : 0;
    }
    return groups.sort((a, b) => b.date.localeCompare(a.date));
  }

  const allTestGroups = buildTestGroups(allContextScores);
  const monthTestGroups = buildTestGroups(monthScores);

  // 3. Render Dashboard Stats, Trend SVG & Distribution Donut
  const dashboardEl = document.getElementById('sv2Dashboard');
  const dashToggleBtn = viewRoot.querySelector<HTMLElement>('[data-sv2-action="dashboard"]');
  if (dashToggleBtn) {
    dashToggleBtn.removeAttribute('hidden');
    dashToggleBtn.classList.remove('sf-hidden');
    dashToggleBtn.textContent = isDashboardCollapsed
      ? 'Mở rộng thống kê và biểu đồ'
      : 'Thu gọn thống kê và biểu đồ';
  }
  if (dashboardEl) {
    if (isDashboardCollapsed) dashboardEl.setAttribute('hidden', '');
    else dashboardEl.removeAttribute('hidden');

    const totalScoreCount = monthScores.length;
    const avgScoreOn10 =
      totalScoreCount > 0
        ? (
            monthScores.reduce((acc, r) => acc + (r.value / (r.maxScore || 10)) * 10, 0) /
            totalScoreCount
          ).toFixed(2)
        : '-';

    const highestTestAvg =
      monthTestGroups.length > 0
        ? Math.max(...monthTestGroups.map((g) => g.avgOn10)).toFixed(2)
        : '-';
    const lowestTestAvg =
      monthTestGroups.length > 0
        ? Math.min(...monthTestGroups.map((g) => g.avgOn10)).toFixed(2)
        : '-';

    // Update Stat cards
    const statPrimary = dashboardEl.querySelector('.sv2-stat-primary');
    if (statPrimary) {
      statPrimary.setAttribute(
        'title',
        `TB bài cao nhất: ${highestTestAvg} · TB bài thấp nhất: ${lowestTestAvg}`
      );
      const strongEl = statPrimary.querySelector('strong');
      if (strongEl) {
        strongEl.innerHTML = `${avgScoreOn10}<span class="sv2-stat-scale"> / 10</span>`;
      }
    }
    const statStudentsStrong = dashboardEl.querySelector('.sv2-stat-students strong');
    if (statStudentsStrong) {
      statStudentsStrong.textContent = String(
        selectedKind === 'student' ? 1 : classStudents.length
      );
    }
    const statTestStrong = dashboardEl.querySelector('.sv2-stat-test strong');
    if (statTestStrong) {
      statTestStrong.textContent = String(monthTestGroups.length);
    }

    // Trend Chart (up to 20 most recent tests ascending by date)
    const trendHost = dashboardEl.querySelector<HTMLElement>('[data-sv2-trend]');
    if (trendHost) {
      const recent20 = [...allTestGroups].reverse().slice(-20);
      if (recent20.length === 0) {
        trendHost.innerHTML = `<p class="sv2-empty">Chưa có dữ liệu xu hướng điểm.</p>`;
      } else {
        const w = 460;
        const h = 150;
        const padL = 32;
        const padR = 20;
        const padT = 18;
        const padB = 28;
        const plotW = w - padL - padR;
        const plotH = h - padT - padB;

        const pts = recent20.map((g, i) => {
          const x =
            recent20.length === 1
              ? padL + plotW / 2
              : padL + (i / (recent20.length - 1)) * plotW;
          const y = padT + plotH - (Math.min(10, Math.max(0, g.avgOn10)) / 10) * plotH;
          return { x, y, g };
        });

        const polylinePoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
        const circlesHtml = pts
          .map(
            (p) => `<g class="sv2-chart-dot">
              <title>${escapeHtml(p.g.testName)} (${formatDateDMY(p.g.date)}): ${p.g.avgOn10}/10</title>
              <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="var(--sv2-primary, #2679d8)"></circle>
              <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(
              1
            )}" text-anchor="middle" font-size="10" fill="var(--sv2-text)">${p.g.avgOn10}</text>
              <text x="${p.x.toFixed(1)}" y="${
              h - 8
            }" text-anchor="middle" font-size="9" fill="var(--sv2-muted)">${p.g.date.slice(
              8,
              10
            )}/${p.g.date.slice(5, 7)}</text>
            </g>`
          )
          .join('');

        trendHost.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:150px;overflow:visible">
          <line x1="${padL}" y1="${padT}" x2="${w - padR}" y2="${padT}" stroke="var(--sv2-border)" stroke-dasharray="3 3" stroke-width="0.8"/>
          <text x="4" y="${padT + 4}" font-size="10" fill="var(--sv2-muted)">10</text>
          <line x1="${padL}" y1="${padT + plotH / 2}" x2="${w - padR}" y2="${
          padT + plotH / 2
        }" stroke="var(--sv2-border)" stroke-dasharray="3 3" stroke-width="0.8"/>
          <text x="8" y="${padT + plotH / 2 + 4}" font-size="10" fill="var(--sv2-muted)">5</text>
          <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${
          padT + plotH
        }" stroke="var(--sv2-border)" stroke-width="1"/>
          <text x="8" y="${padT + plotH + 4}" font-size="10" fill="var(--sv2-muted)">0</text>
          ${
            pts.length > 1
              ? `<polyline fill="none" stroke="var(--sv2-primary, #2679d8)" stroke-width="2.2" points="${polylinePoints}"/>`
              : ''
          }
          ${circlesHtml}
        </svg>`;
      }
    }

    // Distribution Buckets (8-10, 6-<8, 4-<6, <4)
    const distHeading = dashboardEl.querySelector('.sv2-distribution h3');
    if (distHeading) {
      distHeading.textContent = `Phân bố điểm ${formatMonthLabel(state.selectedMonth).toLowerCase()}`;
    }
    const buckets = [0, 0, 0, 0];
    for (const r of monthScores) {
      const s10 = (r.value / (r.maxScore || 10)) * 10;
      if (s10 >= 8) buckets[0]++;
      else if (s10 >= 6) buckets[1]++;
      else if (s10 >= 4) buckets[2]++;
      else buckets[3]++;
    }
    const donutEl = dashboardEl.querySelector<HTMLElement>('.sv2-donut');
    if (donutEl) {
      donutEl.innerHTML = `<span><strong>${totalScoreCount}</strong>lượt điểm</span>`;
      if (totalScoreCount > 0) {
        const p0 = (buckets[0] / totalScoreCount) * 100;
        const p1 = p0 + (buckets[1] / totalScoreCount) * 100;
        const p2 = p1 + (buckets[2] / totalScoreCount) * 100;
        donutEl.style.setProperty(
          '--sv2-ring',
          `conic-gradient(var(--sv2-bucket-0) 0% ${p0}%, var(--sv2-bucket-1) ${p0}% ${p1}%, var(--sv2-bucket-2) ${p1}% ${p2}%, var(--sv2-bucket-3) ${p2}% 100%)`
        );
      } else {
        donutEl.style.setProperty('--sv2-ring', 'var(--sv2-border)');
      }
    }
    buckets.forEach((cnt, bIdx) => {
      const pct = totalScoreCount > 0 ? Math.round((cnt / totalScoreCount) * 100) : 0;
      const bEl = dashboardEl.querySelector(`.sv2-bucket-${bIdx} strong`);
      if (bEl) {
        bEl.innerHTML = `<span class="sv2-bucket-count">${cnt} lượt · </span>${pct}%`;
      }
    });
  }

  // 4. Render Results List (`[data-sv2-results]`)
  const resultsEl = viewRoot.querySelector<HTMLElement>('[data-sv2-results]');
  if (!resultsEl) return;

  const distinctTypes = Array.from(new Set(monthScores.map((s) => s.type)));
  const filteredTestGroups = selectedTypeFilter
    ? monthTestGroups.filter((g) => g.type === selectedTypeFilter)
    : monthTestGroups;

  const filterChipsHtml =
    distinctTypes.length > 0
      ? `<div class="sv2-type-filters">
          <button type="button" class="sv2-type-chip ${
            !selectedTypeFilter ? 'is-active' : ''
          }" data-sv2-type-filter="">Tất cả (${monthTestGroups.length})</button>
          ${distinctTypes
            .map(
              (t) =>
                `<button type="button" class="sv2-type-chip ${
                  selectedTypeFilter === t ? 'is-active' : ''
                }" data-sv2-type-filter="${escapeHtml(t)}">${escapeHtml(t)}</button>`
            )
            .join('')}
        </div>`
      : '';

  if (filteredTestGroups.length === 0) {
    resultsEl.innerHTML = `
      <div class="sv2-results-heading" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3>DANH SÁCH BÀI KIỂM TRA</h3>
        <div class="sv2-toolbar">${filterChipsHtml}</div>
      </div>
      <div class="sv2-empty">Chưa có điểm phù hợp với bộ lọc đã chọn. Hãy bấm "+ Nhập điểm" để thêm mới.</div>
    `;
    return;
  }

  const cardsHtml = filteredTestGroups
    .map((group) => {
      const isExpanded = !collapsedTests.has(group.key);
      const rowsHtml = group.records
        .map((rec, idx) => {
          const stu = store.getStudentById(rec.studentId);
          const s10 = (rec.value / (rec.maxScore || 10)) * 10;
          const tier = getScoreTierClass(s10);
          return `<tr>
            <td>${idx + 1}</td>
            <td><strong>${escapeHtml(stu?.name || 'Học sinh')}</strong></td>
            <td><span class="sv2-score-pill ${tier}">${rec.value} / ${rec.maxScore}</span></td>
            <td>${escapeHtml(rec.note || '-')}</td>
            <td style="text-align:right">
              <button type="button" class="btn btn-secondary btn-sm" data-sv2-edit-score="${escapeHtml(
                rec.id
              )}">Sửa</button>
            </td>
          </tr>`;
        })
        .join('');

      return `<article class="sv2-test-card ${isExpanded ? 'is-expanded' : ''}" data-test-key="${escapeHtml(
        group.key
      )}">
        <div class="sv2-test-card-header" data-sv2-toggle-test="${escapeHtml(group.key)}">
          <div class="sv2-test-meta">
            <span class="sv2-badge">${escapeHtml(group.type)}</span>
            <strong>${escapeHtml(group.testName)}</strong>
            <span style="font-size:12px;color:var(--sv2-muted)">· Ngày ${formatDateDMY(
              group.date
            )}</span>
          </div>
          <div class="sv2-test-meta">
            <span class="sv2-badge">TB: ${group.avgOn10} / 10</span>
            <span style="font-size:12px;color:var(--sv2-muted)">${group.records.length} HS</span>
            <button type="button" class="btn btn-secondary btn-sm" data-sv2-add-student-score="${escapeHtml(
              group.key
            )}" title="Thêm điểm học sinh vào bài này">+ Điểm HS</button>
          </div>
        </div>
        <div class="sv2-test-card-body">
          <table class="sv2-table">
            <thead>
              <tr>
                <th style="width:48px">STT</th>
                <th>Học sinh</th>
                <th style="width:120px">Điểm số</th>
                <th>Nhận xét / Ghi chú</th>
                <th style="width:80px;text-align:right">Thao tác</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </article>`;
    })
    .join('');

  resultsEl.innerHTML = `
    <div class="sv2-results-heading" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <h3>DANH SÁCH BÀI KIỂM TRA (${filteredTestGroups.length})</h3>
      <div class="sv2-toolbar">${filterChipsHtml}</div>
    </div>
    <div>${cardsHtml}</div>
  `;
}

// Open Score Modal (#scoreModal) for adding outside score or editing an existing score
export function openScoreModal(options: {
  scoreId?: string;
  studentId?: string;
  classKey?: string;
  prefillTest?: { type: string; testName: string; maxScore: number; date: string; sessionId?: string };
}): void {
  const state = store.getState();
  const modal = document.getElementById('scoreModal');
  if (!modal) return;

  const existing = options.scoreId
    ? state.scores.find((s) => s.id === options.scoreId)
    : undefined;

  const targetStudentId =
    existing?.studentId ||
    options.studentId ||
    (selectedKind === 'student'
      ? selectedKey
      : state.students.find((s) => !s.isFormer)?.id || '');
  const student = store.getStudentById(targetStudentId);
  const targetClassKey =
    existing?.classKey || options.classKey || student?.classIds[0] || state.classes[0]?.id || '';

  modal.dataset.editingScoreId = existing?.id || '';
  modal.dataset.targetStudentId = targetStudentId;
  modal.dataset.targetClassKey = targetClassKey;
  modal.dataset.targetSessionId = existing?.sessionId || options.prefillTest?.sessionId || '';

  const titleEl = document.getElementById('scoreModalTitle');
  if (titleEl) {
    titleEl.textContent = existing ? 'Chỉnh Sửa Điểm' : 'Thêm Điểm Mới';
  }

  // Populate student selector inside #scoreModalStudentLabel so teacher can pick any student when adding
  const labelEl = document.getElementById('scoreModalStudentLabel');
  if (labelEl) {
    if (existing) {
      labelEl.innerHTML = `Học sinh: <strong>${escapeHtml(student?.name || '-')}</strong>`;
    } else {
      const classStudents = state.students.filter(
        (s) =>
          !s.isFormer &&
          (!targetClassKey ||
            s.classIds.some((cid) => cid.toLowerCase() === targetClassKey.toLowerCase()))
      );
      const list = classStudents.length > 0 ? classStudents : state.students;
      labelEl.innerHTML = `<label style="display:flex;align-items:center;gap:10px">
        <span>Học sinh:</span>
        <select id="scoreModalStudentPicker" class="form-control" style="max-width:260px">
          ${list
            .map(
              (s) =>
                `<option value="${escapeHtml(s.id)}" ${
                  s.id === targetStudentId ? 'selected' : ''
                }>${escapeHtml(s.name)}</option>`
            )
            .join('')}
        </select>
      </label>`;
    }
  }

  // Populate scoreType select with saved presets
  const typeSelect = document.getElementById('scoreType') as HTMLSelectElement | null;
  const customTypeInput = document.getElementById('scoreCustomType') as HTMLInputElement | null;
  if (typeSelect) {
    const presetNames = Array.from(
      new Set(['BTVN', 'KTTX', ...state.scorePresets.map((p) => p.name)])
    );
    const currentType = existing?.type || options.prefillTest?.type || 'BTVN';
    typeSelect.innerHTML =
      presetNames
        .map(
          (name) =>
            `<option value="${escapeHtml(name)}" ${
              name === currentType ? 'selected' : ''
            }>${escapeHtml(
              name === 'BTVN'
                ? 'Bài tập về nhà (BTVN)'
                : name === 'KTTX'
                ? 'Kiểm tra thường xuyên'
                : name
            )}</option>`
        )
        .join('') + `<option value="__custom__">+ Thêm loại điểm mới...</option>`;
  }
  if (customTypeInput) {
    customTypeInput.value = '';
    customTypeInput.setAttribute('hidden', '');
    customTypeInput.disabled = true;
  }

  const testNameInput = document.getElementById('scoreTestName') as HTMLInputElement | null;
  const maxInput = document.getElementById('scoreMax') as HTMLInputElement | null;
  const dateInput = document.getElementById('scoreDate') as HTMLInputElement | null;
  const valInput = document.getElementById('scoreValue') as HTMLInputElement | null;
  const noteInput = document.getElementById('scoreNote') as HTMLTextAreaElement | null;
  const deleteBtn = document.getElementById('scoreDeleteBtn');

  if (testNameInput)
    testNameInput.value = existing?.testName || options.prefillTest?.testName || '';
  if (maxInput)
    maxInput.value = String(existing?.maxScore || options.prefillTest?.maxScore || 10);
  if (dateInput)
    dateInput.value =
      existing?.date || options.prefillTest?.date || new Date().toISOString().slice(0, 10);
  if (valInput) valInput.value = existing ? String(existing.value) : '';
  if (noteInput) noteInput.value = existing?.note || '';

  if (deleteBtn) {
    deleteBtn.style.display = existing ? 'inline-flex' : 'none';
  }

  openModal('scoreModal');
}

function openSessionPickerDialogForScores(): void {
  const viewRoot = document.getElementById('view-scores-v2');
  const dialog = viewRoot?.querySelector<HTMLDialogElement>('[data-sv2-dialog]');
  const body = viewRoot?.querySelector<HTMLElement>('[data-sv2-dialog-body]');
  if (!dialog || !body) return;

  const state = store.getState();
  const activeClass =
    selectedKind === 'class'
      ? store.getClassByKey(selectedKey)
      : store.getClassByKey(store.getStudentById(selectedKey)?.classIds[0] || '');

  const sessions = state.sessions
    .filter(
      (s) =>
        !activeClass || s.classKey.toLowerCase() === activeClass.id.toLowerCase()
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  if (sessions.length === 0) {
    body.innerHTML = `<p class="sv2-empty">Chưa có buổi học nào trong lớp này. Bạn có thể chọn "Nhập điểm ngoài buổi học".</p>`;
  } else {
    body.innerHTML = sessions
      .map(
        (s) => `<div class="sv2-session-choice">
          <span>
            <strong>${formatDateDMY(s.date)}</strong>
            <small>${escapeHtml(s.name)} ${
          s.lessonTitle ? `· ${escapeHtml(s.lessonTitle)}` : ''
        }</small>
          </span>
          <button type="button" class="btn btn-secondary btn-sm sv2-button" data-sv2-action="open-session" data-id="${escapeHtml(
            s.id
          )}">Mở buổi học & Nhập điểm</button>
        </div>`
      )
      .join('');
  }

  dialog.dataset.keepOpen = 'true';
  dialog.setAttribute('open', '');
}

export function bindScoresEvents(): void {
  const viewRoot = document.getElementById('view-scores-v2');
  if (!viewRoot) return;

  // Search input in sidebar
  const searchInput = viewRoot.querySelector<HTMLInputElement>('[data-sv2-search]');
  searchInput?.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderScoresView();
  });

  // Delegated click handler inside #view-scores-v2
  viewRoot.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // Select class or student in sidebar
    const selectBtn = target.closest<HTMLElement>('[data-sv2-select]');
    if (selectBtn) {
      selectedKind = (selectBtn.dataset.sv2Kind as 'class' | 'student') || 'class';
      selectedKey = selectBtn.dataset.sv2Select || '';
      renderScoresView();
      return;
    }

    // Toggle class children in sidebar
    const classToggle = target.closest<HTMLElement>('[data-sv2-class-toggle]');
    if (classToggle) {
      const key = classToggle.dataset.sv2ClassToggle || '';
      if (collapsedClasses.has(key)) collapsedClasses.delete(key);
      else collapsedClasses.add(key);
      renderScoresView();
      return;
    }

    // Type filter chip
    const typeChip = target.closest<HTMLElement>('[data-sv2-type-filter]');
    if (typeChip) {
      selectedTypeFilter = typeChip.dataset.sv2TypeFilter || '';
      renderScoresView();
      return;
    }

    // Add student score to an existing test card
    const addStuScoreBtn = target.closest<HTMLElement>('[data-sv2-add-student-score]');
    if (addStuScoreBtn) {
      e.stopPropagation();
      const testKey = addStuScoreBtn.dataset.sv2AddStudentScore || '';
      const [date, type, testName] = testKey.split('__');
      const existingRec = store
        .getState()
        .scores.find((s) => `${s.date}__${s.type}__${s.testName}` === testKey);
      openScoreModal({
        classKey: existingRec?.classKey,
        prefillTest: {
          date,
          type,
          testName,
          maxScore: existingRec?.maxScore || 10,
          sessionId: existingRec?.sessionId,
        },
      });
      return;
    }

    // Edit individual score button
    const editScoreBtn = target.closest<HTMLElement>('[data-sv2-edit-score]');
    if (editScoreBtn) {
      openScoreModal({ scoreId: editScoreBtn.dataset.sv2EditScore });
      return;
    }

    // Toggle test card expand/collapse
    const toggleTestHeader = target.closest<HTMLElement>('[data-sv2-toggle-test]');
    if (toggleTestHeader) {
      const k = toggleTestHeader.dataset.sv2ToggleTest || '';
      if (collapsedTests.has(k)) collapsedTests.delete(k);
      else collapsedTests.add(k);
      renderScoresView();
      return;
    }

    // Actions (`data-sv2-action`)
    const actionBtn = target.closest<HTMLElement>('[data-sv2-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.sv2Action;
      const dialog = viewRoot.querySelector<HTMLDialogElement>('[data-sv2-dialog]');

      if (action === 'entry') {
        openSessionPickerDialogForScores();
      } else if (action === 'close-dialog') {
        if (dialog) {
          delete dialog.dataset.keepOpen;
          dialog.removeAttribute('open');
        }
      } else if (action === 'open-session') {
        const sessId = actionBtn.dataset.id;
        if (dialog) {
          delete dialog.dataset.keepOpen;
          dialog.removeAttribute('open');
        }
        if (sessId) {
          openEditSessionModal(sessId, true);
        }
      } else if (action === 'outside') {
        viewRoot.querySelector('details.sv2-menu')?.removeAttribute('open');
        openScoreModal({});
      } else if (action === 'excel') {
        viewRoot.querySelector('details.sv2-menu')?.removeAttribute('open');
        const st = store.getState();
        const rows = st.scores.map((sc, i) => {
          const stu = store.getStudentById(sc.studentId);
          const cls = store.getClassByKey(sc.classKey);
          return [
            i + 1,
            stu?.name || sc.studentId,
            cls?.name || sc.classKey,
            sc.date,
            sc.type,
            sc.testName,
            sc.value,
            sc.maxScore,
            sc.note || '',
          ];
        });
        downloadCsv(
          `bang-diem-${st.selectedMonth || 'all'}.csv`,
          ['STT', 'Học sinh', 'Lớp', 'Ngày chấm', 'Loại điểm', 'Tên bài kiểm tra', 'Điểm', 'Thang điểm', 'Ghi chú'],
          rows
        );
        showToast('Đã xuất file Excel (CSV) bảng điểm.');
      } else if (action === 'expand') {
        viewRoot.querySelector('details.sv2-menu')?.removeAttribute('open');
        collapsedTests.clear();
        renderScoresView();
      } else if (action === 'collapse') {
        viewRoot.querySelector('details.sv2-menu')?.removeAttribute('open');
        store.getState().scores.forEach((sc) => {
          collapsedTests.add(`${sc.date}__${sc.type}__${sc.testName}`);
        });
        renderScoresView();
      } else if (action === 'dashboard') {
        isDashboardCollapsed = !isDashboardCollapsed;
        renderScoresView();
      }
    }
  });

  // Score Modal Events (#scoreModal)
  const scoreTypeSelect = document.getElementById('scoreType') as HTMLSelectElement | null;
  const scoreCustomType = document.getElementById('scoreCustomType') as HTMLInputElement | null;
  scoreTypeSelect?.addEventListener('change', () => {
    if (!scoreCustomType) return;
    if (scoreTypeSelect.value === '__custom__') {
      scoreCustomType.removeAttribute('hidden');
      scoreCustomType.classList.remove('sf-hidden');
      scoreCustomType.disabled = false;
      scoreCustomType.focus();
    } else {
      scoreCustomType.setAttribute('hidden', '');
      scoreCustomType.disabled = true;
      const preset = store
        .getState()
        .scorePresets.find((p) => p.name === scoreTypeSelect.value);
      const maxInput = document.getElementById('scoreMax') as HTMLInputElement | null;
      if (preset && maxInput) {
        maxInput.value = String(preset.maxScore);
      }
    }
  });

  const scoreForm = document.getElementById('scoreForm') as HTMLFormElement | null;
  scoreForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const modal = document.getElementById('scoreModal');
    if (!modal) return;

    const editingId = modal.dataset.editingScoreId || '';
    const picker = document.getElementById('scoreModalStudentPicker') as HTMLSelectElement | null;
    const studentId = picker ? picker.value : modal.dataset.targetStudentId || '';
    const stu = store.getStudentById(studentId);
    const classKey = modal.dataset.targetClassKey || stu?.classIds[0] || 'tieng anh 2';
    const sessionId = modal.dataset.targetSessionId || undefined;

    const rawType = scoreTypeSelect?.value || 'BTVN';
    const finalType =
      rawType === '__custom__'
        ? scoreCustomType?.value.trim() || 'Điểm khác'
        : rawType;
    const testName =
      (document.getElementById('scoreTestName') as HTMLInputElement | null)?.value.trim() ||
      'Bài kiểm tra';
    const maxScore =
      parseFloat(
        (document.getElementById('scoreMax') as HTMLInputElement | null)?.value || '10'
      ) || 10;
    const date =
      (document.getElementById('scoreDate') as HTMLInputElement | null)?.value ||
      new Date().toISOString().slice(0, 10);
    const value = parseFloat(
      ((document.getElementById('scoreValue') as HTMLInputElement | null)?.value || '0').replace(
        ',',
        '.'
      )
    );
    const note =
      (document.getElementById('scoreNote') as HTMLTextAreaElement | null)?.value.trim() || '';

    if (isNaN(value) || value < 0 || value > maxScore) {
      showToast(`Điểm số phải từ 0 đến ${maxScore}.`, 'error');
      return;
    }

    store.update((draft) => {
      if (rawType === '__custom__' && finalType) {
        if (!draft.scorePresets.some((p) => p.name.toLowerCase() === finalType.toLowerCase())) {
          draft.scorePresets.push({
            id: generateId('preset'),
            name: finalType,
            maxScore,
          });
        }
      }

      if (editingId) {
        const rec = draft.scores.find((s) => s.id === editingId);
        if (rec) {
          rec.type = finalType;
          rec.testName = testName;
          rec.maxScore = maxScore;
          rec.date = date;
          rec.value = value;
          rec.note = note;
        }
      } else {
        draft.scores.push({
          id: generateId('score'),
          studentId,
          classKey,
          sessionId,
          type: finalType,
          testName,
          maxScore,
          date,
          value,
          note,
        });
      }
    });

    closeModal('scoreModal');
    showToast(editingId ? 'Đã cập nhật điểm số.' : 'Đã thêm điểm mới.');
  });

  // Delete score button
  document.getElementById('scoreDeleteBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('scoreModal');
    const editingId = modal?.dataset.editingScoreId;
    if (!editingId) return;

    store.update((draft) => {
      draft.scores = draft.scores.filter((s) => s.id !== editingId);
    }, 'Xóa điểm');

    closeModal('scoreModal');
    showToast('Đã xóa điểm số.', 'info', true);
  });
}
