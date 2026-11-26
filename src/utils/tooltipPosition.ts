export type TooltipTone = 'course' | 'neutral' | 'warn' | 'danger';
export type TooltipPlacement = 'bottom' | 'top';

export interface TooltipRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface TooltipPositionResult {
  left: number;
  top: number;
  placement: TooltipPlacement;
  arrowX: number;
}

const VALID_TONES: ReadonlySet<string> = new Set(['course', 'neutral', 'warn', 'danger']);

export function normalizeTooltipTone(raw: string | null | undefined): TooltipTone {
  if (raw && VALID_TONES.has(raw)) {
    return raw as TooltipTone;
  }
  return 'course';
}

export function computeTooltipPlacement(
  triggerRect: TooltipRect,
  tipWidth: number,
  tipHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  gap = 9,
  edgeMargin = 10
): TooltipPositionResult {
  const safeTipWidth = Math.max(0, tipWidth);
  const safeTipHeight = Math.max(0, tipHeight);
  const triggerCenterX = triggerRect.left + triggerRect.width / 2;

  const bottomTop = triggerRect.bottom + gap;
  const topCandidate = triggerRect.top - safeTipHeight - gap;

  let placement: TooltipPlacement = 'bottom';
  let top = bottomTop;

  const overflowsBottom = bottomTop + safeTipHeight > viewportHeight - edgeMargin;
  if (overflowsBottom && topCandidate >= edgeMargin) {
    placement = 'top';
    top = topCandidate;
  } else if (overflowsBottom && topCandidate > viewportHeight - bottomTop - safeTipHeight) {
    // Still prefer top if there is more vertical room above, clamped to viewport
    placement = 'top';
    top = Math.max(edgeMargin, topCandidate);
  } else {
    top = Math.max(edgeMargin, Math.min(viewportHeight - safeTipHeight - edgeMargin, bottomTop));
  }

  const maxLeft = Math.max(edgeMargin, viewportWidth - safeTipWidth - edgeMargin);
  const rawLeft = triggerCenterX - safeTipWidth / 2;
  const left = Math.max(edgeMargin, Math.min(maxLeft, rawLeft));

  const caretPad = Math.min(12, safeTipWidth / 2);
  const arrowX = Math.max(
    caretPad,
    Math.min(Math.max(caretPad, safeTipWidth - caretPad), triggerCenterX - left)
  );

  return {
    left: Math.round(left),
    top: Math.round(top),
    placement,
    arrowX: Math.round(arrowX),
  };
}
