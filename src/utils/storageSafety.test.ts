import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUET_LOGO_ASCII_ART,
  DEFAULT_APP_STATE,
  resetToHomeFormulasState,
  sanitizePersistedState,
  safeReadStorage,
  safeWriteStorage,
  validateJsonImportPayload,
} from './storageSafety.ts';

test('BUET_LOGO_ASCII_ART has 9 balanced lines of 19 characters with zero emojis', () => {
  const lines = BUET_LOGO_ASCII_ART.split('\n');
  assert.equal(lines.length, 9);
  for (const line of lines) {
    assert.equal(line.length, 19);
  }
});

test('resetToHomeFormulasState returns user to Formulas tab for ALL courses with drawers retracted while preserving progress', () => {
  const dirtyState = {
    ...DEFAULT_APP_STATE,
    tab: 'thm' as const,
    course: 'M159' as const,
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

test('sanitizePersistedState falls back safely when raw data is null, primitive, array, or corrupted', () => {
  assert.deepEqual(sanitizePersistedState(null), DEFAULT_APP_STATE);
  assert.deepEqual(sanitizePersistedState(undefined), DEFAULT_APP_STATE);
  assert.deepEqual(sanitizePersistedState('corrupted'), DEFAULT_APP_STATE);
  assert.deepEqual(sanitizePersistedState([1, 2, 3]), DEFAULT_APP_STATE);

  const partial = sanitizePersistedState({
    tab: 'invalid_tab',
    course: 'INVALID_COURSE',
    status: 'invalid_status',
    learned: null,
    starred: ['bad'],
    examDate: 'not-a-date',
    selfTest: 'yes',
  });
  assert.equal(partial.tab, 'fm');
  assert.equal(partial.course, 'ALL');
  assert.equal(partial.status, 'all');
  assert.deepEqual(partial.learned, {});
  assert.deepEqual(partial.starred, {});
  assert.equal(partial.examDate, DEFAULT_APP_STATE.examDate);
  assert.equal(partial.selfTest, false);
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
