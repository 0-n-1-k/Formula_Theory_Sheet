export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type TourDockPosition = 'bottom' | 'top';

/**
 * Builds an SVG even-odd path string covering the full viewport with an optional
 * rounded-rectangle cutout for the spotlighted target. Uses a single vector path
 * with zero offscreen mask allocation for smooth 60fps compositing.
 */
export function buildSpotlightCutoutPath(
  vw: number,
  vh: number,
  rect: SpotlightRect | null,
  radius = 12
): string {
  const safeVw = Math.max(1, Math.round(vw));
  const safeVh = Math.max(1, Math.round(vh));
  const outer = `M0 0 H${safeVw} V${safeVh} H0 Z`;

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return outer;
  }

  const x = Math.max(0, Math.min(safeVw, rect.left));
  const y = Math.max(0, Math.min(safeVh, rect.top));
  const w = Math.max(0, Math.min(safeVw - x, rect.width));
  const h = Math.max(0, Math.min(safeVh - y, rect.height));
  if (w < 2 || h < 2) return outer;

  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const x2 = x + w;
  const y2 = y + h;

  // Inner rounded rectangle (even-odd winding punches out the highlighted area)
  const inner = [
    `M${(x + r).toFixed(2)} ${y.toFixed(2)}`,
    `H${(x2 - r).toFixed(2)}`,
    `A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${(y + r).toFixed(2)}`,
    `V${(y2 - r).toFixed(2)}`,
    `A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x2 - r).toFixed(2)} ${y2.toFixed(2)}`,
    `H${(x + r).toFixed(2)}`,
    `A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x.toFixed(2)} ${(y2 - r).toFixed(2)}`,
    `V${(y + r).toFixed(2)}`,
    `A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x + r).toFixed(2)} ${y.toFixed(2)}`,
    'Z',
  ].join(' ');

  return `${outer} ${inner}`;
}

/**
 * Exponentially interpolates between two SpotlightRects for smooth 60fps transitions.
 */
export function interpolateSpotlightRect(
  current: SpotlightRect,
  target: SpotlightRect,
  alpha: number
): SpotlightRect {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return {
    top: current.top + (target.top - current.top) * clampedAlpha,
    left: current.left + (target.left - current.left) * clampedAlpha,
    width: current.width + (target.width - current.width) * clampedAlpha,
    height: current.height + (target.height - current.height) * clampedAlpha,
  };
}

/**
 * Returns true when current rect is within `epsilon` pixels of target on all axes.
 */
export function isSpotlightSettled(
  current: SpotlightRect,
  target: SpotlightRect,
  epsilon = 0.35
): boolean {
  return (
    Math.abs(current.top - target.top) <= epsilon &&
    Math.abs(current.left - target.left) <= epsilon &&
    Math.abs(current.width - target.width) <= epsilon &&
    Math.abs(current.height - target.height) <= epsilon
  );
}

/**
 * Chooses whether the inline-docked tour bar sits at the bottom (default, thumb-friendly
 * and keeps top chrome clear) or flips to the top safe zone if the highlighted element
 * sits behind the bottom dock region.
 */
export function chooseTourDockPosition(
  targetRect: SpotlightRect | null,
  dockHeight: number,
  viewportHeight: number,
  topSafeOffset = 72
): TourDockPosition {
  if (!targetRect) return 'bottom';
  const dockMargin = 20;
  const bottomDockTop = viewportHeight - dockHeight - dockMargin;
  const targetBottom = targetRect.top + targetRect.height;

  // Overlap with bottom dock?
  const overlapsBottom = targetBottom > bottomDockTop - 8;
  if (!overlapsBottom) {
    return 'bottom';
  }

  // Only flip to top if the target doesn't also occupy the top dock region
  const topDockBottom = topSafeOffset + dockHeight + 12;
  const overlapsTop = targetRect.top < topDockBottom;
  if (!overlapsTop) {
    return 'top';
  }

  // If a very tall element spans both, keep docked at bottom for consistent button placement
  return 'bottom';
}
