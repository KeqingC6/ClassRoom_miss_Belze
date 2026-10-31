import type { AppState, ClassGroup, ClassSession, Student, TuitionStatusValue } from './types';
import { createInitialSeedState } from './seed';

const STORAGE_KEY = 'nttclass_app_state_v1';

type Listener = () => void;

class Store {
  private state: AppState;
  private listeners: Set<Listener> = new Set();
  private undoSnapshot: { label: string; stateJson: string } | null = null;

  constructor() {
    this.state = this.load();
  }

  private load(): AppState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        const seed = createInitialSeedState();
        return {
          ...seed,
          ...parsed,
          profile: { ...seed.profile, ...(parsed.profile || {}) },
          preferences: {
            ...seed.preferences,
            ...(parsed.preferences || {}),
            journalColumns: { ...seed.preferences.journalColumns, ...(parsed.preferences?.journalColumns || {}) },
            tuitionColumns: { ...seed.preferences.tuitionColumns, ...(parsed.preferences?.tuitionColumns || {}) },
            hubColumns: { ...seed.preferences.hubColumns, ...(parsed.preferences?.hubColumns || {}) },
            featureToggles: { ...seed.preferences.featureToggles, ...(parsed.preferences?.featureToggles || {}) },
          },
          invoiceSettings: {
            ...seed.invoiceSettings,
            ...(parsed.invoiceSettings || {}),
          },
          albums: Array.isArray(parsed.albums) ? parsed.albums : seed.albums,
          sessionAlbums: {
            ...seed.sessionAlbums,
            ...(parsed.sessionAlbums || {}),
          },
          driveConfig: {
            ...seed.driveConfig,
            ...(parsed.driveConfig || {}),
            rootFolderId:
              parsed.driveConfig?.rootFolderId?.trim() || '1Wvv1jQdaizAOwTc9LZ9JEutwbLj1FQeN',
            classFolderIds: {
              ...seed.driveConfig.classFolderIds,
              ...(parsed.driveConfig?.classFolderIds || {}),
            },
          },
        };
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage, falling back to seed.', e);
    }
    return createInitialSeedState();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('Failed to persist state to localStorage', e);
    }
  }

  getState(): AppState {
    return this.state;
  }

  update(mutator: (draft: AppState) => void, saveUndoLabel?: string): void {
    if (saveUndoLabel) {
      this.undoSnapshot = {
        label: saveUndoLabel,
        stateJson: JSON.stringify(this.state),
      };
    }
    mutator(this.state);
    this.save();
    this.notify();
  }

  canUndo(): boolean {
    return this.undoSnapshot !== null;
  }

  undo(): string | null {
    if (!this.undoSnapshot) return null;
    const { label, stateJson } = this.undoSnapshot;
    this.undoSnapshot = null;
    this.state = JSON.parse(stateJson);
    this.save();
    this.notify();
    return label;
  }

  resetToSeed(): void {
    this.state = createInitialSeedState();
    this.save();
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  // Helper selectors
  getClassByKey(key: string): ClassGroup | undefined {
    const normalized = key.trim().toLowerCase();
    return this.state.classes.find(
      (c) => c.id.toLowerCase() === normalized || c.name.toLowerCase() === normalized
    );
  }

  getStudentById(id: string): Student | undefined {
    return this.state.students.find((s) => s.id === id);
  }

  getSessionsInMonth(month: string): ClassSession[] {
    if (!month) return [...this.state.sessions].sort((a, b) => a.date.localeCompare(b.date));
    return this.state.sessions
      .filter((s) => s.date.startsWith(month))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }

  getStudentSessions(studentId: string, month?: string): ClassSession[] {
    const targetMonth = month !== undefined ? month : this.state.selectedMonth;
    return this.state.sessions
      .filter((s) => {
        if (!s.studentIds.includes(studentId)) return false;
        if (targetMonth && !s.date.startsWith(targetMonth)) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }

  calculateStudentTuitionForMonth(student: Student, cls: ClassGroup, month: string) {
    const sessions = this.state.sessions.filter(
      (s) =>
        s.classKey.toLowerCase() === cls.id.toLowerCase() &&
        s.studentIds.includes(student.id) &&
        (!month || s.date.startsWith(month))
    );
    const sessionCount = sessions.length;
    const totalHours = sessions.reduce((acc, s) => acc + (Number(s.hours) || 0), 0);

    let baseFee = 0;
    if (cls.billingMode === 'month' || cls.billingMode === 'course') {
      baseFee = cls.fee || student.basePrice || 0;
    } else if (cls.billingMode === 'hour') {
      baseFee = Math.round(totalHours * (cls.fee || student.basePrice || 0));
    } else {
      // per session
      baseFee = sessions.reduce((acc, s) => acc + (s.price > 0 ? s.price : cls.fee || student.basePrice || 0), 0);
    }

    // Adjustments in month
    const monthStart = month ? `${month}-01` : '0000-01-01';
    const monthEnd = month ? `${month}-31` : '9999-12-31';
    const matchingAdj = this.state.adjustments.filter(
      (a) =>
        a.studentIds.includes(student.id) &&
        a.dateStart <= monthEnd &&
        a.dateEnd >= monthStart
    );

    let surcharge = 0;
    let discount = 0;
    for (const a of matchingAdj) {
      const amt = a.mode === 'percent' ? Math.round((baseFee * a.value) / 100) : a.value;
      if (a.type === 'surcharge') surcharge += amt;
      else discount += amt;
    }

    const total = Math.max(0, baseFee + surcharge - discount);

    const statusKey = `${student.id}_${month || 'all'}_${cls.id}`;
    const explicitStatus: TuitionStatusValue | undefined = this.state.tuitionStatuses[statusKey];

    const recordedPayments = this.state.payments.filter(
      (p) =>
        p.studentId === student.id &&
        p.classKey.toLowerCase() === cls.id.toLowerCase() &&
        (!month || p.month === month)
    );
    const paidFromRecords = recordedPayments.reduce((s, p) => s + p.amount, 0);

    const prepayments = this.state.prepayments.filter(
      (p) => p.studentId === student.id && p.classKey.toLowerCase() === cls.id.toLowerCase()
    );
    const prepaidTotal = prepayments.reduce((s, p) => s + p.amount, 0);

    let paid = paidFromRecords + Math.min(total - paidFromRecords, Math.max(0, prepaidTotal));
    let status: TuitionStatusValue = explicitStatus || 'unpaid';

    if (explicitStatus === 'paid') {
      paid = total;
      status = 'paid';
    } else if (explicitStatus === 'unpaid' && paidFromRecords === 0) {
      paid = 0;
      status = 'unpaid';
    } else if (paid >= total && total > 0) {
      paid = total;
      status = 'paid';
    } else if (paid > 0 && paid < total) {
      status = 'partial';
    }

    const unpaid = Math.max(0, total - paid);
    return {
      sessionCount,
      totalHours,
      baseFee,
      surcharge,
      discount,
      total,
      paid,
      unpaid,
      status,
    };
  }
}

export const store = new Store();
