import type { TopicSectionRecord } from './contentParser';

export interface ContextMenuPosition {
  left: number;
  top: number;
  originX: 'left' | 'right';
  originY: 'top' | 'bottom';
}

export interface TopicMenuStats {
  totalCount: number;
  learnedCount: number;
  unlearnedCount: number;
  starredCount: number;
  unstarredCount: number;
  isReferenceOnly: boolean;
}

const VIEWPORT_PADDING = 10;
const CURSOR_OFFSET = 4;

/**
 * Computes viewport-clamped floating menu coordinates from a cursor/touch anchor.
 * Prefers opening down-right, flips horizontally/vertically when near viewport edges,
 * and guarantees the menu remains fully inside the viewport.
 */
export function computeContextMenuPosition(
  anchorX: number,
  anchorY: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number
): ContextMenuPosition {
  const safeW = Math.max(0, menuWidth);
  const safeH = Math.max(0, menuHeight);
  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - safeW - VIEWPORT_PADDING);
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - safeH - VIEWPORT_PADDING);

  let left = anchorX + CURSOR_OFFSET;
  let originX: 'left' | 'right' = 'left';
  if (left + safeW > viewportWidth - VIEWPORT_PADDING) {
    const flippedLeft = anchorX - safeW - CURSOR_OFFSET;
    if (flippedLeft >= VIEWPORT_PADDING) {
      left = flippedLeft;
      originX = 'right';
    } else {
      left = maxLeft;
      originX = 'right';
    }
  }

  let top = anchorY + CURSOR_OFFSET;
  let originY: 'top' | 'bottom' = 'top';
  if (top + safeH > viewportHeight - VIEWPORT_PADDING) {
    const flippedTop = anchorY - safeH - CURSOR_OFFSET;
    if (flippedTop >= VIEWPORT_PADDING) {
      top = flippedTop;
      originY = 'bottom';
    } else {
      top = maxTop;
      originY = 'bottom';
    }
  }

  return {
    left: Math.round(Math.max(VIEWPORT_PADDING, Math.min(maxLeft, left))),
    top: Math.round(Math.max(VIEWPORT_PADDING, Math.min(maxTop, top))),
    originX,
    originY,
  };
}

/**
 * Computes live progress and starred counters for a topic section.
 */
export function computeTopicMenuStats(
  section: TopicSectionRecord,
  learnedMap: Readonly<Record<string, boolean>>,
  starredMap: Readonly<Record<string, boolean>>
): TopicMenuStats {
  const isReferenceOnly = section.course === 'GEN';
  const totalCount = section.cards.length;
  let learnedCount = 0;
  let starredCount = 0;

  for (const card of section.cards) {
    if (!isReferenceOnly && learnedMap[card.id]) {
      learnedCount += 1;
    }
    if (starredMap[card.id]) {
      starredCount += 1;
    }
  }

  return {
    totalCount,
    learnedCount,
    unlearnedCount: isReferenceOnly ? 0 : Math.max(0, totalCount - learnedCount),
    starredCount,
    unstarredCount: Math.max(0, totalCount - starredCount),
    isReferenceOnly,
  };
}

function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Formats all cards in a topic section into a clean, readable plain-text / LaTeX bundle
 * for clipboard export via "Copy all formulas".
 */
export function formatTopicFormulasForCopy(
  section: TopicSectionRecord,
  courseBadge?: string
): { text: string; count: number } {
  const headerBadge = courseBadge || section.course;
  const lines: string[] = [`[${headerBadge}] ${section.title}`];

  let exportedCount = 0;
  section.cards.forEach((card, index) => {
    const cleanTitle = stripHtmlTags(card.title || `Card ${index + 1}`);
    const bodyParts: string[] = [];

    if (card.rawLatex && card.rawLatex.trim()) {
      bodyParts.push(card.rawLatex.trim());
    }
    if (card.codeContent && card.codeContent.trim()) {
      bodyParts.push(card.codeContent.trim());
    }
    if (bodyParts.length === 0 && card.htmlContent && card.htmlContent.trim()) {
      const stripped = stripHtmlTags(card.htmlContent);
      if (stripped) bodyParts.push(stripped);
    }
    if (bodyParts.length === 0 && card.bodyText && card.bodyText.trim()) {
      const stripped = stripHtmlTags(card.bodyText);
      if (stripped) bodyParts.push(stripped);
    }

    if (bodyParts.length === 0) return;
    exportedCount += 1;
    lines.push('');
    lines.push(`${exportedCount}. ${cleanTitle}`);
    lines.push(bodyParts.join('\n'));
  });

  return {
    text: lines.join('\n'),
    count: exportedCount,
  };
}

/**
 * Builds a direct shareable topic hash URL (`https://host/path#topic-id`).
 */
export function buildTopicDeepLinkUrl(
  topicId: string,
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
  const cleanId = topicId.replace(/^#/, '');
  return `${cleanOrigin}${cleanPath}#${encodeURIComponent(cleanId)}`;
}
