export type ViewId =
  | 'view-dashboard'
  | 'view-logs'
  | 'view-scheduler'
  | 'view-tuition'
  | 'view-student-class-hub'
  | 'view-scores-v2'
  | 'view-feedback'
  | 'view-subscription-renewal'
  | 'view-user-guide'
  | 'view-users';

export type BillingMode = 'session' | 'hour' | 'month' | 'course';

export interface ClassGroup {
  id: string;        // e.g. "tieng anh 2"
  name: string;      // e.g. "Tiếng Anh 2"
  subject: string;   // e.g. "Tiếng Anh"
  color: string;     // e.g. "#B0E0FF"
  colorMode: 'auto' | 'custom';
  defaultDuration: number; // hours, e.g. 2
  billingMode: BillingMode;
  fee: number;       // VND, e.g. 500000
  billingStartDate?: string; // YYYY-MM-DD
  billingEndDate?: string;   // YYYY-MM-DD
  surchargeName?: string;
  surchargeAmount?: number;
}

export interface Student {
  id: string;
  name: string;
  dob: string;
  phone: string;
  school: string;
  note: string;
  basePrice: number;
  startDate: string;
  endDate: string;
  isFormer: boolean;
  classIds: string[]; // matches ClassGroup.id
  customJournalTitle?: string;
}

export interface SessionStudentRecord {
  studentId: string;
  homeworkPercent: string; // "" | "0%" | "10%" ... | "100%"
  attitude: string;
  comment: string;
  note: string;
}

export interface ClassSession {
  id: string;
  type: 'riêng' | 'chung';
  classKey: string;
  name: string;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  hours: number;
  price: number;      // 0 if fixed monthly class
  lessonTitle: string;
  content: string;
  homeworkContent: string;
  studentIds: string[];
  records: Record<string, SessionStudentRecord>;
  recurrenceId?: string;
}

export interface ScoreRecord {
  id: string;
  studentId: string;
  classKey: string;
  sessionId?: string;
  type: string;       // e.g. "BTVN", "KTTX", "KTĐK"
  testName: string;
  maxScore: number;   // default 10
  date: string;       // YYYY-MM-DD
  value: number;
  note: string;
}

export interface ScorePreset {
  id: string;
  name: string;
  maxScore: number;
}

export type TuitionStatusValue = 'paid' | 'unpaid' | 'partial';

export interface TuitionPayment {
  id: string;
  studentId: string;
  classKey: string;
  month: string;      // YYYY-MM
  date: string;       // YYYY-MM-DD
  amount: number;
  note: string;
}

export interface ClassPrepayment {
  id: string;
  classKey: string;
  studentId: string;
  amount: number;
  date: string;
  note: string;
}

export interface TuitionAdjustment {
  id: string;
  type: 'surcharge' | 'discount';
  mode: 'fixed' | 'percent';
  value: number;
  name: string;
  note: string;
  dateStart: string;
  dateEnd: string;
  studentIds: string[];
  paid: boolean;
}

export interface AssistantUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: 'assistant';
  createdAt: string;
  lastOnline: string;
  isOnline: boolean;
}

export interface FeedbackMessage {
  id: string;
  sender: 'teacher' | 'admin';
  text: string;
  attachmentName?: string;
  createdAt: string;
}

export interface RenewalOrder {
  id: string;
  planId: string;
  planName: string;
  months: number;
  amount: number;
  createdAt: string;
  status: 'pending' | 'paid';
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  transferContent: string;
}

export interface InvoiceSettings {
  teacherName: string;
  teacherPhone: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  qrDataUrl?: string;
  qr2BankName?: string;
  qr2BankAccountNumber?: string;
  qr2BankAccountHolder?: string;
  qr2DataUrl?: string;
  showStudentInfo: boolean;
  closingNote: string;
  commentPresets: {
    overview: string[];
    algebra: string[];
    geometry: string[];
    roadmap: string[];
  };
}

export interface AppPreferences {
  themeId: string;
  paletteStyle: 'decorated' | 'flat';
  glassOpacity: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  journalColumns: Record<string, boolean>;
  tuitionColumns: Record<string, boolean>;
  hubColumns: Record<string, boolean>;
  featureToggles: {
    sessionFees: boolean;
    learningJournal: boolean;
    scores: boolean;
    tuitionTrend: boolean;
    tuitionSurcharges: boolean;
    tuitionDiscounts: boolean;
    assistants: boolean;
    googleCalendar: boolean;
  };
  calendarDisplayStart: string;
  calendarDisplayEnd: string;
  calendarShowSessionPrices: boolean;
  calendarShowAttendanceTag: boolean;
}

export interface AppState {
  currentView: ViewId;
  selectedMonth: string; // e.g. "2026-10" or "" for all
  dateRangeStart: string; // e.g. "2026-10-01"
  dateRangeEnd: string;   // e.g. "2026-10-31"
  profile: {
    displayName: string;
    roleLabel: string;
    dob: string;
    email: string;
    phone: string;
    avatarLetter: string;
  };
  classes: ClassGroup[];
  students: Student[];
  sessions: ClassSession[];
  scores: ScoreRecord[];
  scorePresets: ScorePreset[];
  tuitionStatuses: Record<string, TuitionStatusValue>; // key: `${studentId}_${month}_${classKey}`
  payments: TuitionPayment[];
  prepayments: ClassPrepayment[];
  adjustments: TuitionAdjustment[];
  assistants: AssistantUser[];
  feedbacks: FeedbackMessage[];
  renewalOrders: RenewalOrder[];
  invoiceSettings: InvoiceSettings;
  preferences: AppPreferences;
}
