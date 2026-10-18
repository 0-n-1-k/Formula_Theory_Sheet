export interface FormulaCardRecord {
  id: string;
  course: string;
  topicId: string;
  topicTitle: string;
  title: string;
  keywords: string;
  rawLatex: string;
  bodyText: string;
  useText?: string;
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
}

export interface TopicFilterSummary {
  topicId: string;
  course: string;
  visibleCount: number;
  totalCount: number;
  learnedCount: number;
  hidden: boolean;
  visibleCardIds: string[];
}

export interface SearchFilterResult {
  tokens: string[];
  visibleCards: number;
  totalCardsInActiveRoot: number;
  totalCardsInScope: number;
  visibleTopics: number;
  topics: TopicFilterSummary[];
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

/**
 * Builds a normalized, lowercased search index string for a single formula card.
 */
export function buildFormulaSearchIndex(card: {
  keywords?: string;
  title?: string;
  topicTitle?: string;
  course?: string;
  rawLatex?: string;
  bodyText?: string;
}): string {
  const parts = [
    card.keywords || '',
    card.title || '',
    card.topicTitle || '',
    card.course || '',
    normalizeLatexForSearch(card.rawLatex || ''),
    card.bodyText || '',
  ];
  return parts
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenizes a user search query into lowercased non-empty search terms.
 */
export function tokenizeSearchQuery(query: string): string[] {
  if (!query) return [];
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Checks whether a precomputed card search index matches all query tokens.
 */
export function matchesSearchTokens(searchIndex: string, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const hay = (searchIndex || '').toLowerCase();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const cleanToken = token.replace(/^\\+/, '');
    if (hay.indexOf(token) === -1 && (!cleanToken || hay.indexOf(cleanToken) === -1)) {
      return false;
    }
  }
  return true;
}

/**
 * Dynamically filters a collection of formula cards grouped by topic in real-time.
 */
export function filterFormulaCards(
  cards: FormulaCardRecord[],
  state: FilterState
): SearchFilterResult {
  const tokens = tokenizeSearchQuery(state.query);
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

  for (const topicId of topicOrder) {
    const group = topicMap.get(topicId)!;
    const courseMatch = state.course === 'ALL' || group.course === state.course;
    let secLearned = 0;
    let secVisible = 0;
    const visibleCardIds: string[] = [];

    for (const card of group.cards) {
      totalCardsInActiveRoot++;
      if (courseMatch) totalCardsInScope++;
      if (card.isLearned) secLearned++;

      let statusMatch = true;
      if (state.status === 'starred') statusMatch = !!card.isStarred;
      else if (state.status === 'unlearned') statusMatch = !card.isLearned;

      const idx = buildFormulaSearchIndex(card);
      const queryMatch = matchesSearchTokens(idx, tokens);

      const showCard = courseMatch && statusMatch && queryMatch;
      if (showCard) {
        secVisible++;
        visibleCards++;
        visibleCardIds.push(card.id);
      }
    }

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
    });
  }

  return {
    tokens,
    visibleCards,
    totalCardsInActiveRoot,
    totalCardsInScope,
    visibleTopics,
    topics,
  };
}
