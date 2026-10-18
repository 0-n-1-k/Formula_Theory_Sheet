import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APP_STATE,
  sanitizePersistedState,
  safeReadStorage,
  safeWriteStorage,
  validateJsonImportPayload,
} from './storageSafety.ts';

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
