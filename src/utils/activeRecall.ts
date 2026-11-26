export const FLASHCARD_REQUEUE_OFFSET = 2;
export const GITHUB_REPO_ISSUES_URL =
  'https://github.com/0-n-1-k/Formula_Theory_Sheet/issues/new';

export interface FlashcardQueueState {
  queue: string[];
  history: string[];
  reviewedCount: number;
  gotItCount: number;
  requeuedIds: Record<string, number>;
}

/**
 * Creates a deterministic or shuffled active-recall queue from candidate card IDs.
 * Cards that are not yet learned are prioritized before already-learned cards when mixed.
 */
export function createFlashcardQueue(
  candidateIds: readonly string[],
  options?: {
    currentCardId?: string | null;
    rng?: () => number;
  }
): FlashcardQueueState {
  const unique = Array.from(new Set(candidateIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  const rng = options?.rng ?? Math.random;
  const shuffled = [...unique];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }
  if (
    options?.currentCardId &&
    shuffled.length > 1 &&
    shuffled[0] === options.currentCardId
  ) {
    const first = shuffled.shift()!;
    shuffled.push(first);
  }
  return {
    queue: shuffled,
    history: [],
    reviewedCount: 0,
    gotItCount: 0,
    requeuedIds: {},
  };
}

/**
 * Advances the active-recall queue based on self-grade:
 * - 'review': keeps the card in the deck and re-inserts it `requeueOffset` slots ahead so it returns soon.
 * - 'got-it': removes the card from the active deck so the student progresses toward 0 remaining.
 */
export function gradeFlashcardQueue(
  state: FlashcardQueueState,
  grade: 'review' | 'got-it',
  requeueOffset: number = FLASHCARD_REQUEUE_OFFSET
): {
  nextState: FlashcardQueueState;
  gradedCardId: string | null;
  nextCardId: string | null;
} {
  if (state.queue.length === 0) {
    return { nextState: state, gradedCardId: null, nextCardId: null };
  }
  const [current, ...rest] = state.queue;
  const nextHistory = [...state.history, current].slice(-50);
  if (grade === 'review') {
    const safeOffset = Math.max(1, Math.min(rest.length, requeueOffset));
    const nextQueue = [...rest];
    nextQueue.splice(safeOffset, 0, current);
    const nextRequeued = {
      ...state.requeuedIds,
      [current]: (state.requeuedIds[current] ?? 0) + 1,
    };
    return {
      nextState: {
        queue: nextQueue,
        history: nextHistory,
        reviewedCount: state.reviewedCount + 1,
        gotItCount: state.gotItCount,
        requeuedIds: nextRequeued,
      },
      gradedCardId: current,
      nextCardId: nextQueue[0] ?? null,
    };
  }

  return {
    nextState: {
      queue: rest,
      history: nextHistory,
      reviewedCount: state.reviewedCount + 1,
      gotItCount: state.gotItCount + 1,
      requeuedIds: state.requeuedIds,
    },
    gradedCardId: current,
    nextCardId: rest[0] ?? null,
  };
}

/**
 * Moves the current card to the back of the queue while recording it in history so Prev can return to it.
 */
export function skipFlashcardQueue(state: FlashcardQueueState): {
  nextState: FlashcardQueueState;
  nextCardId: string | null;
} {
  if (state.queue.length <= 1) {
    return { nextState: state, nextCardId: state.queue[0] ?? null };
  }
  const [current, ...rest] = state.queue;
  const rotated = [...rest, current];
  return {
    nextState: {
      ...state,
      queue: rotated,
      history: [...state.history, current].slice(-50),
    },
    nextCardId: rotated[0] ?? null,
  };
}

/**
 * Steps back to the previously viewed flashcard in the current session, placing it at the front of the queue.
 */
export function stepBackFlashcardQueue(state: FlashcardQueueState): {
  nextState: FlashcardQueueState;
  prevCardId: string | null;
} {
  if (state.history.length === 0) {
    return { nextState: state, prevCardId: null };
  }
  const nextHistory = state.history.slice(0, -1);
  const prevCardId = state.history[state.history.length - 1];
  const dedupedRest = state.queue.filter((id) => id !== prevCardId);
  return {
    nextState: {
      ...state,
      queue: [prevCardId, ...dedupedRest],
      history: nextHistory,
    },
    prevCardId,
  };
}

export interface CardDeepLinkRef {
  id: string;
  topicId: string;
  course: string;
  sourceTab: 'fm' | 'thm' | 'gen';
}

export type ResolvedCardDeepLink =
  | { found: true; id: string; topicId: string; course: string; sourceTab: 'fm' | 'thm' | 'gen' }
  | { found: false; rawId: string };

export function parseCardDeepLink(searchStr: string): string | null {
  if (typeof searchStr !== 'string' || !searchStr.trim()) return null;
  try {
    const params = new URLSearchParams(searchStr);
    const cardId = (params.get('card') || '').trim();
    return cardId.length > 0 ? cardId : null;
  } catch {
    return null;
  }
}

export function resolveCardDeepLink(
  searchStr: string,
  cards: ReadonlyArray<CardDeepLinkRef>
): ResolvedCardDeepLink | null {
  const rawId = parseCardDeepLink(searchStr);
  if (!rawId) return null;

  const exact = cards.find((c) => c.id === rawId);
  if (exact) {
    return {
      found: true,
      id: exact.id,
      topicId: exact.topicId,
      course: exact.course,
      sourceTab: exact.sourceTab,
    };
  }

  const lower = rawId.toLowerCase();
  const ci = cards.find((c) => c.id.toLowerCase() === lower);
  if (ci) {
    return {
      found: true,
      id: ci.id,
      topicId: ci.topicId,
      course: ci.course,
      sourceTab: ci.sourceTab,
    };
  }

  return { found: false, rawId };
}

export function buildCardDeepLinkUrl(
  cardId: string,
  origin?: string,
  pathname = '/'
): string {
  const baseOrigin =
    origin !== undefined
      ? origin
      : typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://formula-theory-sheet.vercel.app';
  const cleanOrigin = baseOrigin.replace(/\/+$/, '');
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const params = new URLSearchParams();
  params.set('card', cardId);
  return `${cleanOrigin}${cleanPath}?${params.toString()}`;
}

export interface ReportTypoInput {
  cardId?: string;
  course?: string;
  topicTitle?: string;
  cardTitle?: string;
}

export function buildReportTypoUrl(input: ReportTypoInput = {}): string {
  const params = new URLSearchParams();
  const cleanTitle = (input.cardTitle || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const shortTitle = cleanTitle.length > 72 ? `${cleanTitle.slice(0, 69)}...` : cleanTitle;

  if (input.cardId) {
    const coursePrefix = input.course ? `[${input.course}] ` : '';
    params.set(
      'title',
      `Typo / Correction: ${coursePrefix}${shortTitle || input.cardId} (${input.cardId})`
    );
    params.set('labels', 'bug,content');
    params.set(
      'body',
      [
        '### Card Reference',
        `- **Card ID (\`data-k\`)**: \`${input.cardId}\``,
        input.course ? `- **Course**: ${input.course}` : null,
        input.topicTitle ? `- **Topic**: ${input.topicTitle}` : null,
        cleanTitle ? `- **Title**: ${cleanTitle}` : null,
        '',
        '### What needs fixing?',
        '<!-- Describe the typo, sign error, missing condition, or LaTeX issue -->',
        '',
        '### Suggested Correction',
        '<!-- Paste the corrected formula or text if known -->',
      ]
        .filter((line): line is string => line !== null)
        .join('\n')
    );
  } else {
    params.set('title', 'Typo / Content Correction');
    params.set('labels', 'bug,content');
    params.set(
      'body',
      [
        '### Location',
        '- **Course / Topic / Card ID**: ',
        '',
        '### What needs fixing?',
        '<!-- Describe the typo, sign error, or LaTeX issue -->',
      ].join('\n')
    );
  }

  return `${GITHUB_REPO_ISSUES_URL}?${params.toString()}`;
}

export interface NetworkConnectionLike {
  saveData?: boolean;
  effectiveType?: string;
}

const SLOW_CONNECTION_TYPES = new Set(['slow-2g', '2g', '3g']);

export function getNavigatorConnection(): NetworkConnectionLike | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as unknown as {
    connection?: NetworkConnectionLike;
    mozConnection?: NetworkConnectionLike;
    webkitConnection?: NetworkConnectionLike;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection || null;
}

/**
 * Returns false when Data Saver (`saveData`) is enabled or the device is on a slow
 * cellular link (`slow-2g`, `2g`, `3g`) so we avoid silently pulling the 27 MB WASM bundle.
 */
export function shouldAutoWarmupSemanticModel(
  connection: NetworkConnectionLike | null | undefined = getNavigatorConnection()
): boolean {
  if (!connection) return true;
  if (connection.saveData === true) return false;
  if (
    typeof connection.effectiveType === 'string' &&
    SLOW_CONNECTION_TYPES.has(connection.effectiveType.toLowerCase())
  ) {
    return false;
  }
  return true;
}

export function getConstrainedConnectionReason(
  connection: NetworkConnectionLike | null | undefined = getNavigatorConnection()
): string | null {
  if (!connection) return null;
  if (connection.saveData === true) {
    return 'DATA SAVER ACTIVE — SKIPPING 27 MB AI MODEL';
  }
  if (
    typeof connection.effectiveType === 'string' &&
    SLOW_CONNECTION_TYPES.has(connection.effectiveType.toLowerCase())
  ) {
    return `${connection.effectiveType.toUpperCase()} CONNECTION — SKIPPING 27 MB AI MODEL`;
  }
  return null;
}
