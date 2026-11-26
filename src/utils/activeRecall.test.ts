import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCardDeepLinkUrl,
  buildReportTypoUrl,
  createFlashcardQueue,
  getConstrainedConnectionReason,
  gradeFlashcardQueue,
  parseCardDeepLink,
  resolveCardDeepLink,
  shouldAutoWarmupSemanticModel,
} from './activeRecall';

test('flashcard queue re-queues Needs Review cards sooner and removes Got It cards', () => {
  const deck = createFlashcardQueue(['c1', 'c2', 'c3', 'c4', 'c5'], {
    rng: () => 0.99999, // Identity shuffle
  });
  assert.deepEqual(deck.queue, ['c1', 'c2', 'c3', 'c4', 'c5']);

  // Grade c1 as Needs Review -> c1 moves 2 slots ahead (index 2 after c2, c3)
  const r1 = gradeFlashcardQueue(deck, 'review', 2);
  assert.equal(r1.gradedCardId, 'c1');
  assert.equal(r1.nextCardId, 'c2');
  assert.deepEqual(r1.nextState.queue, ['c2', 'c3', 'c1', 'c4', 'c5']);
  assert.equal(r1.nextState.reviewedCount, 1);
  assert.equal(r1.nextState.gotItCount, 0);
  assert.equal(r1.nextState.requeuedIds.c1, 1);

  // Grade c2 as Got It -> removed from active queue
  const r2 = gradeFlashcardQueue(r1.nextState, 'got-it', 2);
  assert.equal(r2.gradedCardId, 'c2');
  assert.equal(r2.nextCardId, 'c3');
  assert.deepEqual(r2.nextState.queue, ['c3', 'c1', 'c4', 'c5']);
  assert.equal(r2.nextState.reviewedCount, 2);
  assert.equal(r2.nextState.gotItCount, 1);
});

test('card deep-link parsing, resolution, and URL construction', () => {
  assert.equal(parseCardDeepLink('?card=eee-thev:2'), 'eee-thev:2');
  assert.equal(parseCardDeepLink('?foo=bar'), null);

  const refs = [
    { id: 'eee-thev:2', topicId: 'fm-eee-thev', course: 'EEE', sourceTab: 'fm' as const },
    { id: 't-eee1:0', topicId: 't-eee1', course: 'EEE', sourceTab: 'thm' as const },
  ];

  const exact = resolveCardDeepLink('?card=eee-thev:2', refs);
  assert.deepEqual(exact, {
    found: true,
    id: 'eee-thev:2',
    topicId: 'fm-eee-thev',
    course: 'EEE',
    sourceTab: 'fm',
  });

  const ci = resolveCardDeepLink('?card=T-EEE1:0', refs);
  assert.deepEqual(ci, {
    found: true,
    id: 't-eee1:0',
    topicId: 't-eee1',
    course: 'EEE',
    sourceTab: 'thm',
  });

  const missing = resolveCardDeepLink('?card=does-not-exist', refs);
  assert.deepEqual(missing, { found: false, rawId: 'does-not-exist' });

  assert.equal(
    buildCardDeepLinkUrl('eee-thev:2', 'https://formula-theory-sheet.vercel.app', '/'),
    'https://formula-theory-sheet.vercel.app/?card=eee-thev%3A2'
  );
});

test('buildReportTypoUrl targets 0-n-1-k/Formula_Theory_Sheet with card metadata', () => {
  const url = buildReportTypoUrl({
    cardId: 'eee-maxp:0',
    course: 'EEE',
    topicTitle: 'Maximum power transfer',
    cardTitle: 'DC Condition',
  });
  assert.ok(url.startsWith('https://github.com/0-n-1-k/Formula_Theory_Sheet/issues/new?'));
  const parsed = new URL(url);
  assert.match(parsed.searchParams.get('title') || '', /eee-maxp:0/);
  assert.match(parsed.searchParams.get('title') || '', /\[EEE\]/);
  assert.match(parsed.searchParams.get('body') || '', /`eee-maxp:0`/);
  assert.match(parsed.searchParams.get('body') || '', /Maximum power transfer/);
});

test('shouldAutoWarmupSemanticModel blocks saveData and slow cellular connections', () => {
  assert.equal(shouldAutoWarmupSemanticModel(null), true);
  assert.equal(shouldAutoWarmupSemanticModel({ saveData: false, effectiveType: '4g' }), true);
  assert.equal(shouldAutoWarmupSemanticModel({ saveData: true, effectiveType: '4g' }), false);
  assert.equal(shouldAutoWarmupSemanticModel({ saveData: false, effectiveType: '3g' }), false);
  assert.equal(shouldAutoWarmupSemanticModel({ saveData: false, effectiveType: '2g' }), false);
  assert.equal(shouldAutoWarmupSemanticModel({ saveData: false, effectiveType: 'slow-2g' }), false);

  assert.match(
    getConstrainedConnectionReason({ saveData: true, effectiveType: '4g' }) || '',
    /DATA SAVER/
  );
  assert.match(
    getConstrainedConnectionReason({ saveData: false, effectiveType: '3g' }) || '',
    /3G CONNECTION/
  );
  assert.equal(getConstrainedConnectionReason({ saveData: false, effectiveType: '4g' }), null);
});
