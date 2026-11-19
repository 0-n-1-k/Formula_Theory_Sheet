import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditCard, auditContentSources } from './cardAudit.ts';
import { parseTopicSections } from './contentParser.ts';
import type { FormulaCardRecord } from './formulaSearch.ts';

function makeCard(overrides: Partial<FormulaCardRecord>): FormulaCardRecord {
  return {
    id: 'test:0',
    course: 'CSE',
    topicId: 'fm-test',
    topicTitle: 'Test Section',
    title: 'Sample Card',
    rawLatex: '',
    keywords: 'sample test',
    bodyText: 'Sample parameters and context.',
    useText: 'Sample application and strategy.',
    ...overrides,
  };
}

const defaultMeta = {
  sourceFile: 'synthetic.html',
  sectionId: 'fm-test',
  sectionTitle: 'Test Section',
  cardIndex: 1,
};

test('auditCard detects commented-out block code, prose walls, and copyText commented code without false positives', () => {
  const blockCodeCard = makeCard({
    codeContent: [
      '/* 1. Valid section header */',
      '/* printf((y % 400 == 0) ? "Leap\\n" : "Not\\n"); */',
      '/* max = (a > b) ? a : b; */',
    ].join('\n'),
    copyText: '/* printf("bad"); */',
  });
  const blockIssues = auditCard(blockCodeCard, defaultMeta);
  const blockCats = blockIssues.map((i) => `${i.field}:${i.category}`);
  assert.equal(
    blockCats.filter((c) => c === 'codeContent:commented-out-code-block').length,
    2,
    'Should flag both commented-out C statements in codeContent'
  );
  assert.ok(
    blockCats.includes('copyText:commented-out-code-block'),
    'Should flag commented-out C statement in copyText'
  );

  const proseWallCard = makeCard({
    codeContent: [
      '/* Exam Trap:',
      ' * integer division truncates toward zero',
      ' * sizeof returns size_t',
      ' */',
      'int x = 5 / 2;',
    ].join('\n'),
  });
  const proseIssues = auditCard(proseWallCard, defaultMeta);
  assert.ok(
    proseIssues.some((i) => i.category === 'prose-wall-in-code-comment'),
    'Should detect multi-line prose wall with bullets inside code block comment'
  );

  const safeMathCommentCard = makeCard({
    codeContent: [
      '/* 1. Angular speed: 2 * pi * r * rpm */',
      'double v = 2 * 3.14159 * r * rpm;',
    ].join('\n'),
  });
  assert.equal(
    auditCard(safeMathCommentCard, defaultMeta).length,
    0,
    'Must not false-positive on multiplication asterisks inside a single-line header comment'
  );
});

test('auditCard detects commented-out single-line code, double // comments, glued comments, and pseudocode ellipses', () => {
  const buggyCard = makeCard({
    codeContent: [
      '// last = -1; for (i = 0; i < n; i++) if (s[i] == ch) last = i;',
      '// if (i == 0 || i == n - 1) putchar(\'*\'); // hollow square',
      '/* 6 bytes */ char *p = "hello";',
      'for (...) fprintf(out, ...);',
      'for (i..r1) sum += i;',
    ].join('\n'),
  });
  const cats = new Set(auditCard(buggyCard, defaultMeta).map((i) => i.category));
  assert.ok(cats.has('commented-out-code-line'));
  assert.ok(cats.has('double-line-comment'));
  assert.ok(cats.has('glued-block-comment'));
  assert.ok(cats.has('pseudocode-ellipsis-in-code'));

  const cleanCard = makeCard({
    codeContent: [
      '// for -> do-while (safe conversion)',
      '// Deep Copy Constructor (called on: String b = a; pass-by-value; return-by-value)',
      'try {',
      '  run();',
      '} catch (...) {',
      '  puts("err");',
      '}',
    ].join('\n'),
  });
  assert.equal(
    auditCard(cleanCard, defaultMeta).length,
    0,
    'Must not false-positive on explanatory comments or valid C++ catch (...)'
  );
});

test('auditCard detects KaTeX errors, unescaped %, raw LaTeX outside math, broken entities, and unbalanced HTML', () => {
  const mathIssues = auditCard(
    makeCard({
      course: 'GEN',
      rawLatex: '\\frac{100%}{x}',
      htmlContent: '<p>$(a,0)$;\\quad $x=-a$ &amp;lt; 0 <b>unclosed</p>',
    }),
    defaultMeta
  );
  const cats = new Set(mathIssues.map((i) => i.category));
  assert.ok(cats.has('unescaped-latex-percent'));
  assert.ok(cats.has('raw-latex-outside-math'));
  assert.ok(cats.has('double-escaped-entity'));
  assert.ok(cats.has('unbalanced-html-tags'));
});

test('parseTopicSections preserves LaTeX \\sec, chemical CH_4, and C parameter (ch) while stripping Sec. 4.2 citations', () => {
  const html = `
    <details class="fmt" id="fm-san" data-c="M159">
      <summary><span class="fmtt">Sanitizer Test</span></summary>
      <div class="fmgrid">
        <div class="fmi tex" data-k="san:0" data-s="secant methane char">
          <div class="fmh"><span class="fmn">Parametric Hyperbola</span><span class="fmb"></span></div>
          <div class="fmbody">
            <div class="fmm">$$(a\\sec\\theta, b\\tan\\theta)$$</div>
            <div class="fmdet">
              <div class="fmw"><b>Context:</b> Applies to $(a\\sec\\theta, b\\tan\\theta)$, $CH_4$, and isalpha(ch) (Sec. 4.2, Ch. 3).</div>
              <div class="fmu"><b>Use:</b> Substitute directly.</div>
            </div>
          </div>
        </div>
      </div>
    </details>
  `;
  const [section] = parseTopicSections(html);
  const card = section.cards[0];
  assert.ok(card.bodyText.includes('\\sec\\theta'), 'Must preserve \\sec\\theta');
  assert.ok(card.bodyText.includes('CH_4'), 'Must preserve CH_4');
  assert.ok(card.bodyText.includes('isalpha(ch)'), 'Must preserve (ch)');
  assert.ok(!/Sec\.\s*4\.2|Ch\.\s*3/i.test(card.bodyText), 'Must still strip Sec. 4.2 / Ch. 3 citations');
});

test('full production corpus sweep across all 79 sections and 687 cards reports 0 issues', () => {
  const report = auditContentSources([
    { name: 'src/content-fmroot.html', html: fs.readFileSync('src/content-fmroot.html', 'utf8') },
    { name: 'src/content-gen.html', html: fs.readFileSync('src/content-gen.html', 'utf8') },
    { name: 'src/content-thmroot.html', html: fs.readFileSync('src/content-thmroot.html', 'utf8') },
  ]);

  assert.equal(report.totalSections, 79, 'Expected 79 total sections');
  assert.equal(report.totalCards, 687, 'Expected 687 total cards');
  assert.equal(
    report.issues.length,
    0,
    `Expected 0 audit issues across all courses, found ${report.issues.length}:\n` +
      report.issues
        .slice(0, 10)
        .map((i) => `[${i.course}] ${i.cardId} (#${i.cardIndex}) ${i.category}: ${i.message} :: ${i.excerpt}`)
        .join('\n')
  );
});
