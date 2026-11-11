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

const DIACRITIC_CHAR_CLASSES: Record<string, string> = {
  a: '[aàáâãäå]',
  c: '[cç]',
  e: '[eèéêë]',
  i: '[iìíîï]',
  n: '[nñ]',
  o: '[oòóôõöø]',
  u: '[uùúûü]',
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
  const expanded = expandHighlightTerms(tokens);
  if (expanded.length === 0) return null;
  const pattern = expanded.map(termToDiacriticPattern).join('|');
  if (!pattern) return null;
  return new RegExp(`(${pattern})`, 'gi');
}

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

  const protectedBlocks: string[] = [];
  const protect = (block: string): string => {
    const idx = protectedBlocks.length;
    protectedBlocks.push(block);
    return `\u0000HPROT_${idx}\u0000`;
  };

  // 1. Protect hidden <math>...</math> and <svg>...</svg> blocks inside KaTeX
  let working = String(html).replace(
    /<(math|svg)(?:\s[^<>]*)?>[\s\S]*?<\/\1>/gi,
    (m) => protect(m)
  );

  // 2. Highlight multi-character runs across consecutive KaTeX <span class="mord...">c</span> spans
  const katexMordRunRe =
    /(?:<span class="mord[^"]*"(?:\s+style="[^"]*")?>[a-zA-Z0-9]<\/span>){2,}/g;
  const singleMordRe =
    /(<span class="mord[^"]*"(?:\s+style="[^"]*")?>)([a-zA-Z0-9])(<\/span>)/g;

  working = working.replace(katexMordRunRe, (runMatch) => {
    const spans: Array<{ open: string; ch: string; close: string }> = [];
    let m: RegExpExecArray | null;
    singleMordRe.lastIndex = 0;
    while ((m = singleMordRe.exec(runMatch)) !== null) {
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

  // 3. Split by HTML entities, HTML tags, and protected blocks; highlight only visible text nodes
  const parts = working.split(/(&[a-zA-Z0-9#]+;|<[^>]+>|\u0000HPROT_\d+\u0000)/g);
  for (let i = 0; i < parts.length; i += 2) {
    const textNode = parts[i];
    if (textNode) {
      regex.lastIndex = 0;
      parts[i] = textNode.replace(regex, '<mark class="fm-hl">$1</mark>');
    }
  }

  return parts.join('').replace(/\u0000HPROT_(\d+)\u0000/g, (_, idxStr: string) => {
    return protectedBlocks[Number(idxStr)] ?? '';
  });
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
 * Optionally highlights active search tokens in the resulting HTML.
 */
export function renderTextWithMath(
  input: string,
  highlightTokens?: readonly string[]
): string {
  if (!input) {
    return '';
  }

  let result: string;
  if (
    input.indexOf('$') === -1 &&
    input.indexOf('\\(') === -1 &&
    input.indexOf('\\[') === -1 &&
    input.indexOf('**') === -1
  ) {
    result = input;
  } else {
    const protectedBlocks: string[] = [];

    // 1. Protect <pre>...</pre> and <code>...</code> blocks so C/C++ code is never altered by KaTeX
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
      )
      .replace(/\*\*([^*\n\u0000]+?)\*\*/g, '<b>$1</b>');

    // 4. Restore protected HTML tags and code blocks
    result = processed.replace(/\u0000PROT_(\d+)\u0000/g, (_, idxStr: string) => {
      return protectedBlocks[Number(idxStr)] ?? '';
    });
  }

  if (highlightTokens && highlightTokens.length > 0) {
    return highlightHtmlContent(result, highlightTokens);
  }
  return result;
}

