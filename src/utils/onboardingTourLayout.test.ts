import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSpotlightCutoutPath,
  chooseTourDockPosition,
  interpolateSpotlightRect,
  isSpotlightSettled,
} from './onboardingTourLayout';

test('buildSpotlightCutoutPath returns outer viewport rectangle when rect is null', () => {
  const path = buildSpotlightCutoutPath(1440, 900, null);
  assert.equal(path, 'M0 0 H1440 V900 H0 Z');
});

test('buildSpotlightCutoutPath punches out a rounded inner rectangle', () => {
  const path = buildSpotlightCutoutPath(
    1440,
    900,
    { top: 100, left: 200, width: 320, height: 80 },
    12
  );
  assert.ok(path.startsWith('M0 0 H1440 V900 H0 Z M212.00 100.00'));
  assert.ok(path.includes('A12.00 12.00 0 0 1'));
  assert.ok(path.endsWith('Z'));
});

test('interpolateSpotlightRect and isSpotlightSettled converge cleanly', () => {
  let curr = { top: 0, left: 0, width: 100, height: 40 };
  const target = { top: 200, left: 300, width: 400, height: 120 };
  assert.equal(isSpotlightSettled(curr, target), false);

  for (let i = 0; i < 60; i++) {
    curr = interpolateSpotlightRect(curr, target, 0.25);
  }
  assert.equal(isSpotlightSettled(curr, target, 0.5), true);
});

test('chooseTourDockPosition defaults to bottom and flips to top when target sits at bottom', () => {
  // Target near top -> stay docked at bottom
  assert.equal(
    chooseTourDockPosition({ top: 80, left: 100, width: 500, height: 120 }, 130, 900),
    'bottom'
  );
  // Target near bottom edge -> flip dock to top
  assert.equal(
    chooseTourDockPosition({ top: 760, left: 100, width: 500, height: 90 }, 130, 900),
    'top'
  );
  // Very tall target spanning screen -> keep steady at bottom
  assert.equal(
    chooseTourDockPosition({ top: 40, left: 100, width: 500, height: 820 }, 130, 900),
    'bottom'
  );
});
