import type React from 'react';

export interface TileGlowState {
  rafId: number | null;
  hovered: boolean;
  lastFrameMs: number;
  lastMoveMs: number;
  targetX: number;
  targetY: number;
  currX: number;
  currY: number;
  dwell: number; // 0..1 gradual stationary build-up
  presence: number; // 0..1 overall hover fade-in/fade-out
}

export interface TileGlowFrameResult {
  corePct: number;
  ambientPct: number;
  coreRadiusPx: number;
  diffuseRadiusPx: number;
  shouldStop: boolean;
  isSettled: boolean;
}

const tileGlowMap = new WeakMap<HTMLElement, TileGlowState>();

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getRelativePointerPct(
  el: HTMLElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 50, y: 50 };
  }
  const x = clampPct(((clientX - rect.left) / rect.width) * 100);
  const y = clampPct(((clientY - rect.top) / rect.height) * 100);
  return { x, y };
}

function getOrCreateTileState(el: HTMLElement): TileGlowState {
  let state = tileGlowMap.get(el);
  if (!state) {
    state = {
      rafId: null,
      hovered: false,
      lastFrameMs: 0,
      lastMoveMs: 0,
      targetX: 50,
      targetY: 50,
      currX: 50,
      currY: 50,
      dwell: 0,
      presence: 0,
    };
    tileGlowMap.set(el, state);
  }
  return state;
}

/**
 * Pure physics integrator for one animation frame of a dashboard tile glow.
 * Mutates `st` in place and returns the derived CSS property metrics and stop condition.
 */
export function advanceTileGlowPhysics(
  st: TileGlowState,
  nowMs: number
): TileGlowFrameResult {
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - st.lastFrameMs) / 1000));
  st.lastFrameMs = nowMs;

  // Weighted exponential damping (smooth inertia, never linear/snappy)
  const posAlpha = 1 - Math.exp(-6.2 * dt);
  st.currX += (st.targetX - st.currX) * posAlpha;
  st.currY += (st.targetY - st.currY) * posAlpha;

  const distPct = Math.hypot(st.targetX - st.currX, st.targetY - st.currY);
  const idleMs = nowMs - st.lastMoveMs;

  if (st.hovered) {
    st.presence = Math.min(1, st.presence + dt * 3.8);

    // Stationary or slow pointer: gradually diffuse and intensify up to max (1.0)
    if (idleMs > 110 || distPct < 1.2) {
      st.dwell = Math.min(1, st.dwell + dt * 0.42);
    } else if (distPct > 9) {
      // Fast motion gently relaxes dwell so stopping again creates a fresh bloom
      st.dwell = Math.max(0, st.dwell - dt * 1.15);
    }
  } else {
    st.presence = Math.max(0, st.presence - dt * 3.2);
    st.dwell = Math.max(0, st.dwell - dt * 1.6);
  }

  // Smooth ease-out curve for the stationary bloom
  const easedDwell = 1 - Math.pow(1 - st.dwell, 2.2);
  const corePct = Math.round((18 + easedDwell * 24) * st.presence); // 18% -> 42% color-mix
  const ambientPct = Math.round((8 + easedDwell * 16) * st.presence); // 8% -> 24% color-mix
  const coreRadiusPx = Math.round(135 + easedDwell * 155); // 135px -> 290px
  const diffuseRadiusPx = Math.round(240 + easedDwell * 260); // 240px -> 500px

  const isSettled = !st.hovered && st.presence <= 0.002 && st.dwell <= 0.002;
  const isHoverFullyIdle =
    st.hovered && st.presence >= 0.999 && st.dwell >= 0.999 && distPct < 0.08;

  return {
    corePct,
    ambientPct,
    coreRadiusPx,
    diffuseRadiusPx,
    shouldStop: isSettled || isHoverFullyIdle,
    isSettled,
  };
}

function stepTileGlow(el: HTMLElement, nowMs: number) {
  const st = tileGlowMap.get(el);
  if (!st) return;

  const { corePct, ambientPct, coreRadiusPx, diffuseRadiusPx, shouldStop, isSettled } =
    advanceTileGlowPhysics(st, nowMs);

  el.style.setProperty('--tile-mx', `${st.currX.toFixed(2)}%`);
  el.style.setProperty('--tile-my', `${st.currY.toFixed(2)}%`);
  el.style.setProperty('--tile-core-alpha', `${corePct}%`);
  el.style.setProperty('--tile-ambient-alpha', `${ambientPct}%`);
  el.style.setProperty('--tile-core-r', `${coreRadiusPx}px`);
  el.style.setProperty('--tile-diffuse-r', `${diffuseRadiusPx}px`);
  el.style.setProperty('--tile-glow-op', st.presence.toFixed(3));

  if (shouldStop) {
    st.rafId = null;
    if (isSettled) {
      el.style.setProperty('--tile-glow-op', '0');
    }
    return;
  }

  st.rafId = window.requestAnimationFrame((t) => stepTileGlow(el, t));
}

function startTileLoop(el: HTMLElement, st: TileGlowState) {
  if (st.rafId === null) {
    st.lastFrameMs = performance.now();
    st.rafId = window.requestAnimationFrame((t) => stepTileGlow(el, t));
  }
}

export function handleDeckTileEnter(e: React.MouseEvent<HTMLElement>): void {
  const el = e.currentTarget;
  const st = getOrCreateTileState(el);
  const { x, y } = getRelativePointerPct(el, e.clientX, e.clientY);

  if (prefersReducedMotion()) {
    st.hovered = true;
    el.style.setProperty('--tile-mx', `${x.toFixed(2)}%`);
    el.style.setProperty('--tile-my', `${y.toFixed(2)}%`);
    el.style.setProperty('--tile-core-alpha', '22%');
    el.style.setProperty('--tile-ambient-alpha', '10%');
    el.style.setProperty('--tile-core-r', '180px');
    el.style.setProperty('--tile-diffuse-r', '310px');
    el.style.setProperty('--tile-glow-op', '1');
    return;
  }

  st.targetX = x;
  st.targetY = y;
  if (st.presence < 0.05) {
    st.currX = x;
    st.currY = y;
  }
  st.hovered = true;
  st.lastMoveMs = performance.now();
  startTileLoop(el, st);
}

export function handleDeckTileMove(e: React.MouseEvent<HTMLElement>): void {
  const el = e.currentTarget;
  const st = getOrCreateTileState(el);
  const { x, y } = getRelativePointerPct(el, e.clientX, e.clientY);

  if (prefersReducedMotion()) {
    el.style.setProperty('--tile-mx', `${x.toFixed(2)}%`);
    el.style.setProperty('--tile-my', `${y.toFixed(2)}%`);
    return;
  }

  st.targetX = x;
  st.targetY = y;
  st.hovered = true;
  st.lastMoveMs = performance.now();
  startTileLoop(el, st);
}

export function handleDeckTileLeave(e: React.MouseEvent<HTMLElement>): void {
  const el = e.currentTarget;
  const st = getOrCreateTileState(el);

  if (prefersReducedMotion()) {
    st.hovered = false;
    el.style.setProperty('--tile-glow-op', '0');
    return;
  }

  st.hovered = false;
  startTileLoop(el, st);
}
