import katex from 'katex';
import {
  DOMAIN_SYNONYM_MAP,
  VAGUE_CONCEPT_MAP,
  isConversationalNoiseTerm,
  stemSearchToken,
} from './formulaSearch';

/**
 * Session-wide memoization cache for KaTeX rendered HTML strings.
 * Ensures katex.renderToString() never parses the same LaTeX expression more than once.
 */
export const katexRenderCache = new Map<string, string>();

/**
 * Session-wide memoization cache for full prose-with-math strings (`renderTextWithMath` base output).
 * Avoids re-running multi-pass HTML/LaTeX regex tokenization on re-renders, accordion toggles, or search highlighting.
 */
export const parsedMathTextCache = new Map<string, string>();

const highlightRegexCache = new Map<string, RegExp | null>();
let activeHighlightCacheKey = '';
const highlightedHtmlCache = new Map<string, string>();

const DIACRITIC_CHAR_CLASSES: Record<string, string> = {
  a: '[aàáâãäå]',
  c: '[cç]',
  e: '[eèéêë]',
  i: '[iìíîï]',
  n: '[nñ]',
  o: '[oòóôõöø]',
  u: '[uùúûü]',
  v: 'v',
  y: '[yýÿ]',
};

/**
 * Expands active search tokens with stemmed roots, domain synonym expansions,
 * vague concept associations, and compact variable subscript suffixes so matching
 * terms highlight accurately while filtering conversational filler words.
 */
export function expandHighlightTerms(tokens: readonly string[]): string[] {
  if (!tokens || tokens.length === 0) return [];
  const set = new Set<string>();

  const cleanTokens = tokens
    .map((raw) => String(raw || '').trim().toLowerCase())
    .filter(Boolean);
  const nonNoiseTokens = cleanTokens.filter((t) => !isConversationalNoiseTerm(t));
  const activeTokens = nonNoiseTokens.length > 0 ? nonNoiseTokens : cleanTokens;

  for (const t of activeTokens) {
    if (t.length >= 2 || activeTokens.length === 1) {
      set.add(t);
    }

    const stemmed = stemSearchToken(t);
    if (stemmed && stemmed.length >= 2) {
      set.add(stemmed);
    }

    const syn = DOMAIN_SYNONYM_MAP[t];
    if (syn) {
      for (const word of syn.split(/\s+/)) {
        if (word.length >= 2) {
          set.add(word);
        }
      }
    }

    const vague = VAGUE_CONCEPT_MAP[t] || (stemmed !== t ? VAGUE_CONCEPT_MAP[stemmed] : undefined);
    if (vague) {
      for (const concept of vague) {
        if (concept.length >= 3) {
          set.add(concept);
        }
      }
    }

    const subMatch = t.match(
      /^[a-z](th|rms|oc|sc|eq|max|min|in|out|avg|eff|crit|tot|net|pk|pp|dc|ac|ph)$/i
    );
    if (subMatch && subMatch[1].length >= 2) {
      set.add(subMatch[1].toLowerCase());
    }
  }

  return Array.from(set).sort((a, b) => b.length - a.length);
}

function termToDiacriticPattern(term: string): string {
  const chars = Array.from(term);
  const parts = chars.map((ch) => {
    const lower = ch.toLowerCase();
    if (DIACRITIC_CHAR_CLASSES[lower]) {
      return DIACRITIC_CHAR_CLASSES[lower];
    }
    return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return parts.join("(?:'|’|ʼ)?");
}

export function buildHighlightRegex(tokens: readonly string[]): RegExp | null {
  if (!tokens || tokens.length === 0) return null;
  const cacheKey = tokens.join('\u0001');
  if (highlightRegexCache.has(cacheKey)) {
    const cached = highlightRegexCache.get(cacheKey) ?? null;
    if (cached) cached.lastIndex = 0;
    return cached;
  }

  const expanded = expandHighlightTerms(tokens);
  if (expanded.length === 0) {
    highlightRegexCache.set(cacheKey, null);
    return null;
  }
  const pattern = expanded.map(termToDiacriticPattern).join('|');
  if (!pattern) {
    highlightRegexCache.set(cacheKey, null);
    return null;
  }
  const compiled = new RegExp(`(${pattern})`, 'gi');
  if (highlightRegexCache.size > 128) {
    highlightRegexCache.clear();
  }
  highlightRegexCache.set(cacheKey, compiled);
  return compiled;
}

const KATEX_MORD_RUN_RE =
  /(?:<span class="mord[^"]*"(?:\s+style="[^"]*")?>[a-zA-Z0-9]<\/span>){2,}/g;
const SINGLE_MORD_RE =
  /(<span class="mord[^"]*"(?:\s+style="[^"]*")?>)([a-zA-Z0-9])(<\/span>)/g;
const MATH_SVG_BLOCK_RE = /<(math|svg)(?:\s[^<>]*)?>[\s\S]*?<\/\1>/gi;
const HTML_SPLIT_TOKEN_RE = /(&[a-zA-Z0-9#]+;|<[^>]+>|\u0000HPROT_\d+\u0000)/g;
const HPROT_RESTORE_RE = /\u0000HPROT_(\d+)\u0000/g;

/**
 * Highlights matching search keywords inside HTML strings (including prose, notes,
 * tables, inline code, and visible KaTeX math spans) without altering HTML tags,
 * attributes, entities, SVG paths, or hidden MathML annotations.
 */
export function highlightHtmlContent(
  html: string,
  highlightTokens?: readonly string[]
): string {
  if (!html || !highlightTokens || highlightTokens.length === 0) {
    return html || '';
  }
  const regex = buildHighlightRegex(highlightTokens);
  if (!regex) return html;

  const tokenCacheKey = highlightTokens.join('\u0001');
  if (activeHighlightCacheKey !== tokenCacheKey) {
    activeHighlightCacheKey = tokenCacheKey;
    highlightedHtmlCache.clear();
  } else {
    const cached = highlightedHtmlCache.get(html);
    if (cached !== undefined) {
      return cached;
    }
  }

  const protectedBlocks: string[] = [];
  const protect = (block: string): string => {
    const idx = protectedBlocks.length;
    protectedBlocks.push(block);
    return `\u0000HPROT_${idx}\u0000`;
  };

  // 1. Protect hidden <math>...</math> and <svg>...</svg> blocks inside KaTeX
  let working =
    html.indexOf('<math') !== -1 || html.indexOf('<svg') !== -1
      ? String(html).replace(MATH_SVG_BLOCK_RE, (m) => protect(m))
      : String(html);

  // 2. Highlight multi-character runs across consecutive KaTeX <span class="mord...">c</span> spans
  if (working.indexOf('class="mord') !== -1) {
    working = working.replace(KATEX_MORD_RUN_RE, (runMatch) => {
      const spans: Array<{ open: string; ch: string; close: string }> = [];
      let m: RegExpExecArray | null;
      SINGLE_MORD_RE.lastIndex = 0;
      while ((m = SINGLE_MORD_RE.exec(runMatch)) !== null) {
        spans.push({ open: m[1], ch: m[2], close: m[3] });
      }
      if (spans.length < 2) return runMatch;

      const word = spans.map((s) => s.ch).join('');
      const matchedIndices = new Uint8Array(spans.length);
      let anyMatch = false;
      regex.lastIndex = 0;
      let rm: RegExpExecArray | null;
      while ((rm = regex.exec(word)) !== null) {
        if (rm[0].length === 0) {
          regex.lastIndex++;
          continue;
        }
        anyMatch = true;
        for (let i = rm.index; i < rm.index + rm[0].length && i < spans.length; i++) {
          matchedIndices[i] = 1;
        }
      }
      if (!anyMatch) return runMatch;

      return spans
        .map((s, idx) =>
          matchedIndices[idx]
            ? `${s.open}${protect(`<mark class="fm-hl">${s.ch}</mark>`)}${s.close}`
            : `${s.open}${s.ch}${s.close}`
        )
        .join('');
    });
  }

  // 3. Split by HTML entities, HTML tags, and protected blocks; highlight only visible text nodes
  const parts = working.split(HTML_SPLIT_TOKEN_RE);
  for (let i = 0; i < parts.length; i += 2) {
    const textNode = parts[i];
    if (textNode) {
      regex.lastIndex = 0;
      parts[i] = textNode.replace(regex, '<mark class="fm-hl">$1</mark>');
    }
  }

  const finalHtml =
    protectedBlocks.length > 0
      ? parts.join('').replace(HPROT_RESTORE_RE, (_, idxStr: string) => {
          return protectedBlocks[Number(idxStr)] ?? '';
        })
      : parts.join('');

  if (highlightedHtmlCache.size < 4000) {
    highlightedHtmlCache.set(html, finalHtml);
  }
  return finalHtml;
}

/**
 * Escapes plain text (such as C/C++ code blocks) into safe HTML and wraps
 * matching search keywords in `<mark class="fm-hl">`.
 */
export function highlightPlainTextToHtml(
  text: string,
  highlightTokens?: readonly string[]
): string {
  if (!text) return '';
  const escaped = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  if (!highlightTokens || highlightTokens.length === 0) {
    return escaped;
  }
  return highlightHtmlContent(escaped, highlightTokens);
}

const CPP_SYNTAX_TOKEN_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(^[ \t]*#[ \t]*[a-zA-Z_][^\n]*)|\b(int|long|short|char|void|float|double|unsigned|signed|const|static|struct|union|enum|typedef|sizeof|return|if|else|for|while|do|switch|case|break|continue|default|goto|NULL|FILE|size_t|bool|true|false|class|public|private|protected|virtual|friend|inline|template|typename|namespace|using|new|delete|this|operator|try|catch|throw)\b|\b(0x[0-9a-fA-F]+|\d+(?:\.\d+)?[uUlLfF]*)\b/gm;

/**
 * Fast, zero-dependency, single-pass C/C++ syntax highlighter for `.fmcode` blocks.
 * Falls back to `highlightPlainTextToHtml` when search keyword tokens are active.
 */
export function highlightCppCodeToHtml(
  rawCode: string,
  highlightTokens?: readonly string[]
): string {
  if (!rawCode) return '';
  if (highlightTokens && highlightTokens.length > 0) {
    return highlightPlainTextToHtml(rawCode, highlightTokens);
  }
  const escaped = String(rawCode)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    CPP_SYNTAX_TOKEN_RE,
    (match, com, str, pre, kw, num) => {
      if (com !== undefined) return `<span class="tok-com">${match}</span>`;
      if (str !== undefined) return `<span class="tok-str">${match}</span>`;
      if (pre !== undefined) return `<span class="tok-pre">${match}</span>`;
      if (kw !== undefined) return `<span class="tok-kw">${match}</span>`;
      if (num !== undefined) return `<span class="tok-num">${match}</span>`;
      return match;
    }
  );
}

export function decodeHtmlEntities(str: string): string {
  if (str.indexOf('&') === -1) return str;
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
  const clean = decodeHtmlEntities(String(latex)).trim();
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

const PRE_CODE_BLOCK_RE = /<(pre|code)(?:\s[^<>]*)?>[\s\S]*?<\/\1>/gi;
const HTML5_TAG_NAMES =
  'a|abbr|address|article|aside|b|bdi|bdo|blockquote|br|button|caption|cite|code|col|colgroup|data|dd|del|details|dfn|div|dl|dt|em|figcaption|figure|footer|h[1-6]|header|hr|i|img|input|ins|kbd|label|li|main|mark|nav|ol|option|p|pre|q|rp|rt|ruby|s|samp|section|select|small|span|strong|sub|summary|sup|table|tbody|td|textarea|tfoot|th|thead|time|tr|u|ul|var|wbr';
const MATHML_SVG_TAG_NAMES =
  'math|svg|semantics|mrow|mi|mn|mo|msub|msup|msubsup|mfrac|msqrt|mroot|mtext|mspace|mstyle|mover|munder|munderover|mtable|mtr|mtd|annotation|path|line|g';
const HTML_TAG_RE = new RegExp(
  `<\\/?(?:${HTML5_TAG_NAMES})\\b(?:\\s[^<>]*)?>`,
  'gi'
);
const NON_HTML_TAG_OPEN_RE = new RegExp(
  `<(?!(?:\\/?(?:${HTML5_TAG_NAMES}|${MATHML_SVG_TAG_NAMES})\\b(?=[\\s/>])|!--))`,
  'gi'
);
const DISPLAY_DOLLAR_RE = /\$\$([\s\S]+?)\$\$/g;
const DISPLAY_BRACKET_RE = /\\\[([\s\S]+?)\\\]/g;
const INLINE_PAREN_RE = /\\\(([\s\S]+?)\\\)/g;
const INLINE_DOLLAR_RE = /\$([^$\n\u0000]+?)\$/g;
const BOLD_MARKDOWN_RE = /\*\*([^*\n\u0000]+?)\*\*/g;
const PROT_RESTORE_RE = /\u0000PROT_(\d+)\u0000/g;

/**
 * Universal math-text parser that parses mixed HTML (such as <b>, <code>, <i>, <sub>, <sup>)
 * alongside $$...$$, \[...\], \(...\), and $...$ delimiters and converts all math segments
 * using memoized katex.renderToString(math, { throwOnError: false }).
 * Optionally highlights active search tokens in the resulting HTML.
 */
export function renderTextWithMath(
  input: string,
  highlightTokens?: readonly string[]
): string {
  if (!input) {
    return '';
  }

  if (katexRenderCache.size === 0 && parsedMathTextCache.size > 0) {
    parsedMathTextCache.clear();
  }

  let result = parsedMathTextCache.get(input);
  if (result === undefined) {
    if (
      input.indexOf('$') === -1 &&
      input.indexOf('\\(') === -1 &&
      input.indexOf('\\[') === -1 &&
      input.indexOf('**') === -1
    ) {
      result =
        input.indexOf('<') !== -1
          ? input.replace(NON_HTML_TAG_OPEN_RE, '&lt;')
          : input;
    } else {
      const protectedBlocks: string[] = [];

      // 1. Protect <pre>...</pre> and <code>...</code> blocks so C/C++ code is never altered by KaTeX
      let masked =
        input.indexOf('<pre') !== -1 || input.indexOf('<code') !== -1
          ? String(input).replace(PRE_CODE_BLOCK_RE, (match) => {
              const idx = protectedBlocks.length;
              protectedBlocks.push(match);
              return `\u0000PROT_${idx}\u0000`;
            })
          : String(input);

      // 2. Protect known HTML tags (e.g. <b>, <i>, <sub>, <sup>, <br>) so inline $...$ never spans across tags
      if (masked.indexOf('<') !== -1) {
        masked = masked.replace(HTML_TAG_RE, (match) => {
          const idx = protectedBlocks.length;
          protectedBlocks.push(match);
          return `\u0000PROT_${idx}\u0000`;
        });
      }

      // 3. Convert display ($$...$$, \[...\]) and inline (\(...\), $...$) math segments
      let processed = masked;
      if (processed.indexOf('$$') !== -1) {
        processed = processed.replace(DISPLAY_DOLLAR_RE, (_, math: string) =>
          renderLatexCached(math, true)
        );
      }
      if (processed.indexOf('\\[') !== -1) {
        processed = processed.replace(DISPLAY_BRACKET_RE, (_, math: string) =>
          renderLatexCached(math, true)
        );
      }
      if (processed.indexOf('\\(') !== -1) {
        processed = processed.replace(INLINE_PAREN_RE, (_, math: string) =>
          renderLatexCached(math, false)
        );
      }
      if (processed.indexOf('$') !== -1) {
        processed = processed.replace(INLINE_DOLLAR_RE, (_, math: string) =>
          renderLatexCached(math, false)
        );
      }
      if (processed.indexOf('**') !== -1) {
        processed = processed.replace(BOLD_MARKDOWN_RE, '<b>$1</b>');
      }

      // 4. Restore protected HTML tags and code blocks, then escape any non-HTML angle brackets (e.g. <stdio.h>)
      const restored =
        protectedBlocks.length > 0
          ? processed.replace(PROT_RESTORE_RE, (_, idxStr: string) => {
              return protectedBlocks[Number(idxStr)] ?? '';
            })
          : processed;
      result =
        restored.indexOf('<') !== -1
          ? restored.replace(NON_HTML_TAG_OPEN_RE, '&lt;')
          : restored;
    }
    parsedMathTextCache.set(input, result);
  }

  if (highlightTokens && highlightTokens.length > 0) {
    return highlightHtmlContent(result, highlightTokens);
  }
  return result;
}

export interface PrewarmMathCardLike {
  rawLatex?: string;
  fmmDisplayMode?: boolean;
  title?: string;
  htmlContent?: string;
  bodyText?: string;
  useText?: string;
  note?: string;
  seeAlso?: string;
}

/**
 * Pre-warms `katexRenderCache` and `parsedMathTextCache` in small non-blocking idle slices
 * (10 cards per slice) so opening any topic accordion or switching tabs is an instantaneous
 * O(1) memory lookup with zero main-thread KaTeX compilation lag.
 */
export function prewarmCardsMathCache(
  cards: ReadonlyArray<PrewarmMathCardLike>
): () => void {
  if (!cards || cards.length === 0 || typeof window === 'undefined') {
    return () => {};
  }

  let cursor = 0;
  let cancelled = false;
  let timerId: number | null = null;
  let idleId: number | null = null;
  const win = window as Window & {
    requestIdleCallback?: (
      cb: (deadline: { timeRemaining: () => number; didTimeout: boolean }) => void,
      opts?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  const processBatch = (deadline?: { timeRemaining: () => number }) => {
    if (cancelled) return;
    const startMs = performance.now();
    let count = 0;
    while (cursor < cards.length && count < 10) {
      const card = cards[cursor++];
      count++;
      if (card.rawLatex) {
        renderLatexCached(card.rawLatex, card.fmmDisplayMode ?? true);
      }
      if (card.title) {
        renderTextWithMath(card.title);
      }
      if (card.htmlContent) {
        renderTextWithMath(card.htmlContent);
      }
      if (card.bodyText) {
        renderTextWithMath(card.bodyText);
      }
      if (card.useText) {
        renderTextWithMath(card.useText);
      }
      if (card.note) {
        renderTextWithMath(card.note);
      }
      if (card.seeAlso) {
        renderTextWithMath(card.seeAlso);
      }
      if (deadline && deadline.timeRemaining() < 2 && performance.now() - startMs > 10) {
        break;
      }
    }
    if (cursor < cards.length && !cancelled) {
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    if (cancelled) return;
    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback((deadline) => processBatch(deadline), {
        timeout: 400,
      });
    } else {
      timerId = window.setTimeout(() => processBatch(), 16);
    }
  };

  scheduleNext();

  return () => {
    cancelled = true;
    if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
      win.cancelIdleCallback(idleId);
    }
    if (timerId !== null) {
      window.clearTimeout(timerId);
    }
  };
}

