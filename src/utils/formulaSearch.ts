export type TheoremCategoryFilter = 'all' | 'theorems' | 'definitions';

export interface FormulaCardRecord {
  id: string;
  course: string;
  topicId: string;
  topicTitle: string;
  title: string;
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

/**
 * Returns true if a query token is a generic academic qualifier word
 * (like "theorem", "formula", "law", "rule") or a stop word.
 */
export function isGenericQueryTerm(token: string): boolean {
  const q = normalizeSearchText(token);
  return !q || GENERIC_QUERY_TERMS.has(q) || STOP_WORDS.has(q);
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
const searchIndexWordsCache = new Map<string, string[]>();

/**
 * Extracts and caches a deduplicated array of normalized alphanumeric words (length >= 3)
 * from a card's searchIndex for fast Damerau–Levenshtein fuzzy matching.
 */
export function getSearchIndexWords(searchIndex: string): string[] {
  const cached = searchIndexWordsCache.get(searchIndex);
  if (cached !== undefined) return cached;

  const matches = searchIndex.match(/[a-z0-9]{3,}/g) || [];
  const uniqueWords = Array.from(new Set(matches));
  // Prevent unbounded growth in synthetic test loops while keeping all ~600 real cards cached
  if (searchIndexWordsCache.size > 2500) {
    searchIndexWordsCache.clear();
  }
  searchIndexWordsCache.set(searchIndex, uniqueWords);
  return uniqueWords;
}

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

  const initialisms = generateTitleInitialisms(card.title || '');

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

/**
 * Checks whether a single normalized query token matches a card's searchIndex
 * using the 4-stage pipeline:
 * - Step A: Exact Substring match O(1) (plus stem match for plural generic terms)
 * - Step B: Domain Synonym Expansion
 * - Step C: Subsequence / Acronym Prefix on title initials (for 2 <= q.length <= 5)
 * - Step D: Bounded Damerau–Levenshtein Fuzzy Matching (for q.length >= 6 with matching initial char)
 */
function matchesSingleToken(hay: string, rawToken: string, cardTitle?: string): boolean {
  const q = normalizeSearchText(rawToken);
  if (!q) return true;

  // Step A: Exact Substring fast path
  if (hay.includes(q)) return true;

  const qStem = stemSearchToken(q);
  if (qStem !== q && qStem.length >= 3 && hay.includes(qStem)) {
    return true;
  }

  // Step B: Synonym Expansion
  const synonymExpansion = DOMAIN_SYNONYM_MAP[q];
  if (synonymExpansion) {
    const synWords = synonymExpansion.split(/\s+/).filter(Boolean);
    if (synWords.length > 0 && synWords.every((sw) => hay.includes(sw))) {
      return true;
    }
  }

  // Step C: Subsequence / Acronym Prefix (2 <= q.length <= 5)
  if (q.length >= 2 && q.length <= 5 && /^[a-z0-9]+$/.test(q)) {
    if (cardTitle) {
      const titleInitials = generateTitleInitialisms(cardTitle);
      if (titleInitials.some((init) => init.includes(q))) {
        return true;
      }
    }
  }

  // Step D: Typo-Tolerant Bounded Damerau–Levenshtein Edit Distance (q.length >= 6)
  // Requires matching first character so short words don't fuzzy-match unrelated vocabulary
  if (q.length >= 6 && /^[a-z0-9]+$/.test(q)) {
    const maxDist = 1;
    const words = getSearchIndexWords(hay);
    const firstChar = q.charCodeAt(0);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.charCodeAt(0) !== firstChar) continue;
      if (Math.abs(w.length - q.length) <= maxDist) {
        if (boundedDamerauLevenshtein(q, w, maxDist) <= maxDist) {
          return true;
        }
      }
      // Also allow prefix fuzzy match when user is typing a longer word (w.length > q.length)
      if (w.length > q.length) {
        const wPrefix = w.slice(0, q.length);
        if (boundedDamerauLevenshtein(q, wPrefix, 1) <= 1) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks whether a precomputed card search index matches all query tokens.
 */
export function matchesSearchTokens(
  searchIndex: string,
  tokens: string[],
  cardTitle?: string
): boolean {
  if (!tokens.length) return true;
  const hay = (searchIndex || '').toLowerCase();
  for (let i = 0; i < tokens.length; i++) {
    if (!matchesSingleToken(hay, tokens[i], cardTitle)) {
      return false;
    }
  }
  return true;
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
  if (!matchesSearchTokens(idx, tokens, card.title)) {
    return 0;
  }

  const rawTitle = card.title || '';
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
  const titleInitials = generateTitleInitialisms(rawTitle);
  const normBadge = stemSearchToken(normalizeSearchText(card.badge || ''));
  const normTopic = normalizeSearchText(card.topicTitle || '');
  const normQuery = normalizeSearchText(rawQuery || tokens.join(' '));

  const anchorTokens = tokens.filter((t) => !isGenericQueryTerm(t));
  const genericTokens = tokens.filter((t) => isGenericQueryTerm(t));

  let score = 10;

  // 1. Full query / phrase match in card.title (including parenthetical-stripped title)
  if (normQuery && normTitle) {
    const stemmedTitlePhrase = titleWords.join(' ');
    const stemmedNoParensPhrase = titleNoParensWords.join(' ');
    const stemmedQueryPhrase = tokens.map((t) => stemSearchToken(normalizeSearchText(t))).join(' ');

    if (
      normTitle === normQuery ||
      normTitleNoParens === normQuery ||
      stemmedTitlePhrase === stemmedQueryPhrase ||
      stemmedNoParensPhrase === stemmedQueryPhrase
    ) {
      score += 10000;
    } else if (
      normTitle.includes(normQuery) ||
      normTitleNoParens.includes(normQuery) ||
      stemmedTitlePhrase.includes(stemmedQueryPhrase) ||
      stemmedNoParensPhrase.includes(stemmedQueryPhrase)
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
    const substringInTitle = normTitle.includes(a) || (aStem.length >= 3 && normTitle.includes(aStem));
    const acronymInTitle = a.length >= 2 && a.length <= 5 && titleInitials.some((init) => init === a || init.startsWith(a));
    const synExpansion = DOMAIN_SYNONYM_MAP[a];
    const synInTitle = synExpansion
      ? synExpansion
          .split(/\s+/)
          .filter((sw) => !isGenericQueryTerm(sw))
          .every((sw) => normTitle.includes(sw))
      : false;

    if (exactWordInTitle) {
      score += 1500;
      anchorsInTitleCount++;
      if (wordIdxInTitle === 0) {
        score += 500;
      } else if (wordIdxInTitle === 1) {
        score += 250;
      }
    } else if (substringInTitle || acronymInTitle || synInTitle) {
      score += 1100;
      anchorsInTitleCount++;
    } else {
      // Check if fuzzy-matched in title (e.g., "formual" or "thevnin" in title)
      const fuzzyInTitle =
        a.length >= 6 &&
        titleWords.some(
          (tw) =>
            tw.charCodeAt(0) === a.charCodeAt(0) &&
            Math.abs(tw.length - a.length) <= 1 &&
            boundedDamerauLevenshtein(a, tw, 1) <= 1
        );
      if (fuzzyInTitle) {
        score += 900;
        anchorsInTitleCount++;
      } else if (normTopic.includes(a) || (aStem.length >= 3 && normTopic.includes(aStem))) {
        score += 250;
      } else if (idx.includes(a) || (aStem.length >= 3 && idx.includes(aStem))) {
        score += 60;
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

