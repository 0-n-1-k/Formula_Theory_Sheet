import test from 'node:test';
import assert from 'node:assert/strict';
import {
  katexRenderCache,
  renderLatexCached,
  renderTextWithMath,
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
