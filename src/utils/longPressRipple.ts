export const LONG_PRESS_DURATION_MS = 680;
export const LONG_PRESS_VISUAL_DELAY_MS = 90;
export const LONG_PRESS_MOVE_THRESHOLD_PX = 10;
export const LONG_PRESS_MID_HAPTIC_PROGRESS = 0.55;
export const LONG_PRESS_COMPLETE_FADE_MS = 440;

export interface LongPressRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface LongPressRippleGeometry {
  localX: number;
  localY: number;
  maxRadius: number;
}

export interface LongPressProgressState {
  rawProgress: number;
  visualProgress: number;
  easedProgress: number;
  isVisuallyActive: boolean;
  isComplete: boolean;
  shouldTriggerMidHaptic: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Allows long-press only for touch or pen pointers; disables it when a mouse pointer is detected.
 */
export function shouldAllowLongPressForPointer(
  pointerType: string | undefined | null,
  button: number = 0,
  isPrimary: boolean = true
): boolean {
  if (!isPrimary) return false;
  if (button !== 0 && button !== -1) return false;
  const normalized = (pointerType || '').toLowerCase();
  return normalized === 'touch' || normalized === 'pen';
}

/**
 * Computes the local ripple origin (clamped to the summary bounds)
 * and the distance to the farthest corner so the ripple scales smoothly.
 */
export function computeLongPressRippleGeometry(
  clientX: number,
  clientY: number,
  rect: LongPressRect
): LongPressRippleGeometry {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const localX = clamp(clientX - rect.left, 0, width);
  const localY = clamp(clientY - rect.top, 0, height);

  const distLeft = localX;
  const distRight = width - localX;
  const distTop = localY;
  const distBottom = height - localY;

  const farX = Math.max(distLeft, distRight);
  const farY = Math.max(distTop, distBottom);
  const cornerDistance = Math.hypot(farX, farY);
  // Cap the visual ripple radius so wide headers get a focused instrument wave
  // while mobile headers still get full thumb-halo coverage.
  const maxRadius = clamp(cornerDistance * 0.65, 96, 260);

  return {
    localX: Math.round(localX * 10) / 10,
    localY: Math.round(localY * 10) / 10,
    maxRadius: Math.round(maxRadius * 10) / 10,
  };
}

/**
 * Computes the normalized and eased long-press progress values for a given elapsed time.
 */
export function computeLongPressProgress(
  elapsedMs: number,
  durationMs: number = LONG_PRESS_DURATION_MS,
  delayMs: number = LONG_PRESS_VISUAL_DELAY_MS
): LongPressProgressState {
  const safeDuration = Math.max(1, durationMs);
  const safeDelay = clamp(delayMs, 0, safeDuration - 1);
  const safeElapsed = Math.max(0, elapsedMs);

  const rawProgress = clamp(safeElapsed / safeDuration, 0, 1);
  const isComplete = safeElapsed >= safeDuration;
  const isVisuallyActive = safeElapsed >= safeDelay && !isComplete;

  const activeWindow = safeDuration - safeDelay;
  const visualProgress =
    safeElapsed < safeDelay
      ? 0
      : clamp((safeElapsed - safeDelay) / activeWindow, 0, 1);

  // Smooth sine ease-in-out curve for gradual, fluid radial wave bloom without an abrupt initial jump
  const easedProgress =
    visualProgress <= 0
      ? 0
      : visualProgress >= 1
      ? 1
      : 0.5 - 0.5 * Math.cos(Math.PI * visualProgress);

  return {
    rawProgress,
    visualProgress,
    easedProgress,
    isVisuallyActive,
    isComplete,
    shouldTriggerMidHaptic:
      rawProgress >= LONG_PRESS_MID_HAPTIC_PROGRESS && !isComplete,
  };
}

/**
 * Returns true if the pointer/finger moved far enough from the initial press point
 * to cancel the long-press interaction (e.g. user is scrolling).
 */
export function shouldCancelLongPressOnMove(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  thresholdPx: number = LONG_PRESS_MOVE_THRESHOLD_PX
): boolean {
  const dx = currentX - startX;
  const dy = currentY - startY;
  return Math.hypot(dx, dy) > thresholdPx;
}
