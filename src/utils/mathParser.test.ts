import test from 'node:test';
import assert from 'node:assert/strict';
import {
  katexRenderCache,
  parsedMathTextCache,
  renderLatexCached,
  renderTextWithMath,
  highlightHtmlContent,
  highlightPlainTextToHtml,
  highlightCppCodeToHtml,
} from './mathParser.ts';

test('renderTextWithMath parses mixed HTML tags alongside inline $...$ and display $$...$$ math', () => {
  const raw =
    '<b>Conditions:</b> Contour $C$, point $f(z_0)$, and integral $\\oint_C \\dfrac{g(z)}{(z-z_0)^{n+1}}\\,dz$ with <code>std::vector&lt;int&gt;</code>.';
  const html = renderTextWithMath(raw);

  assert.ok(html.includes('<b>Conditions:</b>'), 'Preserves <b> HTML tag');
  assert.ok(
    html.includes('<code>std::vector&lt;int&gt;</code>'),
    'Preserves <code> block untouched'
  );
  assert.ok(html.includes('class="katex"'), 'Renders inline LaTeX with KaTeX');
  assert.equal(
    html.includes('$C$'),
    false,
    'Should not leave raw $C$ unrendered'
  );
  assert.equal(
    html.includes('$f(z_0)$'),
    false,
    'Should not leave raw $f(z_0)$ unrendered'
  );
});

test('renderTextWithMath handles inequality signs (> and &lt;) inside inline math', () => {
  const raw =
    '<b>Where:</b> For $R_{th} &gt; 0$ and $0 &lt; p &lt; 1$, damped when $\\gamma > \\omega_0$.';
  const html = renderTextWithMath(raw);
  assert.equal(
    html.includes('$'),
    false,
    'All inline math with inequalities should be rendered by KaTeX'
  );
  assert.ok(html.includes('class="katex"'));
});

test('renderLatexCached memoizes KaTeX strings in katexRenderCache Map', () => {
  katexRenderCache.clear();
  const first = renderLatexCached('\\oint_C f(z)\\,dz = 2\\pi i \\sum \\text{Res}', true);
  assert.equal(katexRenderCache.size, 1);
  const second = renderLatexCached('\\oint_C f(z)\\,dz = 2\\pi i \\sum \\text{Res}', true);
  assert.equal(first, second);
  assert.equal(katexRenderCache.size, 1);
});

test('renderTextWithMath and highlightHtmlContent highlight matching keywords in prose, diacritics, KaTeX formulas, and code without corrupting HTML tags or entities', () => {
  const note =
    '<b>Where:</b> $V_{th}$ is the Thévenin equivalent voltage &amp; $I_{rms}$ is root-mean-square current in L’Hôpital form.';
  const highlighted = renderTextWithMath(note, ['thevenin', 'lhopital', 'irms']);

  assert.ok(
    highlighted.includes('<mark class="fm-hl">Thévenin</mark>'),
    'Matches diacritic Thévenin from plain query "thevenin"'
  );
  assert.ok(
    highlighted.includes('<mark class="fm-hl">L’Hôpital</mark>'),
    'Matches curly apostrophe + circumflex L’Hôpital from plain query "lhopital"'
  );
  assert.ok(
    highlighted.includes('&amp;'),
    'Does not corrupt HTML entity &amp;'
  );
  assert.ok(
    highlighted.includes(
      '<mark class="fm-hl">r</mark></span><span class="mord mathnormal mtight"><mark class="fm-hl">m</mark></span><span class="mord mathnormal mtight"><mark class="fm-hl">s</mark></span>'
    ),
    'Highlights consecutive KaTeX mord spans for rms subscript'
  );

  const katexFormula = renderLatexCached('P_{\\text{max}} = \\frac{V_{th}^2}{4 R_{th}}', true);
  const highlightedFormula = highlightHtmlContent(katexFormula, ['vth', 'max']);
  assert.ok(
    highlightedFormula.includes('<mark class="fm-hl">max</mark>'),
    'Highlights \\text{max} inside KaTeX formula'
  );
  assert.ok(
    highlightedFormula.includes('<mark class="fm-hl">t</mark>'),
    'Highlights th subscript inside KaTeX formula when searching vth'
  );

  const codeHighlighted = highlightPlainTextToHtml(
    'if (a < b && strcmp(s1, s2) == 0) return 1;',
    ['strcmp']
  );
  assert.ok(
    codeHighlighted.includes('<mark class="fm-hl">strcmp</mark>'),
    'Highlights keyword inside escaped code block'
  );
  assert.ok(
    codeHighlighted.includes('&lt;') && codeHighlighted.includes('&amp;&amp;'),
    'Preserves escaped angle brackets and ampersands in code block'
  );
});

test('renderTextWithMath memoizes full prose-with-math strings in parsedMathTextCache', () => {
  katexRenderCache.clear();
  parsedMathTextCache.clear();
  const sample = '<b>Use:</b> Compute $V_{th} = V_{oc}$ and $R_{th} = V_{oc}/I_{sc}$ for linear networks.';
  const first = renderTextWithMath(sample);
  assert.equal(parsedMathTextCache.has(sample), true);
  assert.equal(parsedMathTextCache.get(sample), first);

  const highlighted = renderTextWithMath(sample, ['thevenin', 'voc']);
  assert.ok(highlighted.includes('<mark class="fm-hl">'));
  assert.equal(parsedMathTextCache.get(sample), first, 'Base math cache remains intact after highlighting');
});

test('highlightCppCodeToHtml tokenizes C/C++ comments, preprocessor directives, keywords, strings, and numbers in a single pass', () => {
  const snippet = [
    '#include <stdio.h>',
    '/* Multi-line comment with int and 42 */',
    'int myStrlen(const char *s) { // count chars',
    '  if (!s || *s == \'\\0\') return 0x0;',
    '  printf("len=%d\\n", 100);',
    '}',
  ].join('\n');

  const html = highlightCppCodeToHtml(snippet);
  assert.ok(html.includes('<span class="tok-pre">#include &lt;stdio.h&gt;</span>'));
  assert.ok(html.includes('<span class="tok-com">/* Multi-line comment with int and 42 */</span>'));
  assert.ok(html.includes('<span class="tok-com">// count chars</span>'));
  assert.ok(html.includes('<span class="tok-kw">int</span>'));
  assert.ok(html.includes('<span class="tok-kw">const</span>'));
  assert.ok(html.includes('<span class="tok-kw">char</span>'));
  assert.ok(html.includes('<span class="tok-kw">return</span>'));
  assert.ok(html.includes('<span class="tok-str">\'\\0\'</span>'));
  assert.ok(html.includes('<span class="tok-str">"len=%d\\n"</span>'));
  assert.ok(html.includes('<span class="tok-num">0x0</span>'));
  assert.ok(html.includes('<span class="tok-num">100</span>'));

  const searchMode = highlightCppCodeToHtml(snippet, ['mystrlen']);
  assert.ok(searchMode.includes('<mark class="fm-hl">myStrlen</mark>'));
  assert.equal(searchMode.includes('tok-kw'), false, 'Falls back to search highlight when highlightTokens are present');
});



