import { CURRENT_TERM_CONFIG } from '../termConfig';

export type TabMode = 'fm' | 'thm' | 'prac';
export type CourseCode = string;
export type StatusFilter = 'all' | 'starred' | 'unlearned';

export const MAX_SEARCH_HISTORY = 8;
export const MAX_IMPORT_PAYLOAD_BYTES = 500 * 1024;

export function getTermStorageKey(termId: string = CURRENT_TERM_CONFIG.termId): string {
  return `buet_eee_${termId}_v2_state`;
}

export const ACTIVE_STORAGE_KEY = getTermStorageKey(CURRENT_TERM_CONFIG.termId);

export const MAX_CARD_NOTE_LENGTH = 2000;

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
  notes?: Record<string, string>;
  searchHistory?: string[];
  courseBarCollapsed?: boolean;
}

export const VALID_TABS: readonly TabMode[] = ['fm', 'thm', 'prac'];
export const VALID_STATUSES: readonly StatusFilter[] = ['all', 'starred', 'unlearned'];

export function getValidCoursesForTerm(
  extraCourseCodes: Iterable<string> = []
): ReadonlySet<string> {
  const set = new Set<string>(['ALL', 'GEN']);
  for (const c of CURRENT_TERM_CONFIG.courses) {
    set.add(c.code);
  }
  for (const extra of extraCourseCodes) {
    if (typeof extra === 'string' && extra.trim().length > 0) {
      set.add(extra.trim());
    }
  }
  return set;
}

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
  notes: {},
  searchHistory: [],
  courseBarCollapsed: false,
};

export const BUET_LOGO_ASCII_ART = [
  '    .:=**#**=:.    ',
  '  .+%%##++**#%%+.  ',
  ' -%@#--#*+-===+@%- ',
  ':%@@#*+%@*======%%:',
  '=@**+*+*#======-+@=',
  ':%%---=-===++==-%%:',
  ' -@@%%%#@*-===+%@- ',
  '  .*@@@@@#+*#%%*.  ',
  '    .-+#*%*#+-.    ',
].join('\n');

export function resetToHomeFormulasState(prev: PersistedAppState): PersistedAppState {
  return {
    ...prev,
    tab: 'fm',
    course: 'ALL',
    status: 'all',
    goalOpen: false,
    hideDetails: false,
  };
}

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

export function sanitizeNotesMap(
  input: unknown,
  maxLength: number = MAX_CARD_NOTE_LENGTH
): Record<string, string> {
  if (!isPlainRecord(input)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(input)) {
    if (typeof key !== 'string' || key.trim().length === 0) continue;
    if (typeof val !== 'string') continue;
    const trimmed = val.trim();
    if (!trimmed) continue;
    out[key] = trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
  }
  return out;
}

export function sanitizeSearchHistory(input: unknown, maxItems = MAX_SEARCH_HISTORY): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length < 2) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function updateSearchHistoryList(
  prevHistory: string[] | undefined,
  rawQuery: string,
  maxItems = MAX_SEARCH_HISTORY
): string[] {
  const current = sanitizeSearchHistory(prevHistory, maxItems);
  const trimmed = (rawQuery || '').trim();
  if (trimmed.length < 2) return current;

  const lowerNew = trimmed.toLowerCase();
  if (current.length > 0) {
    const topLower = current[0].toLowerCase();
    if (topLower === lowerNew) {
      return current;
    }
    // If the new query extends the most recent history entry (e.g. 'cauc' -> 'cauchy') or vice-versa,
    // replace the top entry instead of creating duplicate partial entries.
    if (lowerNew.startsWith(topLower) || topLower.startsWith(lowerNew)) {
      const rest = current.slice(1).filter((item) => item.toLowerCase() !== lowerNew);
      return [trimmed, ...rest].slice(0, maxItems);
    }
  }

  const filtered = current.filter((item) => item.toLowerCase() !== lowerNew);
  return [trimmed, ...filtered].slice(0, maxItems);
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
  defaults: PersistedAppState = DEFAULT_APP_STATE,
  extraCourseCodes: Iterable<string> = []
): PersistedAppState {
  if (!isPlainRecord(raw)) {
    return {
      ...defaults,
      learned: { ...defaults.learned },
      starred: { ...defaults.starred },
      notes: { ...(defaults.notes || {}) },
      searchHistory: [...(defaults.searchHistory || [])],
      courseBarCollapsed: Boolean(defaults.courseBarCollapsed),
    };
  }

  const validCourseSet = getValidCoursesForTerm(extraCourseCodes);
  const tab = VALID_TABS.includes(raw.tab as TabMode) ? (raw.tab as TabMode) : defaults.tab;
  const course =
    typeof raw.course === 'string' && validCourseSet.has(raw.course)
      ? raw.course
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
    notes: sanitizeNotesMap(raw.notes),
    searchHistory:
      raw.searchHistory !== undefined
        ? sanitizeSearchHistory(raw.searchHistory)
        : [...(defaults.searchHistory || [])],
    courseBarCollapsed:
      typeof raw.courseBarCollapsed === 'boolean'
        ? raw.courseBarCollapsed
        : Boolean(defaults.courseBarCollapsed),
  };
}

export function safeReadStorage(
  storageKey: string,
  defaults: PersistedAppState = DEFAULT_APP_STATE,
  storage?: Pick<Storage, 'getItem'> | null,
  extraCourseCodes: Iterable<string> = []
): PersistedAppState {
  try {
    const store = storage !== undefined ? storage : typeof localStorage !== 'undefined' ? localStorage : null;
    if (!store) {
      return sanitizePersistedState(null, defaults, extraCourseCodes);
    }
    const rawText = store.getItem(storageKey);
    if (!rawText) {
      return sanitizePersistedState(null, defaults, extraCourseCodes);
    }
    const parsed = JSON.parse(rawText);
    return sanitizePersistedState(parsed, defaults, extraCourseCodes);
  } catch {
    return sanitizePersistedState(null, defaults, extraCourseCodes);
  }
}

export function safeWriteStorage(
  storageKey: string,
  state: PersistedAppState,
  storage?: Pick<Storage, 'setItem'> | null,
  extraCourseCodes: Iterable<string> = []
): boolean {
  try {
    const store = storage !== undefined ? storage : typeof localStorage !== 'undefined' ? localStorage : null;
    if (!store) return false;
    const clean = sanitizePersistedState(state, DEFAULT_APP_STATE, extraCourseCodes);
    store.setItem(storageKey, JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export interface JsonImportStats {
  learnedCount: number;
  starredCount: number;
  notesCount: number;
  ignoredLearnedCount: number;
  ignoredStarredCount: number;
  ignoredNotesCount: number;
}

export interface JsonImportValidationResult {
  ok: boolean;
  error?: string;
  data?: {
    learned: Record<string, boolean>;
    starred: Record<string, boolean>;
    notes?: Record<string, string>;
    examDate?: string;
  };
  stats?: JsonImportStats;
}

function getUtf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).byteLength;
  }
  return text.length * 2;
}

export function validateJsonImportPayload(
  rawText: string,
  knownCardIds?: ReadonlySet<string>
): JsonImportValidationResult {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return { ok: false, error: 'EMPTY JSON INPUT' };
  }

  if (getUtf8ByteLength(rawText) > MAX_IMPORT_PAYLOAD_BYTES) {
    return { ok: false, error: 'IMPORT TOO LARGE (MAX 500 KB)' };
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
    'notes' in parsed ||
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

  if ('notes' in parsed && parsed.notes !== undefined && !isPlainRecord(parsed.notes)) {
    return { ok: false, error: 'INVALID BACKUP: NOTES MUST BE AN OBJECT' };
  }

  if ('examDate' in parsed && parsed.examDate !== undefined && parsed.examDate !== '') {
    if (typeof parsed.examDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.examDate.trim())) {
      return { ok: false, error: 'INVALID BACKUP: EXAM DATE FORMAT' };
    }
  }

  const rawLearned = sanitizeBooleanMap(parsed.learned);
  const rawStarred = sanitizeBooleanMap(parsed.starred);
  const hasNotesField = 'notes' in parsed && parsed.notes !== undefined;
  const rawNotes = hasNotesField ? sanitizeNotesMap(parsed.notes) : undefined;

  let learned: Record<string, boolean> = rawLearned;
  let starred: Record<string, boolean> = rawStarred;
  let notes: Record<string, string> | undefined = rawNotes;
  let ignoredLearnedCount = 0;
  let ignoredStarredCount = 0;
  let ignoredNotesCount = 0;

  if (knownCardIds && knownCardIds.size > 0) {
    learned = {};
    for (const key of Object.keys(rawLearned)) {
      if (knownCardIds.has(key)) {
        learned[key] = true;
      } else {
        ignoredLearnedCount++;
      }
    }
    starred = {};
    for (const key of Object.keys(rawStarred)) {
      if (knownCardIds.has(key)) {
        starred[key] = true;
      } else {
        ignoredStarredCount++;
      }
    }
    if (rawNotes) {
      notes = {};
      for (const [key, val] of Object.entries(rawNotes)) {
        if (knownCardIds.has(key)) {
          notes[key] = val;
        } else {
          ignoredNotesCount++;
        }
      }
    }
  }

  return {
    ok: true,
    data: {
      learned,
      starred,
      notes,
      examDate:
        typeof parsed.examDate === 'string'
          ? sanitizeExamDate(parsed.examDate, DEFAULT_APP_STATE.examDate)
          : undefined,
    },
    stats: {
      learnedCount: Object.keys(learned).length,
      starredCount: Object.keys(starred).length,
      notesCount: notes ? Object.keys(notes).length : 0,
      ignoredLearnedCount,
      ignoredStarredCount,
      ignoredNotesCount,
    },
  };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy textarea copy fallback
    }
  }

  if (typeof document === 'undefined' || !document.body) {
    return false;
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    document.body.removeChild(textarea);
    return Boolean(copied);
  } catch {
    return false;
  }
}

export interface HashTargetSectionRef {
  id: string;
  course: string;
  sourceTab: 'fm' | 'thm' | 'gen';
}

export type ResolvedHashTarget =
  | { found: true; id: string; course: string; sourceTab: 'fm' | 'thm' | 'gen' }
  | { found: false; rawId: string };

export function resolveHashTarget(
  rawHash: string,
  sections: ReadonlyArray<HashTargetSectionRef>
): ResolvedHashTarget | null {
  if (typeof rawHash !== 'string') return null;
  const stripped = rawHash.replace(/^#/, '').trim();
  if (!stripped) return null;

  let decoded = stripped;
  try {
    decoded = decodeURIComponent(stripped);
  } catch {
    decoded = stripped;
  }

  const exact = sections.find((s) => s.id === decoded);
  if (exact) {
    return {
      found: true,
      id: exact.id,
      course: exact.course,
      sourceTab: exact.sourceTab,
    };
  }

  const lower = decoded.toLowerCase();
  const ciMatch = sections.find((s) => s.id.toLowerCase() === lower);
  if (ciMatch) {
    return {
      found: true,
      id: ciMatch.id,
      course: ciMatch.course,
      sourceTab: ciMatch.sourceTab,
    };
  }

  return { found: false, rawId: decoded };
}

export interface SafeSectionParseResult<T> {
  sections: T[];
  error: string | null;
}

export function safeParseSectionGroup<T>(
  label: string,
  rawHtml: string,
  parser: (html: string) => T[]
): SafeSectionParseResult<T> {
  try {
    return { sections: parser(rawHtml), error: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      sections: [],
      error: `${label}: ${detail}`,
    };
  }
}

export const MIN_HUD_HEIGHT_PX = 210;
export const MAX_HUD_HEIGHT_RATIO = 0.92;

export function clampHudHeightPx(pointerY: number, viewportHeight: number): number {
  const safeViewport = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 900;
  const maxPx = Math.max(MIN_HUD_HEIGHT_PX, Math.round(safeViewport * MAX_HUD_HEIGHT_RATIO));
  if (!Number.isFinite(pointerY)) {
    return Math.round(safeViewport * 0.5);
  }
  return Math.min(maxPx, Math.max(MIN_HUD_HEIGHT_PX, Math.round(pointerY)));
}

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
export type ResizeCorner = ResizeDirection;
export type PinnedCardSizeMode = 'formula-only' | 'compact' | 'full';

export interface PinnedCardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export const PINNED_MIN_WIDTH = 240;
export const PINNED_MAX_WIDTH = 1120;
export const PINNED_DEFAULT_WIDTH = 420;
export const PINNED_WIDE_DEFAULT_WIDTH = 560;
export const PINNED_MIN_HEIGHT = 104;
export const PINNED_MAX_HEIGHT = 820;
export const PINNED_DEFAULT_HEIGHT = 330;
export const PINNED_WIDE_DEFAULT_HEIGHT = 420;
export const PINNED_FORMULA_ONLY_MAX_HEIGHT = 155;
export const PINNED_FORMULA_ONLY_MAX_WIDTH = 290;

export function clampPinnedCardPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth = 1440,
  viewportHeight = 900
): { x: number; y: number } {
  const safeVw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1440;
  const safeVh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 900;
  const maxX = Math.max(8, safeVw - Math.min(width, safeVw - 16) - 8);
  const maxY = Math.max(8, safeVh - Math.min(height, safeVh - 16) - 8);
  return {
    x: Math.min(maxX, Math.max(8, Math.round(x))),
    y: Math.min(maxY, Math.max(8, Math.round(y))),
  };
}

export interface PinnedCardContentSizingInput {
  rawLatex?: string;
  codeContent?: string;
  htmlContent?: string;
  hasSteps?: boolean;
  isWide?: boolean;
}

export function estimatePinnedCardSize(
  input: PinnedCardContentSizingInput
): { width: number; height: number } {
  const rawLatex = (input.rawLatex ?? '').trim();
  const codeContent = (input.codeContent ?? '').trim();
  const htmlContent = (input.htmlContent ?? '').trim();
  const stepsExtra = input.hasSteps ? 38 : 0;

  let width = PINNED_DEFAULT_WIDTH;
  let height = 180;

  if (codeContent) {
    const lines = codeContent.split('\n');
    const maxLineLen = lines.reduce((m, line) => Math.max(m, line.length), 0);
    width = Math.round(Math.min(720, Math.max(480, 120 + Math.min(82, maxLineLen) * 7.5)));
    const htmlExtra = htmlContent ? 56 : 0;
    const latexExtra = rawLatex ? 64 : 0;
    height = Math.round(
      Math.min(480, Math.max(196, 94 + lines.length * 22 + htmlExtra + latexExtra + stepsExtra))
    );
  } else if (htmlContent) {
    const hasTable = /<table[\s>]/i.test(htmlContent);
    const tableRows = (htmlContent.match(/<tr[\s>]/gi) || []).length;
    const listItems = (htmlContent.match(/<li[\s>]/gi) || []).length;
    const plainTextLen = htmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
    width = hasTable || input.isWide ? 560 : 440;
    const latexExtra = rawLatex ? 78 : 0;
    height = Math.round(
      Math.min(
        460,
        Math.max(
          184,
          104 + tableRows * 32 + listItems * 26 + Math.round(plainTextLen / 2.8) + latexExtra + stepsExtra
        )
      )
    );
  } else if (rawLatex) {
    const envLines = (rawLatex.match(/\\\\/g) || []).length;
    const hasBlockEnv = /\\begin\{(cases|aligned|align|matrix|pmatrix|bmatrix|vmatrix|array)\}/.test(rawLatex);
    if (envLines === 0 && !hasBlockEnv && rawLatex.length <= 95) {
      width = Math.round(Math.min(460, Math.max(360, 260 + rawLatex.length * 2.1)));
      height = 172 + stepsExtra;
    } else {
      width = input.isWide || rawLatex.length > 140 ? 540 : 460;
      height = Math.round(Math.min(360, Math.max(204, 152 + envLines * 36 + stepsExtra)));
    }
  }

  return {
    width: Math.min(PINNED_MAX_WIDTH, Math.max(PINNED_MIN_WIDTH, width)),
    height: Math.min(PINNED_MAX_HEIGHT, Math.max(PINNED_MIN_HEIGHT, height)),
  };
}

export function createInitialPinnedLayout(
  index: number,
  viewportWidth = 1440,
  viewportHeight = 900,
  zIndex = 10006,
  preferWideOrSize: boolean | { width: number; height: number } = false
): PinnedCardLayout {
  const safeIdx = Math.max(0, index);
  const targetWidth =
    typeof preferWideOrSize === 'object'
      ? preferWideOrSize.width
      : preferWideOrSize
      ? PINNED_WIDE_DEFAULT_WIDTH
      : PINNED_DEFAULT_WIDTH;
  const targetHeight =
    typeof preferWideOrSize === 'object'
      ? preferWideOrSize.height
      : preferWideOrSize
      ? PINNED_WIDE_DEFAULT_HEIGHT
      : PINNED_DEFAULT_HEIGHT;
  const width = Math.min(targetWidth, Math.max(PINNED_MIN_WIDTH, viewportWidth - 32));
  const height = Math.min(targetHeight, Math.max(PINNED_MIN_HEIGHT, viewportHeight - 100));
  const rawX = 20 + safeIdx * 26;
  const rawY = viewportHeight - height - 24 - safeIdx * 26;
  const pos = clampPinnedCardPosition(rawX, rawY, width, height, viewportWidth, viewportHeight);
  return {
    x: pos.x,
    y: pos.y,
    width,
    height,
    zIndex,
  };
}

export function computeCornerResizedLayout(
  start: PinnedCardLayout,
  direction: ResizeDirection,
  deltaX: number,
  deltaY: number,
  viewportWidth = 1440,
  viewportHeight = 900
): PinnedCardLayout {
  const safeVw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1440;
  const safeVh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 900;
  const maxWidth = Math.max(PINNED_MIN_WIDTH, Math.min(PINNED_MAX_WIDTH, safeVw - 16));
  const maxHeight = Math.max(PINNED_MIN_HEIGHT, Math.min(PINNED_MAX_HEIGHT, safeVh - 16));

  const rightEdge = start.x + start.width;
  const bottomEdge = start.y + start.height;

  let nextWidth = start.width;
  let nextHeight = start.height;
  let nextX = start.x;
  let nextY = start.y;

  const resizesEast = direction === 'e' || direction === 'ne' || direction === 'se';
  const resizesWest = direction === 'w' || direction === 'nw' || direction === 'sw';
  const resizesSouth = direction === 's' || direction === 'sw' || direction === 'se';
  const resizesNorth = direction === 'n' || direction === 'nw' || direction === 'ne';

  if (resizesEast) {
    const eastMaxW = Math.max(PINNED_MIN_WIDTH, Math.min(maxWidth, safeVw - 8 - start.x));
    nextWidth = Math.min(eastMaxW, Math.max(PINNED_MIN_WIDTH, Math.round(start.width + deltaX)));
  } else if (resizesWest) {
    const westMaxW = Math.max(PINNED_MIN_WIDTH, Math.min(maxWidth, rightEdge - 8));
    nextWidth = Math.min(westMaxW, Math.max(PINNED_MIN_WIDTH, Math.round(start.width - deltaX)));
    nextX = rightEdge - nextWidth;
  }

  if (resizesSouth) {
    const southMaxH = Math.max(PINNED_MIN_HEIGHT, Math.min(maxHeight, safeVh - 8 - start.y));
    nextHeight = Math.min(southMaxH, Math.max(PINNED_MIN_HEIGHT, Math.round(start.height + deltaY)));
  } else if (resizesNorth) {
    const northMaxH = Math.max(PINNED_MIN_HEIGHT, Math.min(maxHeight, bottomEdge - 8));
    nextHeight = Math.min(northMaxH, Math.max(PINNED_MIN_HEIGHT, Math.round(start.height - deltaY)));
    nextY = bottomEdge - nextHeight;
  }

  const clampedPos = clampPinnedCardPosition(nextX, nextY, nextWidth, nextHeight, safeVw, safeVh);
  return {
    x: clampedPos.x,
    y: clampedPos.y,
    width: nextWidth,
    height: nextHeight,
    zIndex: start.zIndex,
  };
}

export const computePinnedResizedLayout = computeCornerResizedLayout;

export function getPinnedCardSizeMode(
  width: number,
  height: number,
  isMinimized = false
): PinnedCardSizeMode {
  if (
    isMinimized ||
    height <= PINNED_FORMULA_ONLY_MAX_HEIGHT ||
    width <= PINNED_FORMULA_ONLY_MAX_WIDTH
  ) {
    return 'formula-only';
  }
  if (height < 230) {
    return 'compact';
  }
  return 'full';
}

export function clampPinnedLayoutsToViewport(
  layouts: Record<string, PinnedCardLayout>,
  viewportWidth: number,
  viewportHeight: number
): Record<string, PinnedCardLayout> {
  const entries = Object.entries(layouts);
  if (entries.length === 0) return layouts;

  const safeVw = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1440;
  const safeVh = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 900;
  const maxAllowedWidth = Math.max(PINNED_MIN_WIDTH, Math.min(PINNED_MAX_WIDTH, safeVw - 16));
  const maxAllowedHeight = Math.max(PINNED_MIN_HEIGHT, Math.min(PINNED_MAX_HEIGHT, safeVh - 16));

  let changed = false;
  const next: Record<string, PinnedCardLayout> = {};

  for (const [cardId, layout] of entries) {
    const nextWidth = Math.min(maxAllowedWidth, Math.max(PINNED_MIN_WIDTH, layout.width));
    const nextHeight = Math.min(maxAllowedHeight, Math.max(PINNED_MIN_HEIGHT, layout.height));
    const clampedPos = clampPinnedCardPosition(
      layout.x,
      layout.y,
      nextWidth,
      nextHeight,
      safeVw,
      safeVh
    );

    if (
      clampedPos.x !== layout.x ||
      clampedPos.y !== layout.y ||
      nextWidth !== layout.width ||
      nextHeight !== layout.height
    ) {
      changed = true;
      next[cardId] = {
        ...layout,
        x: clampedPos.x,
        y: clampedPos.y,
        width: nextWidth,
        height: nextHeight,
      };
    } else {
      next[cardId] = layout;
    }
  }

  return changed ? next : layouts;
}
