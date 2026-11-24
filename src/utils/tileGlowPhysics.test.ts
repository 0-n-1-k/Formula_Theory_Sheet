import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceTileGlowPhysics, type TileGlowState } from './tileGlowPhysics.ts';

function makeState(overrides: Partial<TileGlowState> = {}): TileGlowState {
  return {
    rafId: null,
    hovered: true,
    lastFrameMs: 0,
    lastMoveMs: 0,
    targetX: 40,
    targetY: 50,
    currX: 40,
    currY: 50,
    dwell: 0,
    presence: 0,
    ...overrides,
  };
}

test('advanceTileGlowPhysics increases dwell intensity and radius while stationary, then settles at idle max', () => {
  const st = makeState({ hovered: true, targetX: 35, targetY: 45, currX: 35, currY: 45 });

  let lastCore = 0;
  let lastRadius = 0;
  let stopped = false;

  for (let t = 16; t <= 4000; t += 16) {
    const res = advanceTileGlowPhysics(st, t);
    assert.ok(res.corePct >= lastCore, 'core alpha should build monotonically during stationary dwell');
    assert.ok(res.coreRadiusPx >= lastRadius, 'core radius should expand monotonically during stationary dwell');
    lastCore = res.corePct;
    lastRadius = res.coreRadiusPx;
    if (res.shouldStop) {
      stopped = true;
      break;
    }
  }

  assert.equal(stopped, true, 'Loop must stop automatically once presence & dwell hit steady max');
  assert.equal(lastCore, 42);
  assert.equal(lastRadius, 290);
});

test('advanceTileGlowPhysics decays smoothly to settled rest and stops rAF after mouseleave', () => {
  const st = makeState({
    hovered: false,
    presence: 1,
    dwell: 1,
    lastFrameMs: 0,
    lastMoveMs: 0,
  });

  let settled = false;
  for (let t = 16; t <= 2000; t += 16) {
    const res = advanceTileGlowPhysics(st, t);
    if (res.shouldStop) {
      settled = res.isSettled;
      break;
    }
  }

  assert.equal(settled, true, 'Loop must settle and stop cleanly after mouseleave');
  assert.ok(st.presence <= 0.002);
  assert.ok(st.dwell <= 0.002);
});
