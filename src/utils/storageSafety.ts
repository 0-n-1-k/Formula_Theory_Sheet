export type TabMode = 'fm' | 'thm';
export type CourseCode = 'ALL' | 'EEE' | 'M157' | 'M159' | 'PHY' | 'CSE' | 'GEN';
export type StatusFilter = 'all' | 'starred' | 'unlearned';

export interface PersistedAppState {
  tab: TabMode;
  course: CourseCode;
  status: StatusFilter;
  selfTest: boolean;
  hideDetails: boolean;
  singleCol: boolean;
  goalOpen: boolean;
  examDate: string;
  learned: Record<string, boolean>;
  starred: Record<string, boolean>;
}

export const VALID_TABS: readonly TabMode[] = ['fm', 'thm'];
export const VALID_COURSES: readonly CourseCode[] = ['ALL', 'EEE', 'M157', 'M159', 'PHY', 'CSE', 'GEN'];
export const VALID_STATUSES: readonly StatusFilter[] = ['all', 'starred', 'unlearned'];

export const DEFAULT_APP_STATE: PersistedAppState = {
  tab: 'fm',
  course: 'ALL',
  status: 'all',
  selfTest: false,
  hideDetails: false,
  singleCol: false,
  goalOpen: false,
  examDate: '2026-11-15',
  learned: {},
  starred: {},
};

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sanitizeBooleanMap(input: unknown): Record<string, boolean> {
  if (!isPlainRecord(input)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(input)) {
    if (typeof key === 'string' && key.trim().length > 0 && Boolean(val)) {
      out[key] = true;
    }
  }
  return out;
}

export function sanitizeExamDate(input: unknown, fallback = DEFAULT_APP_STATE.examDate): string {
  if (input === '') return '';
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return fallback;
  const d = new Date(trimmed + 'T09:00:00');
  return Number.isNaN(d.getTime()) ? fallback : trimmed;
}

export function sanitizePersistedState(
  raw: unknown,
  defaults: PersistedAppState = DEFAULT_APP_STATE
): PersistedAppState {
  if (!isPlainRecord(raw)) {
    return {
      ...defaults,
      learned: { ...defaults.learned },
      starred: { ...defaults.starred },
    };
  }

  const tab = VALID_TABS.includes(raw.tab as TabMode) ? (raw.tab as TabMode) : defaults.tab;
  const course = VALID_COURSES.includes(raw.course as CourseCode)
    ? (raw.course as CourseCode)
    : defaults.course;
  const status = VALID_STATUSES.includes(raw.status as StatusFilter)
    ? (raw.status as StatusFilter)
    : defaults.status;

  return {
    tab,
    course,
    status,
    selfTest: typeof raw.selfTest === 'boolean' ? raw.selfTest : defaults.selfTest,
    hideDetails: typeof raw.hideDetails === 'boolean' ? raw.hideDetails : defaults.hideDetails,
    singleCol: typeof raw.singleCol === 'boolean' ? raw.singleCol : defaults.singleCol,
    goalOpen: typeof raw.goalOpen === 'boolean' ? raw.goalOpen : defaults.goalOpen,
    examDate: sanitizeExamDate(raw.examDate, defaults.examDate),
    learned: sanitizeBooleanMap(raw.learned),
    starred: sanitizeBooleanMap(raw.starred),
  };
}

export function safeReadStorage(
  storageKey: string,
  defaults: PersistedAppState = DEFAULT_APP_STATE,
  storage?: Pick<Storage, 'getItem'> | null
): PersistedAppState {
  try {
    const store = storage !== undefined ? storage : typeof localStorage !== 'undefined' ? localStorage : null;
    if (!store) {
      return sanitizePersistedState(null, defaults);
    }
    const rawText = store.getItem(storageKey);
    if (!rawText) {
      return sanitizePersistedState(null, defaults);
    }
    const parsed = JSON.parse(rawText);
    return sanitizePersistedState(parsed, defaults);
  } catch {
    return sanitizePersistedState(null, defaults);
  }
}

export function safeWriteStorage(
  storageKey: string,
  state: PersistedAppState,
  storage?: Pick<Storage, 'setItem'> | null
): boolean {
  try {
    const store = storage !== undefined ? storage : typeof localStorage !== 'undefined' ? localStorage : null;
    if (!store) return false;
    const clean = sanitizePersistedState(state);
    store.setItem(storageKey, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export interface JsonImportValidationResult {
  ok: boolean;
  error?: string;
  data?: {
    learned: Record<string, boolean>;
    starred: Record<string, boolean>;
    examDate?: string;
  };
}

export function validateJsonImportPayload(rawText: string): JsonImportValidationResult {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return { ok: false, error: 'EMPTY JSON INPUT' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'INVALID JSON FORMAT' };
  }

  if (!isPlainRecord(parsed)) {
    return { ok: false, error: 'INVALID JSON: MUST BE AN OBJECT' };
  }

  const hasRecognizedKey =
    'learned' in parsed ||
    'starred' in parsed ||
    'examDate' in parsed;

  if (!hasRecognizedKey) {
    return { ok: false, error: 'INVALID BACKUP: MISSING PROGRESS FIELDS' };
  }

  if ('learned' in parsed && parsed.learned !== undefined && !isPlainRecord(parsed.learned)) {
    return { ok: false, error: 'INVALID BACKUP: LEARNED MUST BE AN OBJECT' };
  }

  if ('starred' in parsed && parsed.starred !== undefined && !isPlainRecord(parsed.starred)) {
    return { ok: false, error: 'INVALID BACKUP: STARRED MUST BE AN OBJECT' };
  }

  if ('examDate' in parsed && parsed.examDate !== undefined && parsed.examDate !== '') {
    if (typeof parsed.examDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.examDate.trim())) {
      return { ok: false, error: 'INVALID BACKUP: EXAM DATE FORMAT' };
    }
  }

  return {
    ok: true,
    data: {
      learned: sanitizeBooleanMap(parsed.learned),
      starred: sanitizeBooleanMap(parsed.starred),
      examDate:
        typeof parsed.examDate === 'string'
          ? sanitizeExamDate(parsed.examDate, DEFAULT_APP_STATE.examDate)
          : undefined,
    },
  };
}
