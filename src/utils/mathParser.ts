import katex from 'katex';

/**
 * Session-wide memoization cache for KaTeX rendered HTML strings.
 * Ensures katex.renderToString() never parses the same LaTeX expression more than once.
 */
export const katexRenderCache = new Map<string, string>();

export function decodeHtmlEntities(str: string): string {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

/**
 * Memoized wrapper around katex.renderToString(math, { displayMode, throwOnError: false }).
 */
export function renderLatexCached(latex: string, displayMode = false): string {
  const clean = decodeHtmlEntities(latex).trim();
  if (!clean) return '';
  const cacheKey = (displayMode ? 'D:' : 'I:') + clean;
  const cached = katexRenderCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  let rendered = '';
  try {
    rendered = katex.renderToString(clean, {
      displayMode: Boolean(displayMode),
      throwOnError: false,
      strict: false,
    });
  } catch {
    rendered = clean;
  }
  katexRenderCache.set(cacheKey, rendered);
  return rendered;
}

/**
 * Universal math-text parser that parses mixed HTML (such as <b>, <code>, <i>, <sub>, <sup>)
 * alongside $$...$$, \[...\], \(...\), and $...$ delimiters and converts all math segments
 * using memoized katex.renderToString(math, { throwOnError: false }).
 */
export function renderTextWithMath(input: string): string {
  if (
    !input ||
    (input.indexOf('$') === -1 &&
      input.indexOf('\\(') === -1 &&
      input.indexOf('\\[') === -1)
  ) {
    return input || '';
  }

  const protectedBlocks: string[] = [];

  // 1. Protect <pre>...</pre> and <code>...</code> blocks so C/C++ code is never altered
  let masked = String(input).replace(
    /<(pre|code)(?:\s[^<>]*)?>[\s\S]*?<\/\1>/gi,
    (match) => {
      const idx = protectedBlocks.length;
      protectedBlocks.push(match);
      return `\u0000PROT_${idx}\u0000`;
    }
  );

  // 2. Protect HTML tags (e.g. <b>, <i>, <sub>, <sup>, <br>) so inline $...$ never spans across tags
  masked = masked.replace(
    /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?>/g,
    (match) => {
      const idx = protectedBlocks.length;
      protectedBlocks.push(match);
      return `\u0000PROT_${idx}\u0000`;
    }
  );

  // 3. Convert display ($$...$$, \[...\]) and inline (\(...\), $...$) math segments
  const processed = masked
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, math: string) =>
      renderLatexCached(math, true)
    )
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, math: string) =>
      renderLatexCached(math, true)
    )
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, math: string) =>
      renderLatexCached(math, false)
    )
    .replace(/\$([^$\n\u0000]+?)\$/g, (_, math: string) =>
      renderLatexCached(math, false)
    );

  // 4. Restore protected HTML tags and code blocks
  return processed.replace(/\u0000PROT_(\d+)\u0000/g, (_, idxStr: string) => {
    return protectedBlocks[Number(idxStr)] ?? '';
  });
}
