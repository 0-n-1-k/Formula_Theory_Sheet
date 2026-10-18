import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLatexForSearch,
  buildFormulaSearchIndex,
  tokenizeSearchQuery,
  matchesSearchTokens,
  filterFormulaCards,
  type FormulaCardRecord,
} from './formulaSearch.ts';

const SAMPLE_CARDS: FormulaCardRecord[] = [
  {
    id: 'eee-thev-1',
    course: 'EEE',
    topicId: 'fm-eee-thev',
    topicTitle: 'Network theorems: Thevenin, Norton, superposition',
    title: 'Thevenin Equivalent Voltage & Resistance',
    keywords: 'thevenin voc rth open circuit equivalent',
    rawLatex: 'V_{\\text{th}} = V_{\\text{oc}}, \\quad R_{\\text{th}} = \\frac{V_{\\text{oc}}}{I_{\\text{sc}}}',
    bodyText: 'Where V_oc is open-circuit terminal voltage and I_sc is short-circuit current.',
    isLearned: true,
    isStarred: true,
  },
  {
    id: 'eee-ac-1',
    course: 'EEE',
    topicId: 'fm-eee-ac',
    topicTitle: 'AC phasors, impedance, complex power, PF correction',
    title: 'Complex Power & Power Factor',
    keywords: 'complex power apparent active reactive pf cos theta',
    rawLatex: 'S = P + jQ = V_{\\text{rms}} I_{\\text{rms}}^*',
    bodyText: 'Used for AC power triangle and capacitor bank power factor correction.',
    isLearned: false,
    isStarred: false,
  },
  {
    id: 'm157-limits-1',
    course: 'M157',
    topicId: 'fm-m157-limits',
    topicTitle: "Limits, continuity, differentiability, L'Hôpital",
    title: "L'Hôpital's Rule for Indeterminate Forms",
    keywords: 'lhopital limit 0/0 inf/inf derivative',
    rawLatex: '\\lim_{x \\to a} \\frac{f(x)}{g(x)} = \\lim_{x \\to a} \\frac{f\'(x)}{g\'(x)}',
    bodyText: 'Applies when f(a)/g(a) yields 0/0 or infinity/infinity.',
    isLearned: false,
    isStarred: true,
  },
];

test('tokenizeSearchQuery splits and normalizes multi-word queries', () => {
  assert.deepEqual(tokenizeSearchQuery('  Thevenin   R_th  '), ['thevenin', 'r_th']);
  assert.deepEqual(tokenizeSearchQuery(''), []);
  assert.deepEqual(tokenizeSearchQuery('   '), []);
});

test('normalizeLatexForSearch exposes both LaTeX and plain compact subscript forms', () => {
  const norm = normalizeLatexForSearch('V_{\\text{th}} = \\omega L');
  assert.ok(norm.includes('v_th'));
  assert.ok(norm.includes('vth'));
  assert.ok(norm.includes('omega'));
});

test('matchesSearchTokens supports multi-word AND matching and leading backslash stripping', () => {
  const index = buildFormulaSearchIndex(SAMPLE_CARDS[0]);
  assert.equal(matchesSearchTokens(index, ['thevenin', 'vth']), true);
  assert.equal(matchesSearchTokens(index, ['\\frac', 'voc']), true);
  assert.equal(matchesSearchTokens(index, ['thevenin', 'capacitor']), false);
});

test('filterFormulaCards dynamically filters by real-time query, course scope, and status', () => {
  // 1. Real-time query across ALL courses
  const res1 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'all',
    query: 'thevenin vth',
  });
  assert.equal(res1.visibleCards, 1);
  assert.equal(res1.visibleTopics, 1);
  assert.equal(res1.topics[0].hidden, false);
  assert.equal(res1.topics[1].hidden, true);
  assert.equal(res1.topics[2].hidden, true);

  // 2. Course scope + real-time query
  const res2 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'EEE',
    status: 'all',
    query: 'power',
  });
  assert.equal(res2.visibleCards, 1);
  assert.equal(res2.totalCardsInScope, 2);
  assert.deepEqual(res2.topics.find((t) => t.topicId === 'fm-eee-ac')?.visibleCardIds, ['eee-ac-1']);

  // 3. Status filter combined with query
  const res3 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'starred',
    query: '',
  });
  assert.equal(res3.visibleCards, 2);

  // 4. Zero-match query hides all topics
  const res4 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'all',
    query: 'nonexistentformula999',
  });
  assert.equal(res4.visibleCards, 0);
  assert.equal(res4.visibleTopics, 0);
  assert.ok(res4.topics.every((t) => t.hidden));
});
