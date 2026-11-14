export type TheoremCategoryFilter = 'all' | 'theorems' | 'definitions';

export interface FormulaCardRecord {
  id: string;
  course: string;
  topicId: string;
  topicTitle: string;
  title: string;
  fullTitle?: string;
  examTag?: string;
  badge?: string;
  cardTypeClass?: string;
  copyText?: string;
  keywords: string;
  rawLatex: string;
  fmmDisplayMode?: boolean;
  htmlContent?: string;
  codeContent?: string;
  bodyText: string;
  useText?: string;
  stepsSummary?: string;
  steps?: string[];
  note?: string;
  seeAlso?: string;
  isLearned?: boolean;
  isStarred?: boolean;
}

export interface FilterState {
  course: string;
  status: 'all' | 'starred' | 'unlearned';
  query: string;
  thmFilter?: TheoremCategoryFilter;
}

export const STOP_WORDS = new Set([
  'of',
  'the',
  'and',
  'in',
  'for',
  'with',
  'to',
  'a',
  'an',
  'by',
  'on',
  'at',
  'from',
]);

export const GENERIC_QUERY_TERMS = new Set([
  'theorem',
  'theorems',
  'formula',
  'formulas',
  'formulae',
  'law',
  'laws',
  'rule',
  'rules',
  'equation',
  'equations',
  'definition',
  'definitions',
  'method',
  'methods',
  'principle',
  'principles',
  'property',
  'properties',
  'identity',
  'identities',
  'test',
  'tests',
  'function',
  'functions',
  'proof',
  'proofs',
  'problem',
  'problems',
  'relation',
  'relations',
  'form',
  'forms',
]);

export const CONVERSATIONAL_NOISE_WORDS = new Set([
  'how',
  'what',
  'when',
  'where',
  'why',
  'who',
  'which',
  'find',
  'finding',
  'get',
  'getting',
  'calculate',
  'calculating',
  'compute',
  'computing',
  'solve',
  'solving',
  'check',
  'checking',
  'determine',
  'show',
  'explain',
  'write',
  'make',
  'do',
  'does',
  'did',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'can',
  'could',
  'would',
  'should',
  'using',
  'use',
  'used',
  'into',
  'onto',
  'about',
  'around',
  'between',
  'through',
  'under',
  'over',
  'inside',
  'outside',
  'without',
  'way',
  'ways',
  'example',
  'examples',
  'question',
  'questions',
  'help',
  'need',
  'want',
]);

export const VAGUE_CONCEPT_MAP: Record<string, string[]> = {
  loop: ['kvl', 'kirchhoff', 'mesh', 'for', 'while', 'contour'],
  junction: ['kcl', 'kirchhoff', 'nodal', 'node'],
  node: ['kcl', 'kirchhoff', 'nodal', 'linked'],
  simplify: ['thevenin', 'norton', 'equivalent', 'delta', 'wye'],
  switch: ['transient', 'step', 'rc', 'rl', 'rlc', 'case', 'break'],
  charge: ['capacitor', 'capacitance', 'transient', 'coulomb', 'kcl'],
  discharge: ['capacitor', 'transient', 'rc', 'time', 'constant'],
  slope: ['derivative', 'differentiation', 'tangent', 'gradient'],
  rate: ['derivative', 'differentiation', 'related', 'velocity'],
  extreme: ['maxima', 'minima', 'optimization', 'stationary', 'extrema'],
  optimize: ['maxima', 'minima', 'optimization', 'stationary'],
  largest: ['maxima', 'maximum', 'optimization', 'array'],
  smallest: ['minima', 'minimum', 'optimization', 'array'],
  revolve: ['volume', 'revolution', 'surface', 'solid', 'integral'],
  spin: ['volume', 'revolution', 'surface', 'solid'],
  solid: ['volume', 'revolution', 'surface', 'integral'],
  approximate: ['taylor', 'maclaurin', 'series', 'linearization', 'differentials'],
  expand: ['taylor', 'maclaurin', 'laurent', 'series', 'binomial'],
  spring: ['shm', 'harmonic', 'oscillation', 'hooke', 'stiffness'],
  pendulum: ['shm', 'harmonic', 'oscillation', 'period', 'torsional'],
  vibrate: ['shm', 'harmonic', 'oscillation', 'resonance', 'wave'],
  slit: ['interference', 'diffraction', 'young', 'grating', 'fringe'],
  fringe: ['interference', 'diffraction', 'young', 'newton', 'michelson'],
  engine: ['carnot', 'thermodynamics', 'efficiency', 'otto', 'diesel', 'heat'],
  disorder: ['entropy', 'thermodynamics', 'second', 'boltzmann'],
  flip: ['bitwise', 'bit', 'complement', 'xor', 'toggle', 'invert'],
  toggle: ['bitwise', 'bit', 'xor', 'mask'],
  lowest: ['bitwise', 'bit', 'lsb', 'rightmost', 'tricks'],
  rightmost: ['bitwise', 'bit', 'lsb', 'lowest', 'tricks'],
  leak: ['malloc', 'calloc', 'free', 'delete', 'destructor', 'memory', 'dynamic'],
  heap: ['malloc', 'calloc', 'realloc', 'free', 'new', 'delete', 'dynamic'],
  allocate: ['malloc', 'calloc', 'realloc', 'new', 'dynamic', 'memory'],
  deallocate: ['free', 'delete', 'destructor', 'dynamic', 'memory'],
  reverse: ['strrev', 'string', 'array', 'palindrome', 'number'],
  duplicate: ['array', 'string', 'remove', 'unique'],
  rotate: ['array', 'bitwise', 'matrix', 'shift'],
  override: ['virtual', 'polymorphism', 'inheritance', 'derived'],
  inherit: ['inheritance', 'derived', 'base', 'virtual', 'protected'],
};

/**
 * Node in a balanced B-Tree (Bayer–McCreight).
 * Maintains sorted `keys`, associated `values` buckets, and `children` pointers.
 */
export class BTreeNode<V = number> {
  keys: string[] = [];
  values: V[][] = [];
  children: BTreeNode<V>[] = [];
  leaf: boolean;

  constructor(leaf = true) {
    this.leaf = leaf;
  }
}

function lowerBoundKeys(keys: string[], target: string): number {
  let lo = 0;
  let hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keys[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Balanced B-Tree index supporting:
 * - O(log N) exact key lookup (`searchExact`)
 * - O(log N + K) lexicographical range and prefix scans (`searchRange`, `searchPrefix`)
 * - O(log N) B-Tree-pruned fuzzy and subsequence matching (`searchFuzzy`, `queryVagueToken`)
 */
export class SearchBTree<V = number> {
  readonly t: number;
  root: BTreeNode<V>;
  private _size = 0;

  constructor(t = 4) {
    this.t = Math.max(2, t);
    this.root = new BTreeNode<V>(true);
  }

  get size(): number {
    return this._size;
  }

  private findNodeAndIndex(
    node: BTreeNode<V>,
    key: string
  ): { node: BTreeNode<V>; index: number } | null {
    const i = lowerBoundKeys(node.keys, key);
    if (i < node.keys.length && node.keys[i] === key) {
      return { node, index: i };
    }
    if (node.leaf) {
      return null;
    }
    return this.findNodeAndIndex(node.children[i], key);
  }

  private splitChild(parent: BTreeNode<V>, i: number): void {
    const t = this.t;
    const fullChild = parent.children[i];
    const rightSibling = new BTreeNode<V>(fullChild.leaf);

    const medianKey = fullChild.keys[t - 1];
    const medianVal = fullChild.values[t - 1];

    rightSibling.keys = fullChild.keys.slice(t);
    rightSibling.values = fullChild.values.slice(t);
    fullChild.keys = fullChild.keys.slice(0, t - 1);
    fullChild.values = fullChild.values.slice(0, t - 1);

    if (!fullChild.leaf) {
      rightSibling.children = fullChild.children.slice(t);
      fullChild.children = fullChild.children.slice(0, t);
    }

    parent.children.splice(i + 1, 0, rightSibling);
    parent.keys.splice(i, 0, medianKey);
    parent.values.splice(i, 0, medianVal);
  }

  private insertNonFull(node: BTreeNode<V>, key: string, value: V): void {
    let i = lowerBoundKeys(node.keys, key);
    if (node.leaf) {
      node.keys.splice(i, 0, key);
      node.values.splice(i, 0, [value]);
      return;
    }

    if (node.children[i].keys.length === 2 * this.t - 1) {
      this.splitChild(node, i);
      if (key === node.keys[i]) {
        if (!node.values[i].includes(value)) {
          node.values[i].push(value);
        }
        return;
      }
      if (key > node.keys[i]) {
        i++;
      }
    }
    this.insertNonFull(node.children[i], key, value);
  }

  insert(rawKey: string, value: V): void {
    const key = rawKey.trim().toLowerCase();
    if (!key) return;

    const existing = this.findNodeAndIndex(this.root, key);
    if (existing) {
      const bucket = existing.node.values[existing.index];
      if (!bucket.includes(value)) {
        bucket.push(value);
      }
      return;
    }

    this._size++;
    const r = this.root;
    if (r.keys.length === 2 * this.t - 1) {
      const s = new BTreeNode<V>(false);
      this.root = s;
      s.children.push(r);
      this.splitChild(s, 0);
      this.insertNonFull(s, key, value);
    } else {
      this.insertNonFull(r, key, value);
    }
  }

  searchExact(rawKey: string): V[] {
    const key = rawKey.trim().toLowerCase();
    if (!key) return [];
    const hit = this.findNodeAndIndex(this.root, key);
    return hit ? hit.node.values[hit.index] : [];
  }

  private rangeTraverse(
    node: BTreeNode<V>,
    lowKey: string,
    highKey: string,
    out: Array<{ key: string; values: V[] }>,
    limit: number
  ): void {
    if (out.length >= limit) return;
    const startIdx = lowerBoundKeys(node.keys, lowKey);

    for (let i = startIdx; i < node.keys.length; i++) {
      if (!node.leaf) {
        this.rangeTraverse(node.children[i], lowKey, highKey, out, limit);
        if (out.length >= limit) return;
      }
      const k = node.keys[i];
      if (k > highKey) {
        return;
      }
      if (k >= lowKey) {
        out.push({ key: k, values: node.values[i] });
        if (out.length >= limit) return;
      }
    }

    if (!node.leaf) {
      this.rangeTraverse(node.children[node.keys.length], lowKey, highKey, out, limit);
    }
  }

  /**
   * Executes an O(log N + K) lexicographical range scan `[lowKey, highKey]` over the B-Tree,
   * pruning all subtrees outside the range.
   */
  searchRange(
    lowKey: string,
    highKey: string,
    limit = 64
  ): Array<{ key: string; values: V[] }> {
    const lo = lowKey.trim().toLowerCase();
    const hi = highKey.trim().toLowerCase();
    if (!lo || lo > hi) return [];
    const out: Array<{ key: string; values: V[] }> = [];
    this.rangeTraverse(this.root, lo, hi, out, limit);
    return out;
  }

  hasExact(rawKey: string): boolean {
    return this.searchExact(rawKey).length > 0;
  }

  /**
   * Executes an O(log N + K) prefix scan over the B-Tree using range `[prefix, prefix + '\uffff']`.
   */
  searchPrefix(prefix: string, limit = 64): Array<{ key: string; values: V[] }> {
    const clean = prefix.trim().toLowerCase();
    if (!clean) return [];
    return this.searchRange(clean, clean + '\uffff', limit);
  }

  hasPrefix(prefix: string): boolean {
    return this.searchPrefix(prefix, 1).length > 0;
  }
}

/**
 * Returns true if a query token is a generic academic qualifier word
 * (like "theorem", "formula", "law", "rule") or a stop word.
 */
export function isGenericQueryTerm(token: string): boolean {
  const q = normalizeSearchText(token);
  return !q || GENERIC_QUERY_TERMS.has(q) || STOP_WORDS.has(q);
}

/**
 * Returns true if a query token is a conversational filler word (like "how", "find",
 * "calculate", "what", "when") or a stop word.
 */
export function isConversationalNoiseTerm(token: string): boolean {
  const q = normalizeSearchText(token);
  return !q || STOP_WORDS.has(q) || CONVERSATIONAL_NOISE_WORDS.has(q);
}

/**
 * Strips common plural suffixes so "theorems" -> "theorem", "identities" -> "identity",
 * "formulae"/"formulas" -> "formula", "gausss" -> "gauss", "greens" -> "green".
 */
export function stemSearchToken(token: string): string {
  if (!token || token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) {
    return token.slice(0, -3) + 'y';
  }
  if (token.endsWith('ae') && token.startsWith('formul')) {
    return 'formula';
  }
  if (token.endsWith('sss')) {
    return token.slice(0, -1);
  }
  if (token.endsWith('ss')) {
    return token;
  }
  if (token.endsWith('s') && !token.endsWith('us') && !token.endsWith('is')) {
    return token.slice(0, -1);
  }
  return token;
}

export const DOMAIN_SYNONYM_MAP: Record<string, string> = {
  cif: 'cauchy integral formula',
  cit: 'cauchy goursat integral theorem',
  cgt: 'cauchy goursat integral theorem',
  crt: 'cauchy residue theorem',
  cr: 'cauchy riemann',
  cre: 'cauchy riemann',
  mvt: 'mean value theorem',
  lmvt: 'lagrange mean value',
  cmvt: 'cauchy mean value',
  ivt: 'intermediate value theorem',
  ftc: 'fundamental theorem calculus',
  ibp: 'integration by parts',
  lhr: 'lhopital indeterminate',
  lhopital: 'lhopital indeterminate',
  lhospital: 'lhopital indeterminate',
  leibniz: 'leibnitz',
  kirchoff: 'kirchhoff',
  thevnin: 'thevenin',
  thv: 'thevenin',
  mpt: 'maximum power transfer',
  mptt: 'maximum power transfer',
  kcl: 'kirchhoff current law',
  kvl: 'kirchhoff voltage law',
  pf: 'power factor correction',
  pfc: 'power factor correction',
  shm: 'simple harmonic motion',
  ydse: 'young double slit interference',
  opd: 'optical path difference',
  tir: 'total internal reflection',
  dof: 'degrees of freedom equipartition',
  bst: 'binary search tree',
  dma: 'dynamic memory allocation malloc calloc',
  oop: 'object oriented programming',
  ncr: 'combinations binomial coefficient',
  npr: 'permutations arrangement factorial',
  amgm: 'arithmetic geometric harmonic mean inequality',
  cht: 'cayley hamilton theorem',
  rref: 'row echelon rank nullity',
};

/**
 * Normalizes Unicode diacritics (NFD + strip [\u0300-\u036f]), curly apostrophes,
 * hyphens, en/em-dashes, and strips backslashes so both plain words and LaTeX
 * commands match cleanly (e.g. Thévenin -> thevenin, L'Hôpital -> lhopital,
 * Ampère -> ampere, Möbius -> mobius).
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’ʼ`]/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates title initialisms from card.title:
 * - Full initialism: first letter of every word in card.title
 * - Stop-word-filtered initialism: first letter of every word excluding STOP_WORDS
 * - Consecutive word-initial substrings (length 2..6) so acronym prefixes match O(1)
 */
export function generateTitleInitialisms(title: string): string[] {
  if (!title) return [];
  const out = new Set<string>();

  // Extract words from both the full title and the main title before any parenthetical
  const preParen = title.replace(/\([^)]*\)/g, ' ');
  for (const variant of [title, preParen]) {
    const clean = normalizeSearchText(variant).replace(/[^a-z0-9\s]/g, ' ');
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const fullInitials = words.map((w) => w[0]).join('');
      if (fullInitials.length >= 2) {
        out.add(fullInitials);
      }
      // Also index consecutive initial substrings of length 2..5 for Step C
      for (let start = 0; start < words.length; start++) {
        let sub = '';
        for (let end = start; end < words.length && end - start < 6; end++) {
          sub += words[end][0];
          if (sub.length >= 2) {
            out.add(sub);
          }
        }
      }
    }

    const filteredWords = words.filter((w) => !STOP_WORDS.has(w));
    if (filteredWords.length >= 2) {
      const stopFilteredInitials = filteredWords.map((w) => w[0]).join('');
      if (stopFilteredInitials.length >= 2) {
        out.add(stopFilteredInitials);
      }
      for (let start = 0; start < filteredWords.length; start++) {
        let sub = '';
        for (let end = start; end < filteredWords.length && end - start < 6; end++) {
          sub += filteredWords[end][0];
          if (sub.length >= 2) {
            out.add(sub);
          }
        }
      }
    }
  }

  return Array.from(out);
}

/**
 * Determines whether a theorem/definition card badge represents a Definition
 * (as opposed to Law, Theorem, Principle, Rule, Postulate, Identity, etc.).
 */
export function isDefinitionBadge(badge?: string): boolean {
  return (badge || '').trim().toLowerCase() === 'definition';
}

/**
 * Checks whether a card in the Theorems & Definitions section matches the 2-button filter:
 * - 'definitions': keeps only Definition cards
 * - 'theorems': filters out Definitions and keeps Laws, Theorems, Principles, Rules, and everything else
 * - 'all': keeps all cards
 */
export function matchesTheoremCategoryFilter(
  badge: string | undefined,
  thmFilter: TheoremCategoryFilter = 'all'
): boolean {
  if (!thmFilter || thmFilter === 'all') return true;
  const isDef = isDefinitionBadge(badge);
  return thmFilter === 'definitions' ? isDef : !isDef;
}

export interface TopicFilterSummary {
  topicId: string;
  course: string;
  visibleCount: number;
  totalCount: number;
  learnedCount: number;
  hidden: boolean;
  visibleCardIds: string[];
  maxScore?: number;
}

export interface SearchFilterResult {
  tokens: string[];
  visibleCards: number;
  totalCardsInActiveRoot: number;
  totalCardsInScope: number;
  visibleTopics: number;
  topics: TopicFilterSummary[];
  rankedCardIds?: string[];
}

/**
 * Normalizes a LaTeX expression so users can search for symbols and subscripts
 * either with LaTeX syntax (e.g., "\omega", "V_{\text{th}}") or plain text
 * (e.g., "omega", "v_th", "vth").
 */
export function normalizeLatexForSearch(latex: string): string {
  if (!latex) return '';
  const lower = latex.toLowerCase();
  const withoutTextCmd = lower.replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^}]*)\}/g, '$1');
  const strippedBraces = withoutTextCmd
    .replace(/\\/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const compactSubscripts = strippedBraces.replace(/([a-z0-9])_([a-z0-9]+)/g, '$1_$2 $1$2');
  return (lower + ' ' + strippedBraces + ' ' + compactSubscripts).replace(/\s+/g, ' ').trim();
}

const cardSearchIndexWeakCache = new WeakMap<object, string>();

/**
 * Sanitizes multi-topic section headers (e.g., "Network theorems: Thevenin, Norton, superposition"
 * or "Green's, Stokes' and Gauss' theorems") out of a card's pre-baked `data-s` keywords and topicTitle
 * so sibling cards don't inherit other theorems' specific names, while preserving generic qualifier words.
 */
function sanitizeTopicHeaderForCard(rawKeywords: string, rawTopicTitle: string): {
  cleanedKeywords: string;
  indexedTopicTitle: string;
} {
  if (!rawTopicTitle) {
    return { cleanedKeywords: rawKeywords, indexedTopicTitle: '' };
  }
  const isMultiTopicHeader = /[,:]|\band\b|&/i.test(rawTopicTitle);
  if (!isMultiTopicHeader) {
    return { cleanedKeywords: rawKeywords, indexedTopicTitle: rawTopicTitle };
  }

  // Keep only generic qualifier words (like "theorem", "theorems", "law", "laws", "method") from multi-topic headers
  const topicWords = normalizeSearchText(rawTopicTitle).split(/[^a-z0-9]+/).filter(Boolean);
  const genericFromTopic = topicWords
    .filter((w) => GENERIC_QUERY_TERMS.has(w) || GENERIC_QUERY_TERMS.has(stemSearchToken(w)))
    .map((w) => `${w} ${stemSearchToken(w)}`)
    .join(' ');

  let cleanedKeywords = rawKeywords || '';
  const lowerTopic = rawTopicTitle.toLowerCase();
  if (cleanedKeywords.toLowerCase().includes(lowerTopic)) {
    const idx = cleanedKeywords.toLowerCase().indexOf(lowerTopic);
    cleanedKeywords =
      cleanedKeywords.slice(0, idx) +
      ' ' +
      genericFromTopic +
      ' ' +
      cleanedKeywords.slice(idx + lowerTopic.length);
  }

  return {
    cleanedKeywords,
    indexedTopicTitle: genericFromTopic,
  };
}

/**
 * Builds a normalized, lowercased search index string for a single formula card.
 * Includes diacritic-normalized text, automatic title initialisms, and domain synonyms.
 * Memoized via WeakMap for object references so repeated filter passes are O(1).
 */
export function buildFormulaSearchIndex(card: {
  keywords?: string;
  title?: string;
  fullTitle?: string;
  examTag?: string;
  badge?: string;
  topicTitle?: string;
  course?: string;
  rawLatex?: string;
  htmlContent?: string;
  codeContent?: string;
  bodyText?: string;
  useText?: string;
  note?: string;
  seeAlso?: string;
  steps?: string[];
}): string {
  if (card && typeof card === 'object') {
    const cached = cardSearchIndexWeakCache.get(card);
    if (cached !== undefined) {
      return cached;
    }
  }

  const { cleanedKeywords, indexedTopicTitle } = sanitizeTopicHeaderForCard(
    card.keywords || '',
    card.topicTitle || ''
  );

  const ownParts = [
    cleanedKeywords,
    card.title || '',
    card.fullTitle || '',
    card.examTag || '',
    card.badge || '',
    card.course || '',
    normalizeLatexForSearch(card.rawLatex || ''),
    card.htmlContent || '',
    card.codeContent || '',
    card.bodyText || '',
    card.useText || '',
    card.note || '',
    card.seeAlso || '',
    ...(card.steps || []),
  ];

  const ownRawJoined = ownParts.join(' ').toLowerCase();
  const ownNormalized = normalizeSearchText(ownRawJoined);
  const ownSpaceApostrophe = ownRawJoined
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’ʼ`]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\\/g, ' ');

  const rawJoined = [ownRawJoined, indexedTopicTitle].join(' ').toLowerCase();
  const normalizedJoined = normalizeSearchText(rawJoined);
  // Also include a version where apostrophes become spaces so both "lhopital" and "hopital", "greens" and "green" exist
  const spaceApostropheJoined = rawJoined
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’ʼ`]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\\/g, ' ');

  const initialisms = Array.from(
    new Set([
      ...generateTitleInitialisms(card.title || ''),
      ...(card.fullTitle ? generateTitleInitialisms(card.fullTitle) : []),
    ])
  );

  // Expand domain synonyms into the card index based strictly on the card's OWN content (not multi-topic section headers)
  const synonymAdditions: string[] = [];
  const combinedOwn = `${ownNormalized} ${ownSpaceApostrophe} ${initialisms.join(' ')}`;

  if (combinedOwn.includes('mean value') || /\bmvt\b/.test(combinedOwn)) {
    synonymAdditions.push('mvt mean value theorem');
    if (combinedOwn.includes('lagrange')) {
      synonymAdditions.push('lmvt lagrange mean value theorem');
    }
    if (combinedOwn.includes('cauchy')) {
      synonymAdditions.push('cmvt cauchy mean value theorem');
    }
  }
  if (combinedOwn.includes('cauchy') && combinedOwn.includes('integral') && combinedOwn.includes('formula')) {
    synonymAdditions.push('cif cauchy integral formula');
  }
  if (
    combinedOwn.includes('cauchy') &&
    combinedOwn.includes('integral') &&
    (combinedOwn.includes('theorem') || combinedOwn.includes('goursat'))
  ) {
    synonymAdditions.push('cit cgt cauchy goursat integral theorem');
  }
  if (combinedOwn.includes('residue') && combinedOwn.includes('theorem')) {
    synonymAdditions.push('crt cauchy residue theorem');
  }
  if (combinedOwn.includes('cauchy') && combinedOwn.includes('riemann')) {
    synonymAdditions.push('cr cre cauchy riemann');
  }
  if (combinedOwn.includes('intermediate value')) {
    synonymAdditions.push('ivt intermediate value theorem');
  }
  if (combinedOwn.includes('fundamental theorem') && combinedOwn.includes('calculus')) {
    synonymAdditions.push('ftc fundamental theorem calculus');
  }
  if (combinedOwn.includes('integration by parts')) {
    synonymAdditions.push('ibp ip integration by parts');
  }
  if (combinedOwn.includes('lhopital') || combinedOwn.includes('lhospital') || combinedOwn.includes('indeterminate')) {
    synonymAdditions.push('lhr lhopital lhospital lhopital indeterminate');
  }
  if (combinedOwn.includes('leibnitz') || combinedOwn.includes('leibniz')) {
    synonymAdditions.push('leibniz leibnitz');
  }
  if (combinedOwn.includes('kirchhoff') || combinedOwn.includes('kirchoff')) {
    synonymAdditions.push('kirchoff kirchhoff');
  }
  if (combinedOwn.includes('thevenin') || combinedOwn.includes('thevnin')) {
    synonymAdditions.push('thevnin thv thevenin');
  }
  if (combinedOwn.includes('maximum power transfer') || (indexedTopicTitle && normalizeSearchText(indexedTopicTitle).includes('maximum power transfer'))) {
    synonymAdditions.push('mpt mptt maximum power transfer');
  }
  if (combinedOwn.includes('kirchhoff') && combinedOwn.includes('current')) {
    synonymAdditions.push('kcl kirchhoff current law');
  }
  if (combinedOwn.includes('kirchhoff') && combinedOwn.includes('voltage')) {
    synonymAdditions.push('kvl kirchhoff voltage law');
  }
  if (combinedOwn.includes('power factor')) {
    synonymAdditions.push('pf pfc power factor correction');
  }
  if (combinedOwn.includes('simple harmonic motion') || /\bshm\b/.test(combinedOwn)) {
    synonymAdditions.push('shm simple harmonic motion');
  }
  if (combinedOwn.includes('double slit') || combinedOwn.includes('young')) {
    synonymAdditions.push('ydse young double slit interference');
  }
  if (combinedOwn.includes('optical path') || combinedOwn.includes('path difference')) {
    synonymAdditions.push('opd optical path difference');
  }
  if (combinedOwn.includes('total internal reflection') || combinedOwn.includes('critical angle')) {
    synonymAdditions.push('tir total internal reflection');
  }
  if (combinedOwn.includes('degrees of freedom') || combinedOwn.includes('equipartition')) {
    synonymAdditions.push('dof degrees of freedom equipartition');
  }
  if (combinedOwn.includes('binary search tree') || /\bbst\b/.test(combinedOwn)) {
    synonymAdditions.push('bst binary search tree');
  }
  if (combinedOwn.includes('dynamic memory') || combinedOwn.includes('malloc') || combinedOwn.includes('calloc')) {
    synonymAdditions.push('dma dynamic memory allocation malloc calloc');
  }
  if (combinedOwn.includes('object oriented') || /\boop\b/.test(combinedOwn)) {
    synonymAdditions.push('oop object oriented programming');
  }

  const built = [
    rawJoined,
    normalizedJoined,
    spaceApostropheJoined,
    initialisms.join(' '),
    synonymAdditions.join(' '),
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (card && typeof card === 'object') {
    cardSearchIndexWeakCache.set(card, built);
  }
  return built;
}

/**
 * Tokenizes a user search query into normalized, lowercased non-empty search terms.
 */
export function tokenizeSearchQuery(query: string): string[] {
  if (!query) return [];
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * Computes bounded Optimal String Alignment / Damerau–Levenshtein distance
 * (supporting insertions, deletions, substitutions, and adjacent transpositions).
 * Returns maxDist + 1 if distance exceeds maxDist.
 */
export function boundedDamerauLevenshtein(a: string, b: string, maxDist: number): number {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (lenA === 0) return lenB <= maxDist ? lenB : maxDist + 1;
  if (lenB === 0) return lenA <= maxDist ? lenA : maxDist + 1;

  // Allocate 3 rolling rows for OSA (i-2, i-1, i)
  let prev2 = new Array<number>(lenB + 1);
  let prev1 = new Array<number>(lenB + 1);
  let curr = new Array<number>(lenB + 1);

  for (let j = 0; j <= lenB; j++) {
    prev1[j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const charA = a.charCodeAt(i - 1);

    for (let j = 1; j <= lenB; j++) {
      const cost = charA === b.charCodeAt(j - 1) ? 0 : 1;
      let val = Math.min(
        prev1[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev1[j - 1] + cost // substitution
      );

      // Adjacent transposition (e.g. 'teh' <-> 'the', 'formual' <-> 'formula')
      if (
        i > 1 &&
        j > 1 &&
        charA === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        val = Math.min(val, prev2[j - 2] + 1);
      }

      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }

    if (rowMin > maxDist) {
      return maxDist + 1;
    }

    const tmp = prev2;
    prev2 = prev1;
    prev1 = curr;
    curr = tmp;
  }

  return prev1[lenB];
}

const cardBTreeCache = new Map<string, SearchBTree<number>>();

/**
 * Builds and caches a balanced B-Tree (`SearchBTree<number>`) for a card's normalized searchIndex.
 * Indexes all vocabulary words (length >= 2) and their stemmed forms so exact, prefix range,
 * stem-root, and B-Tree-pruned fuzzy lookups execute in O(log W).
 */
export function getCardVocabularyBTree(searchIndex: string): SearchBTree<number> {
  const cached = cardBTreeCache.get(searchIndex);
  if (cached !== undefined) return cached;

  const btree = new SearchBTree<number>(4);
  const words = searchIndex.match(/[a-z0-9_]{2,}/g) || [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    btree.insert(w, i);
    const stem = stemSearchToken(w);
    if (stem !== w && stem.length >= 2) {
      btree.insert(stem, i);
    }
  }

  if (cardBTreeCache.size > 2500) {
    cardBTreeCache.clear();
  }
  cardBTreeCache.set(searchIndex, btree);
  return btree;
}

/**
 * Builds a corpus-wide inverted B-Tree (`SearchBTree<string>`) mapping every indexed
 * term, stem, and title initialism across a collection of cards to matching card IDs.
 */
export function buildCorpusSearchBTree(cards: FormulaCardRecord[]): SearchBTree<string> {
  const tree = new SearchBTree<string>(4);
  for (const card of cards) {
    const idx = buildFormulaSearchIndex(card);
    const words = idx.match(/[a-z0-9_]{2,}/g) || [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      tree.insert(w, card.id);
      const stem = stemSearchToken(w);
      if (stem !== w && stem.length >= 2) {
        tree.insert(stem, card.id);
      }
    }
  }
  return tree;
}

function isOrderedSubsequence(shortToken: string, word: string): boolean {
  if (shortToken.length < 3 || word.length < shortToken.length + 2) return false;
  if (shortToken.charCodeAt(0) !== word.charCodeAt(0)) return false;
  let si = 0;
  for (let wi = 0; wi < word.length && si < shortToken.length; wi++) {
    if (word.charCodeAt(wi) === shortToken.charCodeAt(si)) {
      si++;
    }
  }
  return si === shortToken.length;
}

/**
 * Evaluates a single query token against a card's B-Tree and searchIndex using a 6-stage
 * B-Tree pipeline:
 * 1. Exact B-Tree key lookup or substring match (quality = 100)
 * 2. B-Tree prefix range scan `btree.searchPrefix(q)` for partial/prefix tokens (quality = 85)
 * 3. Domain synonym & vague concept alias B-Tree lookup (quality = 80)
 * 4. Title initialism / acronym prefix match (quality = 80)
 * 5. Shared morphological root range scan in B-Tree (5+ char common prefix, quality = 72)
 * 6. B-Tree-pruned Damerau–Levenshtein fuzzy & consonant-subsequence match (quality = 60)
 */
export function matchTokenWithBTreeQuality(
  hay: string,
  btree: SearchBTree<number>,
  rawToken: string,
  cardTitle?: string
): { matched: boolean; quality: number } {
  const q = normalizeSearchText(rawToken);
  if (!q) return { matched: true, quality: 100 };

  const qStem = stemSearchToken(q);

  // Stage 1: Exact B-Tree lookup or exact substring fast path
  if (btree.searchExact(q).length > 0 || hay.includes(q)) {
    return { matched: true, quality: 100 };
  }
  if (qStem !== q && qStem.length >= 3 && (btree.searchExact(qStem).length > 0 || hay.includes(qStem))) {
    return { matched: true, quality: 95 };
  }

  // Stage 2: B-Tree Prefix Range Scan [q, q + '\uffff'] for partial words (length >= 3)
  if (q.length >= 3 && btree.searchPrefix(q, 4).length > 0) {
    return { matched: true, quality: 85 };
  }
  if (qStem.length >= 3 && btree.searchPrefix(qStem, 4).length > 0) {
    return { matched: true, quality: 82 };
  }

  // Stage 3: Domain Synonym Expansion & Vague Concept Aliases via B-Tree
  const synonymExpansion = DOMAIN_SYNONYM_MAP[q];
  if (synonymExpansion) {
    const synWords = synonymExpansion.split(/\s+/).filter(Boolean);
    if (
      synWords.length > 0 &&
      synWords.every((sw) => btree.searchPrefix(sw, 1).length > 0 || hay.includes(sw))
    ) {
      return { matched: true, quality: 85 };
    }
  }

  const vagueTargets = VAGUE_CONCEPT_MAP[q] || (qStem !== q ? VAGUE_CONCEPT_MAP[qStem] : undefined);
  if (vagueTargets) {
    for (let i = 0; i < vagueTargets.length; i++) {
      const vt = vagueTargets[i];
      if (btree.searchExact(vt).length > 0 || btree.searchPrefix(vt, 1).length > 0) {
        return { matched: true, quality: 75 };
      }
    }
  }

  // Stage 4: Subsequence / Acronym Prefix on title initials (2 <= q.length <= 5)
  if (q.length >= 2 && q.length <= 5 && /^[a-z0-9]+$/.test(q) && cardTitle) {
    const titleInitials = generateTitleInitialisms(cardTitle);
    if (titleInitials.some((init) => init.includes(q))) {
      return { matched: true, quality: 80 };
    }
  }

  // Stage 5: Shared morphological root range scan in B-Tree (e.g. "differentiating" -> "differentiation")
  if (q.length >= 5 && /^[a-z0-9]+$/.test(q)) {
    const rootLen = Math.min(5, q.length - 1);
    const rootPrefix = q.slice(0, rootLen);
    const rootHits = btree.searchPrefix(rootPrefix, 12);
    if (rootHits.some((entry) => entry.key.length >= 5)) {
      return { matched: true, quality: 72 };
    }
  }

  // Stage 6: B-Tree-pruned Bounded Damerau–Levenshtein Fuzzy & Consonant-Subsequence Matching
  if (q.length >= 4 && /^[a-z0-9]+$/.test(q)) {
    const maxDist = q.length >= 8 ? 2 : 1;
    // Use B-Tree prefix scan on the first character (and transposed second character) to prune candidate space
    const firstCharPrefix = q.slice(0, 1);
    const candidates = btree.searchPrefix(firstCharPrefix, 80);
    if (q.length >= 5 && q[0] !== q[1]) {
      const transposedCandidates = btree.searchPrefix(q[1] + q[0], 16);
      for (let i = 0; i < transposedCandidates.length; i++) {
        candidates.push(transposedCandidates[i]);
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const w = candidates[i].key;
      if (q.length >= 5 && Math.abs(w.length - q.length) <= maxDist) {
        if (boundedDamerauLevenshtein(q, w, maxDist) <= maxDist) {
          return { matched: true, quality: 65 };
        }
      }
      if (q.length >= 5 && w.length > q.length) {
        const wPrefix = w.slice(0, q.length);
        if (boundedDamerauLevenshtein(q, wPrefix, 1) <= 1) {
          return { matched: true, quality: 62 };
        }
      }
      // Consonant abbreviation subsequence (e.g. "trnsnt" -> "transient", "plndrm" -> "palindrome")
      if (
        q.length >= 4 &&
        q.length <= 6 &&
        !/[aeiou]/.test(q.slice(1)) &&
        isOrderedSubsequence(q, w)
      ) {
        return { matched: true, quality: 55 };
      }
    }
  }

  return { matched: false, quality: 0 };
}

/**
 * Checks whether a precomputed card search index matches the query tokens using
 * the balanced B-Tree index (`SearchBTree`), conversational noise filtering,
 * and a soft-quorum threshold for 3+ word vague natural-language queries.
 */
export function matchesSearchTokens(
  searchIndex: string,
  tokens: string[],
  cardTitle?: string
): boolean {
  if (!tokens.length) return true;
  const hay = (searchIndex || '').toLowerCase();
  const btree = getCardVocabularyBTree(hay);

  // Filter out conversational filler words ("how", "to", "find", "what", etc.) when real content tokens exist
  const contentTokens = tokens.filter((t) => !isConversationalNoiseTerm(t));
  const effectiveTokens = contentTokens.length > 0 ? contentTokens : tokens;

  let matchedCount = 0;
  let strongAnchorMatch = false;

  for (let i = 0; i < effectiveTokens.length; i++) {
    const tok = effectiveTokens[i];
    const res = matchTokenWithBTreeQuality(hay, btree, tok, cardTitle);
    if (res.matched) {
      matchedCount++;
      if (!isGenericQueryTerm(tok) && res.quality >= 60) {
        strongAnchorMatch = true;
      }
    } else if (effectiveTokens.length <= 2) {
      // For 1-word and 2-word specific queries, require all content tokens to match
      return false;
    }
  }

  if (matchedCount === effectiveTokens.length) {
    return true;
  }

  // For 3+ content-token vague queries, allow B-Tree soft quorum (>= 66% of content tokens + strong anchor)
  if (effectiveTokens.length >= 3 && strongAnchorMatch) {
    const requiredQuorum = Math.max(2, Math.ceil(effectiveTokens.length * 0.66));
    return matchedCount >= requiredQuorum;
  }

  return false;
}

/**
 * Computes a specificity-weighted relevance score for a card against the query tokens.
 * - Returns 0 if the card does not match all query tokens.
 * - Heavily weights specific anchor terms (!isGenericQueryTerm) matching in card.title
 *   and exact contiguous phrases in card.title over generic qualifier words ("theorem",
 *   "formula", "law", "rule", etc.) or tangential mentions buried in body notes.
 */
export function scoreFormulaCardSearch(
  card: {
    title?: string;
    fullTitle?: string;
    examTag?: string;
    badge?: string;
    topicTitle?: string;
    keywords?: string;
    rawLatex?: string;
    htmlContent?: string;
    codeContent?: string;
    bodyText?: string;
    useText?: string;
    note?: string;
    seeAlso?: string;
    steps?: string[];
  },
  tokens: string[],
  rawQuery?: string,
  precomputedIndex?: string
): number {
  if (!tokens.length) return 1;
  const idx = (precomputedIndex ?? buildFormulaSearchIndex(card)).toLowerCase();
  const combinedTitle =
    card.fullTitle && card.fullTitle !== card.title
      ? `${card.title || ''} ${card.fullTitle}`
      : card.title || '';
  if (!matchesSearchTokens(idx, tokens, combinedTitle)) {
    return 0;
  }

  const rawTitle = combinedTitle;
  const normTitle = normalizeSearchText(rawTitle);
  const normTitleNoParens = normalizeSearchText(rawTitle.replace(/\([^)]*\)/g, ' '));
  const titleWords = normTitle
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => stemSearchToken(w));
  const titleNoParensWords = normTitleNoParens
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => stemSearchToken(w));
  const titleInitials = Array.from(
    new Set([
      ...generateTitleInitialisms(card.title || ''),
      ...(card.fullTitle ? generateTitleInitialisms(card.fullTitle) : []),
    ])
  );
  const normBadge = stemSearchToken(normalizeSearchText(card.badge || ''));
  const normTopic = normalizeSearchText(card.topicTitle || '');
  const normQuery = normalizeSearchText(rawQuery || tokens.join(' '));

  const rawAnchorCandidates = tokens.filter(
    (t) => !isGenericQueryTerm(t) && !isConversationalNoiseTerm(t)
  );
  const anchorTokens =
    rawAnchorCandidates.length > 0
      ? rawAnchorCandidates
      : tokens.filter((t) => !isGenericQueryTerm(t));
  const genericTokens = tokens.filter((t) => isGenericQueryTerm(t));
  const cardBTree = getCardVocabularyBTree(idx);

  let score = 10;

  // 1. Full query / phrase match in card.title (including parenthetical-stripped title)
  if (normQuery && normTitle) {
    const stemmedTitlePhrase = titleWords.join(' ');
    const stemmedNoParensPhrase = titleNoParensWords.join(' ');
    const contentTokensForPhrase =
      rawAnchorCandidates.length > 0 ? tokens.filter((t) => !isConversationalNoiseTerm(t)) : tokens;
    const stemmedQueryPhrase = contentTokensForPhrase
      .map((t) => stemSearchToken(normalizeSearchText(t)))
      .join(' ');

    if (
      normTitle === normQuery ||
      normTitleNoParens === normQuery ||
      (stemmedQueryPhrase.length >= 3 &&
        (stemmedTitlePhrase === stemmedQueryPhrase ||
          stemmedNoParensPhrase === stemmedQueryPhrase))
    ) {
      score += 10000;
    } else if (
      normTitle.includes(normQuery) ||
      normTitleNoParens.includes(normQuery) ||
      (stemmedQueryPhrase.length >= 3 &&
        (stemmedTitlePhrase.includes(stemmedQueryPhrase) ||
          stemmedNoParensPhrase.includes(stemmedQueryPhrase)))
    ) {
      score += 5000;
    }
  }

  // 2. Score Specific Anchor Tokens (govern 95%+ of ranking weight)
  let anchorsInTitleCount = 0;
  for (const rawAnchor of anchorTokens) {
    const a = normalizeSearchText(rawAnchor);
    const aStem = stemSearchToken(a);

    const wordIdxInTitle = titleWords.findIndex((tw) => tw === a || tw === aStem);
    const exactWordInTitle = wordIdxInTitle !== -1;
    const prefixWordInTitle =
      !exactWordInTitle &&
      a.length >= 3 &&
      titleWords.some((tw) => tw.startsWith(a) || (aStem.length >= 3 && tw.startsWith(aStem)));
    const substringInTitle =
      normTitle.includes(a) || (aStem.length >= 3 && normTitle.includes(aStem));
    const acronymInTitle =
      a.length >= 2 &&
      a.length <= 5 &&
      titleInitials.some((init) => init === a || init.startsWith(a));
    const synExpansion = DOMAIN_SYNONYM_MAP[a];
    const synInTitle = synExpansion
      ? synExpansion
          .split(/\s+/)
          .filter((sw) => !isGenericQueryTerm(sw))
          .every((sw) => normTitle.includes(sw))
      : false;
    const vagueConcepts = VAGUE_CONCEPT_MAP[a] || (aStem !== a ? VAGUE_CONCEPT_MAP[aStem] : undefined);
    const vagueInTitle = vagueConcepts
      ? vagueConcepts.some((vc) => normTitle.includes(vc))
      : false;

    if (exactWordInTitle) {
      score += 1500;
      anchorsInTitleCount++;
      if (wordIdxInTitle === 0) {
        score += 500;
      } else if (wordIdxInTitle === 1) {
        score += 250;
      }
    } else if (substringInTitle || acronymInTitle || synInTitle || prefixWordInTitle) {
      score += 1100;
      anchorsInTitleCount++;
    } else if (vagueInTitle) {
      score += 850;
      anchorsInTitleCount++;
    } else {
      // Check if fuzzy-matched in title (e.g., "formual" or "thevnin" in title)
      const fuzzyInTitle =
        a.length >= 5 &&
        titleWords.some(
          (tw) =>
            tw.charCodeAt(0) === a.charCodeAt(0) &&
            Math.abs(tw.length - a.length) <= 1 &&
            boundedDamerauLevenshtein(a, tw, 1) <= 1
        );
      if (fuzzyInTitle) {
        score += 900;
        anchorsInTitleCount++;
      } else if (
        normTopic.includes(a) ||
        (aStem.length >= 3 && normTopic.includes(aStem)) ||
        (vagueConcepts && vagueConcepts.some((vc) => normTopic.includes(vc)))
      ) {
        score += 250;
      } else if (
        cardBTree.hasExact(a) ||
        cardBTree.hasExact(aStem) ||
        idx.includes(a) ||
        (aStem.length >= 3 && idx.includes(aStem))
      ) {
        score += 80;
      } else if (
        (a.length >= 3 && cardBTree.hasPrefix(a)) ||
        (aStem.length >= 3 && cardBTree.hasPrefix(aStem)) ||
        (vagueConcepts &&
          vagueConcepts.some((vc) => cardBTree.hasPrefix(vc) || idx.includes(vc)))
      ) {
        score += 55;
      } else if (a.length >= 5 && cardBTree.hasPrefix(a.slice(0, 4))) {
        score += 35;
      } else {
        score += 15;
      }
    }
  }

  if (anchorTokens.length > 0 && anchorsInTitleCount === anchorTokens.length) {
    score += 2500;
    // Conciseness bonus when all anchor terms are in the title
    score += Math.max(0, 120 - normTitle.length);
  }

  // 3. Score Generic Qualifier Tokens ("theorem", "formula", "law", "rule", etc.)
  // Small tie-breaking weight so generic words never overpower specific anchor terms
  for (const rawGen of genericTokens) {
    const g = normalizeSearchText(rawGen);
    const gStem = stemSearchToken(g);
    if (titleWords.some((tw) => tw === g || tw === gStem) || normTitle.includes(gStem)) {
      score += 45;
    } else if (normBadge && (normBadge === g || normBadge === gStem)) {
      score += 30;
    } else if (normTopic.includes(gStem)) {
      score += 10;
    } else {
      score += 2;
    }
  }

  return score;
}

/**
 * Dynamically filters a collection of formula cards grouped by topic in real-time,
 * sorting visible cards and topics by relevance when a search query is active.
 */
export function filterFormulaCards(
  cards: FormulaCardRecord[],
  state: FilterState
): SearchFilterResult {
  const tokens = tokenizeSearchQuery(state.query);
  const hasQuery = tokens.length > 0;
  const topicOrder: string[] = [];
  const topicMap = new Map<string, { course: string; cards: FormulaCardRecord[] }>();

  for (const card of cards) {
    let entry = topicMap.get(card.topicId);
    if (!entry) {
      entry = { course: card.course, cards: [] };
      topicMap.set(card.topicId, entry);
      topicOrder.push(card.topicId);
    }
    entry.cards.push(card);
  }

  let visibleCards = 0;
  let totalCardsInActiveRoot = 0;
  let totalCardsInScope = 0;
  let visibleTopics = 0;
  const topics: TopicFilterSummary[] = [];
  const allScoredMatches: Array<{ id: string; score: number; order: number }> = [];
  let globalOrder = 0;

  for (const topicId of topicOrder) {
    const group = topicMap.get(topicId)!;
    const courseMatch = state.course === 'ALL' || group.course === state.course;
    let secLearned = 0;
    let secVisible = 0;
    let maxScore = 0;
    const scoredSectionCards: Array<{ id: string; score: number; order: number }> = [];

    for (const card of group.cards) {
      const order = globalOrder++;
      totalCardsInActiveRoot++;
      if (courseMatch) totalCardsInScope++;
      if (card.isLearned) secLearned++;

      let statusMatch = true;
      if (state.status === 'starred') statusMatch = !!card.isStarred;
      else if (state.status === 'unlearned') statusMatch = !card.isLearned;

      const thmMatch = matchesTheoremCategoryFilter(card.badge, state.thmFilter || 'all');

      const idx = buildFormulaSearchIndex(card);
      const score = hasQuery
        ? scoreFormulaCardSearch(card, tokens, state.query, idx)
        : matchesSearchTokens(idx, tokens, card.title)
        ? 1
        : 0;
      const queryMatch = score > 0;

      const showCard = courseMatch && statusMatch && thmMatch && queryMatch;
      if (showCard) {
        secVisible++;
        visibleCards++;
        if (score > maxScore) maxScore = score;
        scoredSectionCards.push({ id: card.id, score, order });
        allScoredMatches.push({ id: card.id, score, order });
      }
    }

    if (hasQuery && scoredSectionCards.length > 1) {
      scoredSectionCards.sort((a, b) => b.score - a.score || a.order - b.order);
    }

    const visibleCardIds = scoredSectionCards.map((item) => item.id);
    const hidden = !courseMatch || secVisible === 0;
    if (!hidden) visibleTopics++;

    topics.push({
      topicId,
      course: group.course,
      visibleCount: secVisible,
      totalCount: group.cards.length,
      learnedCount: secLearned,
      hidden,
      visibleCardIds,
      maxScore,
    });
  }

  if (hasQuery && allScoredMatches.length > 1) {
    allScoredMatches.sort((a, b) => b.score - a.score || a.order - b.order);
  }

  return {
    tokens,
    visibleCards,
    totalCardsInActiveRoot,
    totalCardsInScope,
    visibleTopics,
    topics,
    rankedCardIds: allScoredMatches.map((m) => m.id),
  };
}

