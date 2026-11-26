import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTooltipPlacement, normalizeTooltipTone } from './tooltipPosition';

test('normalizeTooltipTone defaults to course and validates allowed tones', () => {
  assert.equal(normalizeTooltipTone(null), 'course');
  assert.equal(normalizeTooltipTone(undefined), 'course');
  assert.equal(normalizeTooltipTone(''), 'course');
  assert.equal(normalizeTooltipTone('invalid'), 'course');
  assert.equal(normalizeTooltipTone('course'), 'course');
  assert.equal(normalizeTooltipTone('neutral'), 'neutral');
  assert.equal(normalizeTooltipTone('warn'), 'warn');
  assert.equal(normalizeTooltipTone('danger'), 'danger');
});

test('computeTooltipPlacement centers below trigger by default with centered caret', () => {
  const pos = computeTooltipPlacement(
    { top: 100, bottom: 130, left: 500, right: 560, width: 60, height: 30 },
    140,
    28,
    1440,
    900
  );
  assert.equal(pos.placement, 'bottom');
  assert.equal(pos.top, 139); // 130 + 9
  assert.equal(pos.left, 460); // 530 - 70
  assert.equal(pos.arrowX, 70); // 530 - 460
});

test('computeTooltipPlacement clamps near left and right viewport edges while tracking trigger center', () => {
  // Far-left trigger (e.g. #sbBtn at x=0..48)
  const leftEdge = computeTooltipPlacement(
    { top: 0, bottom: 54, left: 0, right: 48, width: 48, height: 54 },
    150,
    28,
    1440,
    900
  );
  assert.equal(leftEdge.placement, 'bottom');
  assert.equal(leftEdge.left, 10);
  assert.equal(leftEdge.arrowX, 14); // triggerCenterX=24 -> 24 - 10 = 14

  // Far-right trigger (e.g. #settingsBtn at x=1392..1440)
  const rightEdge = computeTooltipPlacement(
    { top: 0, bottom: 54, left: 1392, right: 1440, width: 48, height: 54 },
    120,
    28,
    1440,
    900
  );
  assert.equal(rightEdge.placement, 'bottom');
  assert.equal(rightEdge.left, 1310); // 1440 - 120 - 10
  assert.equal(rightEdge.arrowX, 106); // triggerCenterX=1416 -> 1416 - 1310 = 106
});

test('computeTooltipPlacement flips to top when bottom overflows viewport', () => {
  const bottomTrigger = computeTooltipPlacement(
    { top: 856, bottom: 890, left: 1380, right: 1420, width: 40, height: 34 },
    110,
    28,
    1440,
    900
  );
  assert.equal(bottomTrigger.placement, 'top');
  assert.equal(bottomTrigger.top, 819); // 856 - 28 - 9
  assert.equal(bottomTrigger.left, 1320); // 1440 - 110 - 10
  assert.equal(bottomTrigger.arrowX, 80); // 1400 - 1320
});

test('computeTooltipPlacement clamps caret within [12, tipWidth - 12] for extreme edge triggers', () => {
  const extremeLeft = computeTooltipPlacement(
    { top: 10, bottom: 30, left: 0, right: 8, width: 8, height: 20 },
    100,
    26,
    1440,
    900
  );
  assert.equal(extremeLeft.left, 10);
  assert.equal(extremeLeft.arrowX, 12);
});
