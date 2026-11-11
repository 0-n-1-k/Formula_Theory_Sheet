import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSearchText,
  generateTitleInitialisms,
  DOMAIN_SYNONYM_MAP,
  GENERIC_QUERY_TERMS,
  isGenericQueryTerm,
  scoreFormulaCardSearch,
  boundedDamerauLevenshtein,
  normalizeLatexForSearch,
  buildFormulaSearchIndex,
  tokenizeSearchQuery,
  matchesSearchTokens,
  filterFormulaCards,
  isDefinitionBadge,
  matchesTheoremCategoryFilter,
  SearchBTree,
  buildCorpusSearchBTree,
  getCardVocabularyBTree,
  isConversationalNoiseTerm,
  type FormulaCardRecord,
} from './formulaSearch.ts';

const SAMPLE_CARDS: FormulaCardRecord[] = [
  {
    id: 'eee-thev-1',
    course: 'EEE',
    topicId: 'fm-eee-thev',
    topicTitle: 'Network theorems: Thévenin, Norton, superposition',
    title: "Thévenin's Equivalent Voltage & Resistance",
    badge: 'Theorem',
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
    badge: 'Definition',
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
    badge: 'Rule',
    keywords: 'lhopital limit 0/0 inf/inf derivative',
    rawLatex: '\\lim_{x \\to a} \\frac{f(x)}{g(x)} = \\lim_{x \\to a} \\frac{f\'(x)}{g\'(x)}',
    bodyText: 'Applies when f(a)/g(a) yields 0/0 or infinity/infinity.',
    isLearned: false,
    isStarred: true,
  },
  {
    id: 'm159-cif-1',
    course: 'M159',
    topicId: 'fm-m159-contour',
    topicTitle: 'Complex integration, Cauchy integral formula',
    title: 'Cauchy integral formula',
    badge: 'Theorem',
    keywords: 'contour integral analytic pole',
    rawLatex: 'f(z_0) = \\frac{1}{2\\pi i}\\oint_C \\frac{f(z)}{z-z_0}\\,dz',
    bodyText: 'Evaluates contour integrals around simple closed curves.',
    isLearned: false,
    isStarred: false,
  },
  {
    id: 'm157-ftc-1',
    course: 'M157',
    topicId: 'fm-m157-defint',
    topicTitle: 'Definite integrals',
    title: 'Fundamental Theorem of Calculus',
    badge: 'Theorem',
    keywords: 'definite integral antiderivative',
    rawLatex: '\\int_a^b f(x)\\,dx = F(b) - F(a)',
    bodyText: 'Links differentiation and definite integration.',
    isLearned: false,
    isStarred: false,
  },
  {
    id: 'eee-kcvl-1',
    course: 'EEE',
    topicId: 't-eee1',
    topicTitle: 'DC circuit laws',
    title: "Kirchhoff's Current & Voltage Laws (KCL & KVL)",
    badge: 'Law',
    keywords: 'nodal mesh loop conservation',
    rawLatex: '\\sum i_k = 0, \\quad \\sum v_m = 0',
    bodyText: 'Conservation of charge and energy in lumped networks.',
    isLearned: false,
    isStarred: false,
  },
];

test('normalizeSearchText strips Unicode diacritics, curly apostrophes, dashes, and backslashes', () => {
  assert.equal(normalizeSearchText('Thévenin'), 'thevenin');
  assert.equal(normalizeSearchText("L'Hôpital"), 'lhopital');
  assert.equal(normalizeSearchText('L’Hôpital’s'), 'lhopitals');
  assert.equal(normalizeSearchText('Ampère'), 'ampere');
  assert.equal(normalizeSearchText('Möbius'), 'mobius');
  assert.equal(normalizeSearchText('Cauchy–Riemann — \\omega'), 'cauchy riemann omega');
});

test('generateTitleInitialisms produces both full and stop-word-filtered initialisms', () => {
  const cifInit = generateTitleInitialisms('Cauchy integral formula');
  assert.ok(cifInit.includes('cif'));

  const mptInit = generateTitleInitialisms('Maximum power transfer');
  assert.ok(mptInit.includes('mpt'));

  const shmInit = generateTitleInitialisms('Simple Harmonic Motion');
  assert.ok(shmInit.includes('shm'));

  const kcvlInit = generateTitleInitialisms("Kirchhoff's Current & Voltage Laws (KCL & KVL)");
  assert.ok(kcvlInit.includes('kcvl'));

  const ftcInit = generateTitleInitialisms('Fundamental Theorem of Calculus');
  assert.ok(ftcInit.includes('ftoc'));
  assert.ok(ftcInit.includes('ftc'));

  const ibpInit = generateTitleInitialisms('Integration by parts');
  assert.ok(ibpInit.includes('ibp'));
  assert.ok(ibpInit.includes('ip'));

  const lsInit = generateTitleInitialisms('Limit of a sum');
  assert.ok(lsInit.includes('loas'));
  assert.ok(lsInit.includes('ls'));
});

test('boundedDamerauLevenshtein handles transpositions, insertions, deletions, and substitutions', () => {
  assert.equal(boundedDamerauLevenshtein('formula', 'formual', 1), 1); // adjacent transposition
  assert.equal(boundedDamerauLevenshtein('thevenin', 'thevnin', 1), 1); // deletion
  assert.equal(boundedDamerauLevenshtein('kirchhoff', 'kirchoff', 1), 1); // deletion
  assert.equal(boundedDamerauLevenshtein('leibnitz', 'leibniz', 1), 1); // deletion
  assert.ok(boundedDamerauLevenshtein('thevenin', 'capacitor', 2) > 2); // early exit / exceeds bound
});

test('matchesSearchTokens matches acronyms, synonyms, diacritics, and typos', () => {
  const cifIdx = buildFormulaSearchIndex(SAMPLE_CARDS[3]);
  assert.equal(matchesSearchTokens(cifIdx, tokenizeSearchQuery('cif'), SAMPLE_CARDS[3].title), true);
  assert.equal(matchesSearchTokens(cifIdx, tokenizeSearchQuery('cauchy formual'), SAMPLE_CARDS[3].title), true);

  const ftcIdx = buildFormulaSearchIndex(SAMPLE_CARDS[4]);
  assert.equal(matchesSearchTokens(ftcIdx, tokenizeSearchQuery('ftc'), SAMPLE_CARDS[4].title), true);

  const thevIdx = buildFormulaSearchIndex(SAMPLE_CARDS[0]);
  assert.equal(matchesSearchTokens(thevIdx, tokenizeSearchQuery('thevnin'), SAMPLE_CARDS[0].title), true);
  assert.equal(matchesSearchTokens(thevIdx, tokenizeSearchQuery('thv'), SAMPLE_CARDS[0].title), true);
  assert.equal(matchesSearchTokens(thevIdx, tokenizeSearchQuery('Thévenin'), SAMPLE_CARDS[0].title), true);

  const kcvlIdx = buildFormulaSearchIndex(SAMPLE_CARDS[5]);
  assert.equal(matchesSearchTokens(kcvlIdx, tokenizeSearchQuery('kcvl'), SAMPLE_CARDS[5].title), true);
  assert.equal(matchesSearchTokens(kcvlIdx, tokenizeSearchQuery('kirchoff'), SAMPLE_CARDS[5].title), true);
  assert.equal(matchesSearchTokens(kcvlIdx, tokenizeSearchQuery('kcl'), SAMPLE_CARDS[5].title), true);

  const lhrIdx = buildFormulaSearchIndex(SAMPLE_CARDS[2]);
  assert.equal(matchesSearchTokens(lhrIdx, tokenizeSearchQuery('lhr'), SAMPLE_CARDS[2].title), true);
  assert.equal(matchesSearchTokens(lhrIdx, tokenizeSearchQuery('lhospital'), SAMPLE_CARDS[2].title), true);
  assert.equal(matchesSearchTokens(lhrIdx, tokenizeSearchQuery("L'Hôpital"), SAMPLE_CARDS[2].title), true);

  assert.ok(Object.keys(DOMAIN_SYNONYM_MAP).length >= 24);
});

test('GENERIC_QUERY_TERMS and scoreFormulaCardSearch prioritize specific anchor terms in titles at #1', () => {
  assert.equal(GENERIC_QUERY_TERMS.has('theorem'), true);
  assert.equal(GENERIC_QUERY_TERMS.has('formula'), true);
  assert.equal(GENERIC_QUERY_TERMS.has('divergence'), false);
  assert.equal(isGenericQueryTerm('theorem'), true);
  assert.equal(isGenericQueryTerm('divergence'), false);

  const cards: FormulaCardRecord[] = [
    {
      id: 't-m1592-green',
      course: 'M159',
      topicId: 't-m1592',
      topicTitle: 'Complex integration, series & residues',
      title: "Complex Del Operator, Complex Grad/Div/Curl & General Complex Green's Theorem",
      badge: 'Theorem',
      keywords: 'complex del grad div curl greens theorem',
      rawLatex: '',
      bodyText: 'Relates complex divergence and curl in the plane.',
    },
    {
      id: 't-m1593-summary',
      course: 'M159',
      topicId: 't-m1593',
      topicTitle: 'Vector algebra, vector calculus & integral theorems',
      title: "Green's, Stokes' & Gauss' Integral Theorems (Unified Summary)",
      badge: 'Theorem',
      keywords: 'greens stokes gauss integral theorems',
      rawLatex: '',
      bodyText: 'Includes Gauss divergence theorem in 3D.',
    },
    {
      id: 't-m1593-div',
      course: 'M159',
      topicId: 't-m1593',
      topicTitle: 'Vector algebra, vector calculus & integral theorems',
      title: "Gauss's Divergence Theorem: Full Component Proof & Poisson's Equation Flux Corollary",
      badge: 'Theorem',
      keywords: 'gauss divergence theorem flux volume integral',
      rawLatex: '',
      bodyText: 'Converts volume integral of divergence to closed surface flux integral.',
    },
  ];

  const tokens = tokenizeSearchQuery('divergence theorem');
  const scoreGreen = scoreFormulaCardSearch(cards[0], tokens, 'divergence theorem');
  const scoreSummary = scoreFormulaCardSearch(cards[1], tokens, 'divergence theorem');
  const scoreDiv = scoreFormulaCardSearch(cards[2], tokens, 'divergence theorem');

  assert.ok(scoreDiv > scoreGreen * 10);
  assert.ok(scoreDiv > scoreSummary * 10);

  const filtered = filterFormulaCards(cards, {
    course: 'ALL',
    status: 'all',
    query: 'divergence theorem',
  });
  assert.equal(filtered.rankedCardIds?.[0], 't-m1593-div');
  const secM1593 = filtered.topics.find((t) => t.topicId === 't-m1593');
  assert.equal(secM1593?.visibleCardIds[0], 't-m1593-div');
});

test('tokenizeSearchQuery splits and normalizes multi-word queries', () => {
  assert.deepEqual(tokenizeSearchQuery('  Thévenin   R_th  '), ['thevenin', 'r_th']);
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
  const res1 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'all',
    query: 'thevenin vth',
  });
  assert.equal(res1.visibleCards, 1);
  assert.equal(res1.visibleTopics, 1);

  const res2 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'EEE',
    status: 'all',
    query: 'power',
  });
  assert.equal(res2.visibleCards, 1);
  assert.equal(res2.totalCardsInScope, 3);
  assert.deepEqual(res2.topics.find((t) => t.topicId === 'fm-eee-ac')?.visibleCardIds, ['eee-ac-1']);

  const res3 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'starred',
    query: '',
  });
  assert.equal(res3.visibleCards, 2);

  const res4 = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'all',
    query: 'nonexistentformula999',
  });
  assert.equal(res4.visibleCards, 0);
  assert.equal(res4.visibleTopics, 0);
  assert.ok(res4.topics.every((t) => t.hidden));
});

test('matchesTheoremCategoryFilter separates Definitions from Theorems, Laws, Principles, and Rules', () => {
  assert.equal(isDefinitionBadge('Definition'), true);
  assert.equal(isDefinitionBadge('Theorem'), false);
  assert.equal(isDefinitionBadge('Law'), false);
  assert.equal(isDefinitionBadge('Principle'), false);

  assert.equal(matchesTheoremCategoryFilter('Definition', 'definitions'), true);
  assert.equal(matchesTheoremCategoryFilter('Theorem', 'definitions'), false);
  assert.equal(matchesTheoremCategoryFilter('Law', 'definitions'), false);

  assert.equal(matchesTheoremCategoryFilter('Definition', 'theorems'), false);
  assert.equal(matchesTheoremCategoryFilter('Theorem', 'theorems'), true);
  assert.equal(matchesTheoremCategoryFilter('Law', 'theorems'), true);
  assert.equal(matchesTheoremCategoryFilter('Principle', 'theorems'), true);
  assert.equal(matchesTheoremCategoryFilter('Rule', 'theorems'), true);

  const defOnly = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'all',
    query: '',
    thmFilter: 'definitions',
  });
  assert.equal(defOnly.visibleCards, 1);
  assert.deepEqual(defOnly.topics[1].visibleCardIds, ['eee-ac-1']);

  const thmAndLawsOnly = filterFormulaCards(SAMPLE_CARDS, {
    course: 'ALL',
    status: 'all',
    query: '',
    thmFilter: 'theorems',
  });
  assert.equal(thmAndLawsOnly.visibleCards, 5);
});

test('SearchBTree maintains sorted multi-way nodes, splits full nodes, and supports O(log N) exact, prefix, and range queries', () => {
  const btree = new SearchBTree<string>(3); // max 5 keys per node to exercise splits thoroughly
  const words = [
    'thevenin',
    'norton',
    'superposition',
    'kirchhoff',
    'impedance',
    'admittance',
    'reactance',
    'susceptance',
    'capacitance',
    'inductance',
    'transient',
    'transform',
    'transfer',
    'transistor',
    'divergent',
    'divergence',
    'derivative',
    'differential',
    'determinant',
    'eigenvalue',
    'eigenvector',
    'eigenspace',
    'laplace',
    'laurent',
    'lagrange',
    'lhopital',
    'logarithm',
    'logic',
    'pointer',
    'polymorphism',
  ];

  for (const w of words) {
    btree.insert(w, `card-${w}`);
  }

  assert.equal(btree.size, words.length);
  assert.equal(btree.root.leaf, false, 'B-Tree should have split into multiple levels');

  // Exact lookups
  for (const w of words) {
    assert.equal(btree.hasExact(w), true, `Expected exact match for ${w}`);
    assert.deepEqual(btree.searchExact(w), [`card-${w}`]);
  }
  assert.equal(btree.hasExact('nonexistent'), false);

  // Prefix lookups via B-Tree range traversal
  const transMatches = btree.searchPrefix('trans').map((e) => e.key);
  assert.deepEqual(transMatches, ['transfer', 'transform', 'transient', 'transistor']);
  assert.equal(btree.hasPrefix('eigen'), true);
  assert.equal(btree.hasPrefix('zz'), false);

  // Lexicographical range scan [lower, upper]
  const dToE = btree.searchRange('derivative', 'eigenvector').map((e) => e.key);
  assert.deepEqual(dToE, [
    'derivative',
    'determinant',
    'differential',
    'divergence',
    'divergent',
    'eigenspace',
    'eigenvalue',
    'eigenvector',
  ]);
});

test('B-Tree search mechanism matches vague, conversational, prefix, and subsequence queries', () => {
  const thevIndex = buildFormulaSearchIndex(SAMPLE_CARDS[0]);
  const cardBTree = getCardVocabularyBTree(thevIndex);
  assert.equal(cardBTree.hasPrefix('thev'), true);
  assert.equal(cardBTree.hasPrefix('equiv'), true);

  // Conversational / natural-language query with filler words
  const vagueThev = tokenizeSearchQuery('how to find thevenin equivalent voltage');
  assert.equal(isConversationalNoiseTerm('how'), true);
  assert.equal(isConversationalNoiseTerm('find'), true);
  assert.equal(matchesSearchTokens(thevIndex, vagueThev, SAMPLE_CARDS[0].title), true);

  // Partial prefix query ("thev equiv volt")
  const prefixTokens = tokenizeSearchQuery('thev equiv volt');
  assert.equal(matchesSearchTokens(thevIndex, prefixTokens, SAMPLE_CARDS[0].title), true);

  // Consonant skeleton / abbreviated subsequence query ("thvnn")
  assert.equal(matchesSearchTokens(thevIndex, ['thvnn'], SAMPLE_CARDS[0].title), true);

  // Vague multi-word query where 1 word is an extra descriptive word not on the card ("find thevenin circuit voltage")
  const softQuorumTokens = tokenizeSearchQuery('find thevenin circuit voltage');
  assert.equal(matchesSearchTokens(thevIndex, softQuorumTokens, SAMPLE_CARDS[0].title), true);

  // Corpus B-Tree construction
  const corpusTree = buildCorpusSearchBTree(SAMPLE_CARDS);
  assert.equal(corpusTree.hasPrefix('lhop'), true);
  assert.equal(corpusTree.hasPrefix('capac'), true);
});

