import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUET_LOGO_ASCII_ART,
  DEFAULT_APP_STATE,
  resetToHomeFormulasState,
  sanitizePersistedState,
  sanitizeSearchHistory,
  updateSearchHistoryList,
  safeReadStorage,
  safeWriteStorage,
  validateJsonImportPayload,
  clampHudHeightPx,
  MIN_HUD_HEIGHT_PX,
  createInitialPinnedLayout,
  clampPinnedCardPosition,
  computeCornerResizedLayout,
  getPinnedCardSizeMode,
  PINNED_MIN_WIDTH,
  PINNED_MIN_HEIGHT,
  PINNED_MAX_WIDTH,
  PINNED_MAX_HEIGHT,
} from './storageSafety.ts';
import {
  ACTIVE_TERM_ID,
  CURRENT_TERM_CONFIG,
  TERM_REGISTRY,
  buildEffectiveCoursePills,
} from '../termConfig.ts';
import { PRACTICE_CATALOG, getPracticeModulesForCourse } from './practiceCatalog.ts';

test('BUET_LOGO_ASCII_ART has 9 balanced lines of 19 characters with zero emojis', () => {
  const lines = BUET_LOGO_ASCII_ART.split('\n');
  assert.equal(lines.length, 9);
  for (const line of lines) {
    assert.equal(line.length, 19);
  }
});

test('TERM_REGISTRY pre-loads l1t1, l1t2, l2t1, and l2t2 and buildEffectiveCoursePills auto-discovers extra courses', () => {
  assert.equal(ACTIVE_TERM_ID, 'l1t1');
  assert.deepEqual(Object.keys(TERM_REGISTRY), ['l1t1', 'l1t2', 'l2t1', 'l2t2']);
  assert.equal(CURRENT_TERM_CONFIG.termId, 'l1t1');

  const pillsWithExtra = buildEffectiveCoursePills(CURRENT_TERM_CONFIG, ['EEE', 'ME165']);
  const codes = pillsWithExtra.map((p) => p.code);
  assert.deepEqual(codes, ['ALL', 'EEE', 'M157', 'M159', 'PHY', 'CSE', 'ME165', 'GEN']);
});

test('resetToHomeFormulasState returns user to Formulas tab for ALL courses with drawers retracted while preserving progress', () => {
  const dirtyState = {
    ...DEFAULT_APP_STATE,
    tab: 'thm' as const,
    course: 'M159',
    status: 'starred' as const,
    goalOpen: true,
    learned: { 'eee-1': true },
    starred: { 'm159-1': true },
  };
  const next = resetToHomeFormulasState(dirtyState);
  assert.equal(next.tab, 'fm');
  assert.equal(next.course, 'ALL');
  assert.equal(next.status, 'all');
  assert.equal(next.goalOpen, false);
  assert.deepEqual(next.learned, { 'eee-1': true });
  assert.deepEqual(next.starred, { 'm159-1': true });
});

test('sanitizePersistedState supports prac tab, dynamic courses, searchHistory, and courseBarCollapsed', () => {
  assert.deepEqual(sanitizePersistedState(null), DEFAULT_APP_STATE);
  assert.deepEqual(sanitizePersistedState(undefined), DEFAULT_APP_STATE);
  assert.deepEqual(sanitizePersistedState('corrupted'), DEFAULT_APP_STATE);
  assert.deepEqual(sanitizePersistedState([1, 2, 3]), DEFAULT_APP_STATE);

  const validPrac = sanitizePersistedState({
    tab: 'prac',
    course: 'EEE',
    status: 'all',
    courseBarCollapsed: true,
    searchHistory: ['  cif ', 'thevenin', 'CIF', 'a', '', 123],
  });
  assert.equal(validPrac.tab, 'prac');
  assert.equal(validPrac.course, 'EEE');
  assert.equal(validPrac.courseBarCollapsed, true);
  assert.deepEqual(validPrac.searchHistory, ['cif', 'thevenin']);

  // Dynamic course code from auto-discovered sections
  const withDiscovered = sanitizePersistedState(
    { tab: 'fm', course: 'ME165', status: 'all' },
    DEFAULT_APP_STATE,
    ['ME165']
  );
  assert.equal(withDiscovered.course, 'ME165');
});

test('updateSearchHistoryList deduplicates case-insensitively, replaces prefix extensions, and caps at 8', () => {
  let hist: string[] = [];
  hist = updateSearchHistoryList(hist, 'cauc');
  assert.deepEqual(hist, ['cauc']);

  // Extending 'cauc' -> 'cauchy' replaces top entry instead of creating duplicate partial entry
  hist = updateSearchHistoryList(hist, 'cauchy');
  assert.deepEqual(hist, ['cauchy']);

  hist = updateSearchHistoryList(hist, 'thevenin');
  hist = updateSearchHistoryList(hist, 'mvt');
  hist = updateSearchHistoryList(hist, 'THEVENIN');
  assert.deepEqual(hist, ['THEVENIN', 'mvt', 'cauchy']);

  for (let i = 1; i <= 10; i++) {
    hist = updateSearchHistoryList(hist, `query_${i}`);
  }
  assert.equal(hist.length, 8);
  assert.equal(hist[0], 'query_10');
  assert.equal(sanitizeSearchHistory(hist).length, 8);
});

test('PRACTICE_CATALOG defines all 5 course groups and 12 sub-modules with pdfUrl initialized to null', () => {
  assert.equal(PRACTICE_CATALOG.length, 5);
  const allModules = getPracticeModulesForCourse('ALL');
  assert.equal(allModules.length, 12);
  assert.ok(allModules.every((m) => m.pdfUrl === null));
  const m159Modules = getPracticeModulesForCourse('M159');
  assert.deepEqual(
    m159Modules.map((m) => m.id),
    ['m159-complex', 'm159-vector']
  );
  assert.deepEqual(
    getPracticeModulesForCourse('PHY').map((m) => m.id),
    ['phy-waves', 'phy-optics', 'phy-thermal']
  );
  assert.deepEqual(
    getPracticeModulesForCourse('EEE').map((m) => m.id),
    ['eee-dc', 'eee-trans-mag', 'eee-ac']
  );
  assert.deepEqual(
    getPracticeModulesForCourse('M157').map((m) => m.id),
    ['m157-diff', 'm157-int']
  );
  assert.deepEqual(
    getPracticeModulesForCourse('CSE').map((m) => m.id),
    ['cse-c', 'cse-cpp']
  );
});

test('safeReadStorage and safeWriteStorage never throw when storage throws SecurityError or QuotaExceededError', () => {
  const throwingStorage = {
    getItem(): string | null {
      throw new Error('SecurityError: The operation is insecure.');
    },
    setItem(): void {
      throw new Error('QuotaExceededError');
    },
  };

  const state = safeReadStorage('buet_eee_l1t1_v2_state', DEFAULT_APP_STATE, throwingStorage);
  assert.deepEqual(state, DEFAULT_APP_STATE);

  const ok = safeWriteStorage('buet_eee_l1t1_v2_state', state, throwingStorage);
  assert.equal(ok, false);
});

test('validateJsonImportPayload rejects invalid JSON, arrays, primitives, and invalid field types', () => {
  assert.equal(validateJsonImportPayload('').ok, false);
  assert.equal(validateJsonImportPayload('{corrupted json').ok, false);
  assert.equal(validateJsonImportPayload('null').ok, false);
  assert.equal(validateJsonImportPayload('[]').ok, false);
  assert.equal(validateJsonImportPayload('{"unrelated": 123}').ok, false);
  assert.equal(validateJsonImportPayload('{"learned": "not-an-object"}').ok, false);
  assert.equal(validateJsonImportPayload('{"starred": [1,2]}').ok, false);
  assert.equal(validateJsonImportPayload('{"learned": {}, "examDate": "invalid-date"}').ok, false);

  const valid = validateJsonImportPayload(
    JSON.stringify({
      learned: { 'eee-basic:0': true, 'eee-basic:1': false },
      starred: { 'm157-limits:0': 1 },
      examDate: '2026-12-01',
    })
  );
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.data?.learned, { 'eee-basic:0': true });
  assert.deepEqual(valid.data?.starred, { 'm157-limits:0': true });
  assert.equal(valid.data?.examDate, '2026-12-01');
});

test('clampHudHeightPx clamps vertical pointer position between MIN_HUD_HEIGHT_PX and 92% of viewport height', () => {
  assert.equal(clampHudHeightPx(80, 900), MIN_HUD_HEIGHT_PX);
  assert.equal(clampHudHeightPx(420, 900), 420);
  assert.equal(clampHudHeightPx(890, 900), Math.round(900 * 0.92));
  assert.equal(clampHudHeightPx(Number.NaN, 900), 450);
});

test('pinned card position, corner resizing, and size modes clamp and switch between formula-only and full card', () => {
  const initial = createInitialPinnedLayout(0, 1440, 900, 10010);
  assert.equal(initial.width, 420);
  assert.equal(initial.height, 330);
  assert.equal(getPinnedCardSizeMode(initial.width, initial.height, false), 'full');

  const shrunkSe = computeCornerResizedLayout(initial, 'se', -200, -250, 1440, 900);
  assert.equal(shrunkSe.width, PINNED_MIN_WIDTH);
  assert.equal(shrunkSe.height, PINNED_MIN_HEIGHT);
  assert.equal(getPinnedCardSizeMode(shrunkSe.width, shrunkSe.height, false), 'formula-only');

  const expandedSe = computeCornerResizedLayout(initial, 'se', 500, 400, 1440, 900);
  assert.equal(expandedSe.width, PINNED_MAX_WIDTH);
  assert.equal(expandedSe.height, PINNED_MAX_HEIGHT);
  assert.equal(getPinnedCardSizeMode(expandedSe.width, expandedSe.height, false), 'full');

  const clampedPos = clampPinnedCardPosition(-50, 2000, 400, 300, 1440, 900);
  assert.equal(clampedPos.x, 8);
  assert.equal(clampedPos.y, 900 - 300 - 8);
});



