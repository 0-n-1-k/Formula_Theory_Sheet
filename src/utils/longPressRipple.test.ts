import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONG_PRESS_DURATION_MS,
  LONG_PRESS_VISUAL_DELAY_MS,
  computeLongPressRippleGeometry,
  computeLongPressProgress,
  shouldAllowLongPressForPointer,
  shouldCancelLongPressOnMove,
} from './longPressRipple';

test('computeLongPressRippleGeometry clamps local coordinates and computes bounded radius', () => {
  const rect = { left: 100, top: 200, width: 360, height: 52 };
  const inside = computeLongPressRippleGeometry(180, 226, rect);
  assert.equal(inside.localX, 80);
  assert.equal(inside.localY, 26);
  assert.ok(inside.maxRadius >= 96 && inside.maxRadius <= 260);

  const outside = computeLongPressRippleGeometry(20, 500, rect);
  assert.equal(outside.localX, 0);
  assert.equal(outside.localY, 52);
});

test('computeLongPressProgress stays visually inactive during initial tap delay and eases smoothly to 1', () => {
  assert.ok(LONG_PRESS_DURATION_MS >= 650, 'long-press duration should be comfortably above 600ms');

  const beforeDelay = computeLongPressProgress(40, LONG_PRESS_DURATION_MS, LONG_PRESS_VISUAL_DELAY_MS);
  assert.equal(beforeDelay.isVisuallyActive, false);
  assert.equal(beforeDelay.visualProgress, 0);
  assert.equal(beforeDelay.easedProgress, 0);
  assert.equal(beforeDelay.isComplete, false);

  const earlyHold = computeLongPressProgress(200, LONG_PRESS_DURATION_MS, LONG_PRESS_VISUAL_DELAY_MS);
  assert.equal(earlyHold.isVisuallyActive, true);
  assert.ok(earlyHold.easedProgress < earlyHold.visualProgress, 'ease-in-out should start gently without an abrupt jump');
  assert.equal(earlyHold.shouldTriggerMidHaptic, false);

  const midHold = computeLongPressProgress(420, LONG_PRESS_DURATION_MS, LONG_PRESS_VISUAL_DELAY_MS);
  assert.equal(midHold.isVisuallyActive, true);
  assert.ok(midHold.visualProgress > 0.5 && midHold.visualProgress < 0.65);
  assert.ok(midHold.easedProgress > 0.5 && midHold.easedProgress < 0.72);
  assert.equal(midHold.shouldTriggerMidHaptic, true);
  assert.equal(midHold.isComplete, false);

  const complete = computeLongPressProgress(LONG_PRESS_DURATION_MS, LONG_PRESS_DURATION_MS, LONG_PRESS_VISUAL_DELAY_MS);
  assert.equal(complete.rawProgress, 1);
  assert.equal(complete.visualProgress, 1);
  assert.equal(complete.easedProgress, 1);
  assert.equal(complete.isComplete, true);
  assert.equal(complete.isVisuallyActive, false);
});

test('shouldAllowLongPressForPointer disables mouse pointers and allows primary touch or pen', () => {
  assert.equal(shouldAllowLongPressForPointer('mouse', 0, true), false);
  assert.equal(shouldAllowLongPressForPointer('mouse', 2, true), false);
  assert.equal(shouldAllowLongPressForPointer('', 0, true), false);
  assert.equal(shouldAllowLongPressForPointer('touch', 0, true), true);
  assert.equal(shouldAllowLongPressForPointer('pen', 0, true), true);
  assert.equal(shouldAllowLongPressForPointer('touch', 0, false), false);
  assert.equal(shouldAllowLongPressForPointer('touch', 2, true), false);
});

test('shouldCancelLongPressOnMove detects movement beyond threshold', () => {
  assert.equal(shouldCancelLongPressOnMove(100, 100, 105, 106, 10), false);
  assert.equal(shouldCancelLongPressOnMove(100, 100, 108, 108, 10), true);
});
