import cardEmbeddingsData from '../data/card-embeddings.json';
import { getExtractor, isSemanticAvailable, markSemanticUnavailable } from './embeddingModel';
import {
  buildFormulaSearchIndex,
  isConversationalNoiseTerm,
  isGenericQueryTerm,
  matchesTheoremCategoryFilter,
  normalizeSearchText,
  scoreFormulaCardSearch,
  stemSearchToken,
  tokenizeSearchQuery,
  type FormulaCardRecord,
  type TheoremCategoryFilter,
} from './formulaSearch';

export interface CardEmbeddingEntry {
  hash: string;
  vector: number[];
}

export interface CardEmbeddingsFile {
  model: string;
  dim: number;
  generatedAt: string;
  cards: Record<string, CardEmbeddingEntry>;
}

const cardEmbeddings = cardEmbeddingsData as unknown as CardEmbeddingsFile;

/**
 * Per-anchor lexical confidence cutoff (1400):
 * In `scoreFormulaCardSearch` (including B-tree prefix/fuzzy bonuses), genuine keyword/title
 * queries score 2400–14600+ per anchor token, whereas vague descriptive queries score 0–1275.
 */
export const CONFIDENT_LEXICAL_THRESHOLD = 1400;

/**
 * Minimum cosine similarity for a card to be surfaced during semantic fallback ranking.
 */
export const MIN_SEMANTIC_SIMILARITY = 0.30;

export type SearchRankingMode = 'auto' | 'lexical' | 'semantic';

/**
 * Reads `?debug=lexical` or `?debug=semantic` from a URL search string.
 */
export function getSearchDebugMode(searchStr?: string): SearchRankingMode {
  const raw =
    searchStr !== undefined
      ? searchStr
      : typeof window !== 'undefined'
      ? window.location.search
      : '';
  if (!raw) return 'auto';
  try {
    const params = new URLSearchParams(raw);
    const dbg = (params.get('debug') || '').trim().toLowerCase();
    if (dbg === 'lexical') return 'lexical';
    if (dbg === 'semantic') return 'semantic';
  } catch {
    // Ignore malformed query string
  }
  return 'auto';
}

/**
 * Counts how many distinct non-generic, non-conversational anchor tokens exist in a query.
 */
export function countQueryAnchorTokens(tokens: string[]): number {
  if (!tokens.length) return 1;
  const anchors = tokens.filter(
    (t) => !isGenericQueryTerm(t) && !isConversationalNoiseTerm(t)
  );
  if (anchors.length > 0) return anchors.length;
  const nonGeneric = tokens.filter((t) => !isGenericQueryTerm(t));
  return Math.max(1, nonGeneric.length);
}

/**
 * Normalizes a raw additive `scoreFormulaCardSearch` score by the number of anchor tokens
 * so 1-word and 8-word queries share the same 0..4500 confidence scale.
 */
export function computeLexicalConfidence(
  bestRawLexicalScore: number,
  tokens: string[]
): number {
  if (bestRawLexicalScore <= 0) return 0;
  const anchorCount = countQueryAnchorTokens(tokens);
  return Math.round(bestRawLexicalScore / anchorCount);
}

// Vectors are pre-normalized to unit length, so the dot product IS the cosine similarity —
// no need for the full formula at query time.
export function dot(a: Float32Array | ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export async function embedQuery(query: string): Promise<Float32Array> {
  const extractor = await getExtractor();
  const output = await extractor(query, { pooling: 'mean', normalize: true });
  return Float32Array.from(output.data as ArrayLike<number>);
}

export async function rankBySemanticSimilarity(
  query: string
): Promise<Map<string, number>> {
  const trimmed = query.trim();
  if (!trimmed || !isSemanticAvailable()) {
    return new Map<string, number>();
  }
  if (!cardEmbeddings || !cardEmbeddings.cards || typeof cardEmbeddings.cards !== 'object') {
    markSemanticUnavailable('card-embeddings.json is missing or invalid');
    return new Map<string, number>();
  }
  try {
    const queryVec = await embedQuery(trimmed);
    const scores = new Map<string, number>();
    for (const [cardId, entry] of Object.entries(cardEmbeddings.cards)) {
      if (entry && Array.isArray(entry.vector)) {
        scores.set(cardId, dot(queryVec, entry.vector));
      }
    }
    return scores;
  } catch (err) {
    markSemanticUnavailable(err);
    return new Map<string, number>();
  }
}

/**
 * Determines whether semantic ranking should be active given the current debug mode,
 * the normalized lexical confidence score in the candidate set, and the resolved semanticScores map.
 */
export function shouldUseSemanticRanking(
  bestLexicalConfidence: number,
  semanticScores: Map<string, number> | null | undefined,
  mode: SearchRankingMode = 'auto'
): boolean {
  if (mode === 'lexical') return false;
  if (!semanticScores || semanticScores.size === 0) return false;
  if (mode === 'semantic') return true;
  return bestLexicalConfidence < CONFIDENT_LEXICAL_THRESHOLD;
}

/**
 * Computes the effective hybrid score for a single card when semantic ranking is active vs inactive.
 * - When `useSemantic` is false: returns `lexicalScore` unchanged.
 * - When `useSemantic` is true: converts cosine similarity (if >= MIN_SEMANTIC_SIMILARITY) to a
 *   positive integer score on a 0..1000 scale, with a soft tie-breaker bonus when query terms
 *   appear in the card's index or badge.
 */
export function computeHybridCardScore(
  cardId: string,
  lexicalScore: number,
  semanticScores: Map<string, number> | null | undefined,
  useSemantic: boolean,
  minSemanticSimilarity: number = MIN_SEMANTIC_SIMILARITY,
  searchIndex?: string,
  queryTokens?: string[]
): number {
  if (!useSemantic || !semanticScores) {
    return lexicalScore;
  }
  const sim = semanticScores.get(cardId) ?? -1;
  if (sim < minSemanticSimilarity) {
    return 0;
  }
  const semanticPoints = Math.round(sim * 1000);
  let tieBreaker = lexicalScore > 0 ? Math.min(50, Math.round(lexicalScore * 0.04)) : 0;

  // Soft partial-term overlap bonus when semantic similarity is already strong (sim >= 0.36)
  if (searchIndex && queryTokens && queryTokens.length > 1 && sim >= 0.36) {
    const idxLower = searchIndex.toLowerCase();
    let matchedContentTokens = 0;
    let totalContentTokens = 0;
    for (const rawTok of queryTokens) {
      if (isConversationalNoiseTerm(rawTok)) continue;
      totalContentTokens++;
      const norm = normalizeSearchText(rawTok);
      const stem = stemSearchToken(norm);
      if (
        (norm.length >= 2 && idxLower.includes(norm)) ||
        (stem.length >= 3 && idxLower.includes(stem))
      ) {
        matchedContentTokens++;
      }
    }
    if (totalContentTokens > 0) {
      tieBreaker += Math.round((matchedContentTokens / totalContentTokens) * 90);
    }
  }

  return semanticPoints + tieBreaker;
}

export interface HybridRankOptions {
  course?: string;
  thmFilter?: TheoremCategoryFilter;
  mode?: SearchRankingMode;
  precomputedIndexById?: Map<string, string>;
}

/**
 * Standalone hybrid (lexical + semantic) ranking pipeline over a pool of FormulaCardRecords.
 */
export async function rankCardsHybrid(
  cards: FormulaCardRecord[],
  query: string,
  options: HybridRankOptions = {}
): Promise<{
  modeUsed: 'lexical' | 'semantic';
  bestLexicalScore: number;
  bestLexicalConfidence: number;
  ranked: Array<{ card: FormulaCardRecord; score: number; lexicalScore: number; semanticSim: number }>;
}> {
  const course = options.course ?? 'ALL';
  const thmFilter = options.thmFilter ?? 'all';
  const mode = options.mode ?? 'auto';
  const tokens = tokenizeSearchQuery(query);

  const candidates: Array<{ card: FormulaCardRecord; lexicalScore: number; searchIndex: string }> = [];
  let bestLexicalScore = 0;

  for (const card of cards) {
    if (course !== 'ALL' && card.course !== course) continue;
    if (!matchesTheoremCategoryFilter(card.badge, thmFilter)) continue;
    const idx = options.precomputedIndexById?.get(card.id) ?? buildFormulaSearchIndex(card);
    const lexicalScore =
      tokens.length > 0 ? scoreFormulaCardSearch(card, tokens, query, idx) : 1;
    if (lexicalScore > bestLexicalScore) {
      bestLexicalScore = lexicalScore;
    }
    candidates.push({ card, lexicalScore, searchIndex: idx });
  }

  const bestLexicalConfidence = computeLexicalConfidence(bestLexicalScore, tokens);

  let semanticScores: Map<string, number> | null = null;
  if (
    mode !== 'lexical' &&
    (mode === 'semantic' || bestLexicalConfidence < CONFIDENT_LEXICAL_THRESHOLD)
  ) {
    semanticScores = await rankBySemanticSimilarity(query);
  }

  const useSemantic = shouldUseSemanticRanking(bestLexicalConfidence, semanticScores, mode);
  const ranked: Array<{
    card: FormulaCardRecord;
    score: number;
    lexicalScore: number;
    semanticSim: number;
  }> = [];

  for (const { card, lexicalScore, searchIndex } of candidates) {
    const semanticSim = semanticScores?.get(card.id) ?? 0;
    const score = computeHybridCardScore(
      card.id,
      lexicalScore,
      semanticScores,
      useSemantic,
      MIN_SEMANTIC_SIMILARITY,
      searchIndex,
      tokens
    );
    if (score > 0) {
      ranked.push({ card, score, lexicalScore, semanticSim });
    }
  }

  ranked.sort((a, b) => b.score - a.score);

  return {
    modeUsed: useSemantic ? 'semantic' : 'lexical',
    bestLexicalScore,
    bestLexicalConfidence,
    ranked,
  };
}
