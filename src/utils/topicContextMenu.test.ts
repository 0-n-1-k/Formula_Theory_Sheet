import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopicDeepLinkUrl,
  computeContextMenuPosition,
  computeTopicMenuStats,
  formatTopicFormulasForCopy,
} from './topicContextMenu';
import type { TopicSectionRecord } from './contentParser';

function makeMockSection(course = 'EEE'): TopicSectionRecord {
  return {
    id: 'fm-eee-kcl',
    course,
    title: 'Kirchhoff & Nodal Analysis',
    freqBadge: 'Freq: 5/5',
    isOpenByDefault: true,
    cards: [
      {
        id: 'c1',
        course,
        topicId: 'fm-eee-kcl',
        topicTitle: 'Kirchhoff & Nodal Analysis',
        title: "Kirchhoff's Current Law",
        rawLatex: '\\sum I_{\\text{in}} = \\sum I_{\\text{out}}',
        bodyText: 'Conservation of charge at a node.',
        useText: 'Nodal analysis.',
        badge: '',
        htmlContent: '',
        codeContent: '',
        steps: [],
        stepsSummary: '',
        keywords: '',
        fmmDisplayMode: true,
      },
      {
        id: 'c2',
        course,
        topicId: 'fm-eee-kcl',
        topicTitle: 'Kirchhoff & Nodal Analysis',
        title: 'Pointer <b>Swap</b>',
        rawLatex: '',
        bodyText: '',
        useText: '',
        badge: '',
        htmlContent: '',
        codeContent: 'int t = *a; *a = *b; *b = t;',
        steps: [],
        stepsSummary: '',
        keywords: '',
        fmmDisplayMode: true,
      },
      {
        id: 'c3',
        course,
        topicId: 'fm-eee-kcl',
        topicTitle: 'Kirchhoff & Nodal Analysis',
        title: 'Supernode Rule',
        rawLatex: '',
        bodyText: 'Combine two non-reference nodes connected by a voltage source.',
        useText: '',
        badge: '',
        htmlContent: '<p>Combine nodes across <strong>voltage</strong> source.</p>',
        codeContent: '',
        steps: [],
        stepsSummary: '',
        keywords: '',
        fmmDisplayMode: true,
      },
    ],
  };
}

test('computeContextMenuPosition opens down-right when space permits', () => {
  const pos = computeContextMenuPosition(200, 180, 260, 320, 1440, 900);
  assert.equal(pos.left, 204);
  assert.equal(pos.top, 184);
  assert.equal(pos.originX, 'left');
  assert.equal(pos.originY, 'top');
});

test('computeContextMenuPosition flips left and up near bottom-right viewport edges', () => {
  const pos = computeContextMenuPosition(1360, 820, 260, 320, 1440, 900);
  assert.equal(pos.originX, 'right');
  assert.equal(pos.originY, 'bottom');
  assert.ok(pos.left + 260 <= 1430);
  assert.ok(pos.top + 320 <= 890);
  assert.ok(pos.left >= 10);
  assert.ok(pos.top >= 10);
});

test('computeContextMenuPosition clamps safely on narrow mobile viewports', () => {
  const pos = computeContextMenuPosition(370, 800, 310, 360, 390, 844);
  assert.ok(pos.left >= 10);
  assert.ok(pos.left + 310 <= 380);
  assert.ok(pos.top >= 10);
  assert.ok(pos.top + 360 <= 834);
});

test('computeTopicMenuStats tracks learned, unlearned, starred, and GEN reference mode', () => {
  const eee = makeMockSection('EEE');
  const stats = computeTopicMenuStats(eee, { c1: true, other: true }, { c2: true, c3: true });
  assert.equal(stats.totalCount, 3);
  assert.equal(stats.learnedCount, 1);
  assert.equal(stats.unlearnedCount, 2);
  assert.equal(stats.starredCount, 2);
  assert.equal(stats.unstarredCount, 1);
  assert.equal(stats.isReferenceOnly, false);

  const gen = makeMockSection('GEN');
  const genStats = computeTopicMenuStats(gen, { c1: true }, { c1: true });
  assert.equal(genStats.isReferenceOnly, true);
  assert.equal(genStats.learnedCount, 0);
  assert.equal(genStats.unlearnedCount, 0);
  assert.equal(genStats.starredCount, 1);
  assert.equal(genStats.unstarredCount, 2);
});

test('formatTopicFormulasForCopy exports LaTeX, code, and stripped HTML fallback cleanly', () => {
  const section = makeMockSection('EEE');
  const result = formatTopicFormulasForCopy(section, 'EEE 101');
  assert.equal(result.count, 3);
  assert.match(result.text, /^\[EEE 101\] Kirchhoff & Nodal Analysis/);
  assert.match(result.text, /1\. Kirchhoff's Current Law\n\\sum I_\{\\text\{in\}\} = \\sum I_\{\\text\{out\}\}/);
  assert.match(result.text, /2\. Pointer Swap\nint t = \*a; \*a = \*b; \*b = t;/);
  assert.match(result.text, /3\. Supernode Rule\nCombine nodes across voltage source\./);
});

test('buildTopicDeepLinkUrl builds clean hash URLs', () => {
  assert.equal(
    buildTopicDeepLinkUrl('fm-eee-kcl', 'https://example.com/', '/'),
    'https://example.com/#fm-eee-kcl'
  );
  assert.equal(
    buildTopicDeepLinkUrl('#fm-m157-1', 'https://example.com', '/sheet'),
    'https://example.com/sheet#fm-m157-1'
  );
});
