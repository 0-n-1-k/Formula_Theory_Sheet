import katex from 'katex';
import type { FormulaCardRecord } from './formulaSearch';
import { parseTopicSections, type TopicSectionRecord } from './contentParser';
import { decodeHtmlEntities, renderTextWithMath, tokenizeCppCodeBase } from './mathParser';

export type AuditSeverity = 'error' | 'warning';

export type AuditCategory =
  | 'commented-out-code-block'
  | 'prose-wall-in-code-comment'
  | 'commented-out-code-line'
  | 'double-line-comment'
  | 'glued-block-comment'
  | 'malformed-code-spacing'
  | 'pseudocode-ellipsis-in-code'
  | 'unbalanced-code-delimiters'
  | 'section-number-artifact'
  | 'katex-parse-error'
  | 'unescaped-latex-percent'
  | 'missing-latex-backslash'
  | 'unmatched-dollar-delimiter'
  | 'raw-latex-outside-math'
  | 'double-escaped-entity'
  | 'malformed-entity'
  | 'unbalanced-html-tags'
  | 'table-column-mismatch'
  | 'broken-anchor-link'
  | 'inline-code-syntax-trap'
  | 'empty-card-content'
  | 'broken-copy-text'
  | 'context-sanitization-artifact'
  | 'raw-markdown-artifact';

export interface CardAuditIssue {
  sourceFile: string;
  sectionId: string;
  sectionTitle: string;
  cardIndex: number; // 1-based index displayed in UI (#01, #02, ...)
  cardId: string;
  course: string;
  cardTitle: string;
  category: AuditCategory;
  severity: AuditSeverity;
  field: string;
  excerpt: string;
  message: string;
}

export interface AuditReport {
  totalSections: number;
  totalCards: number;
  codeCards: number;
  issues: CardAuditIssue[];
  countsByCategory: Record<string, number>;
  countsByCourse: Record<string, number>;
}

const RAW_LATEX_CMD_RE =
  /\\(?:frac|dfrac|tfrac|int|iint|iiint|oint|sum|prod|sqrt|alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|infty|partial|nabla|cdot|times|pm|mp|le|leq|ge|geq|neq|approx|equiv|sim|propto|to|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|mapsto|text|textbf|textit|mathbf|mathrm|mathcal|mathbb|hat|bar|vec|dot|ddot|overline|underline|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp|lim|forall|exists|in|notin|subset|subseteq|cup|cap|binom|left|right|begin|end|quad|qquad|displaystyle|limits)\b/;

const DOUBLE_ESCAPED_ENTITY_RE = /&amp;(?:lt|gt|amp|quot|#\d+|#x[0-9a-f]+);/i;

const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function stripPreAndCode(html: string): string {
  return html.replace(/<(pre|code)(\s[^<>]*)?>[\s\S]*?<\/\1>/gi, '');
}

function checkCodeDelimiters(code: string): string | null {
  const stack: Array<{ ch: string; line: number }> = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closing = new Set([')', ']', '}']);

  let line = 1;
  let inStr: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (ch === '\n') {
      line++;
      inLineComment = false;
      if (inStr) {
        return `Unclosed string/char literal (${inStr}) at line ${line - 1}`;
      }
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inStr) {
      if (ch === '\\' && next !== undefined) {
        i++;
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = ch;
      continue;
    }

    if (pairs[ch]) {
      stack.push({ ch, line });
    } else if (closing.has(ch)) {
      const top = stack.pop();
      if (!top || pairs[top.ch] !== ch) {
        return `Unmatched '${ch}' at line ${line}` + (top ? ` (expected '${pairs[top.ch]}' for '${top.ch}' at line ${top.line})` : '');
      }
    }
  }

  if (inBlockComment) {
    return 'Unclosed block comment /* ... */';
  }
  if (inStr) {
    return `Unclosed string/char literal (${inStr}) at EOF`;
  }
  if (stack.length > 0) {
    const last = stack[stack.length - 1];
    return `Unclosed '${last.ch}' opened at line ${last.line}`;
  }
  return null;
}

function checkHtmlTagBalance(html: string): string | null {
  const withoutPreCode = html.replace(/<(pre|code)(\s[^<>]*)?>[\s\S]*?<\/\1>/gi, '');
  const withoutMath = withoutPreCode
    .replace(/\$\$[\s\S]+?\$\$/g, '')
    .replace(/\$[^$\n]+?\$/g, '')
    .replace(/\\\[[\s\S]+?\\\]/g, '')
    .replace(/\\\([\s\S]+?\\\)/g, '');

  const stack: string[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9.]*)\b[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(withoutMath)) !== null) {
    const isClose = m[1] === '/';
    const tag = m[2].toLowerCase();
    const isSelfClose = m[3] === '/';
    if (VOID_HTML_TAGS.has(tag) || isSelfClose) continue;
    // Ignore C++ header angles that might have slipped through like <stdio.h>
    if (tag.includes('.')) continue;
    if (!isClose) {
      stack.push(tag);
    } else {
      const top = stack.pop();
      if (top !== tag) {
        return `Mismatched closing tag </${tag}> (expected ${top ? `</${top}>` : 'none'})`;
      }
    }
  }
  if (stack.length > 0) {
    return `Unclosed HTML tag <${stack[stack.length - 1]}>`;
  }
  return null;
}

function looksLikeCommentedOutBlockCode(commentBody: string): boolean {
  const trimmed = commentBody.trim();
  if (!trimmed) return false;

  // Explicit header comments like "/* 1. Leap Year using switch (2016-17 Q1b) */" are NOT code
  if (/^\d+\.\s+[A-Z]/.test(trimmed) && !trimmed.includes(';')) {
    return false;
  }

  // Statements ending with semicolon inside a single block comment: /* printf(...); */ or /* max = ...; */
  if (/;\s*$/.test(trimmed)) {
    return true;
  }

  // Executable C/C++ statements with assignment or function call + punctuation
  if (
    /^(?:printf|scanf|fprintf|fscanf|sprintf|fgets|puts|putchar|malloc|calloc|realloc|free|return|break|continue|goto|delete|new|cout|cin|#define|#include)\b/.test(
      trimmed
    ) &&
    (/[(=;]|<<|>>/.test(trimmed))
  ) {
    return true;
  }

  // Assignment + ternary or statement separator
  if (/^[a-zA-Z_]\w*\s*(?:\[[^\]]+\])?\s*=\s*[^=]/.test(trimmed) && (trimmed.includes(';') || trimmed.includes('?'))) {
    return true;
  }

  // Control flow header + body inside block comment
  if (/^(?:if|for|while|switch|do)\s*\(/.test(trimmed) && (trimmed.includes(';') || trimmed.includes('{'))) {
    return true;
  }

  return false;
}

function looksLikeProseWallInCodeComment(commentBody: string): boolean {
  const rawLines = commentBody.split('\n');
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);
  const bulletLines = rawLines.filter((l) => /^\s*\*\s+/.test(l)).length;
  if (bulletLines >= 2) {
    return true;
  }
  if (lines.length >= 3) {
    const joined = lines.join(' ');
    if (
      /exam\s*trap|remember\s*:|exact\s*values|pitfall|mnemonic/i.test(joined) ||
      joined.length > 340
    ) {
      return true;
    }
  }
  return false;
}

function looksLikeCommentedOutLineCode(commentBody: string): boolean {
  const rest = commentBody.trim();
  if (!rest) return false;

  // Starts with C/C++ control flow followed immediately by '(' or '{'
  if (/^(?:if|for|while|switch)\s*\(/.test(rest) || /^do\s*\{/.test(rest)) {
    return true;
  }

  // Starts with C/C++ declaration or statement keywords followed by code syntax
  if (
    /^(?:return|int|char|double|float|void|long|short|unsigned|signed|struct|typedef|class|printf|scanf|fprintf|fscanf|fgets|puts|malloc|calloc|free|cout|cin|delete|#include|#define)\b/.test(
      rest
    ) &&
    (/[({;=]|<<|>>|\*\w/.test(rest))
  ) {
    return true;
  }

  // Contains a semicolon followed by another statement/clause outside parenthetical prose notes
  const withoutParens = rest.replace(/\([^()]*\)/g, '');
  if (/;\s*(?:for|if|while|return|then|\w+\s*(?:=|\+\+|--|\())/.test(withoutParens)) {
    return true;
  }

  // Ends with a C statement semicolon (excluding prose like "note: ends with ;" or "; !" or "no ;")
  if (/[a-zA-Z0-9_)\]'"]\s*;\s*$/.test(rest) && !/no\s*;|ends\s+with|needs\s+a?\s*;/i.test(rest)) {
    if (!/^equivalent\s+to\b/i.test(rest) && !/^same\s+as\b/i.test(rest) && !/^note\s*:/i.test(rest)) {
      return true;
    }
  }

  // Compact pseudo-code formulas commented out as a full line
  if (
    /\b\w+\s*\[[^\]]+\]\s*(?:\+\+|--|=|\+=|-=)/.test(rest) ||
    /^[a-zA-Z_]\w*\s*=\s*[^=].*;\s*/.test(rest) ||
    /^[a-zA-Z_]\w*\([^)]*\)\s+while\b/.test(rest) ||
    /^seen\[\d+\]\s*:/.test(rest) ||
    /:\s*[a-zA-Z_]\w*\s*=\s*[^=]+;\s*[a-zA-Z_]\w*\s*=/.test(rest)
  ) {
    return true;
  }

  return false;
}

export function auditCard(
  card: FormulaCardRecord,
  meta: {
    sourceFile: string;
    sectionId: string;
    sectionTitle: string;
    cardIndex: number;
    validSectionIds?: ReadonlySet<string>;
  }
): CardAuditIssue[] {
  const issues: CardAuditIssue[] = [];
  const push = (
    category: AuditCategory,
    severity: AuditSeverity,
    field: string,
    excerpt: string,
    message: string
  ) => {
    issues.push({
      sourceFile: meta.sourceFile,
      sectionId: meta.sectionId,
      sectionTitle: meta.sectionTitle,
      cardIndex: meta.cardIndex,
      cardId: card.id,
      course: card.course,
      cardTitle: card.title,
      category,
      severity,
      field,
      excerpt: excerpt.replace(/\s+/g, ' ').trim().slice(0, 160),
      message,
    });
  };

  // 1. Empty card content
  if (!card.rawLatex && !card.htmlContent && !card.codeContent) {
    push('empty-card-content', 'error', 'body', card.title, 'Card has no rawLatex, htmlContent, or codeContent');
  }

  const validateLatexSegment = (field: string, rawSegment: string, displayMode: boolean, label: string) => {
    const decoded = decodeHtmlEntities(rawSegment);
    // Unescaped % inside LaTeX silently comments out the rest of the expression in KaTeX
    const pctMatch = decoded.match(/(?<!\\)(?:\\\\)*%[^\n]*/);
    if (pctMatch) {
      push(
        'unescaped-latex-percent',
        'error',
        field,
        `${pctMatch[0].slice(0, 80)} (in ${decoded.slice(0, 80)})`,
        `Unescaped "%" inside ${label} math silently comments out the rest of the formula in KaTeX`
      );
    }
    // Missing backslash before core LaTeX commands followed by '{'
    const missMatch = decoded.match(/(?<!\\)\b(frac|dfrac|tfrac|sqrt|text|textbf|mathbf|mathrm|mathcal|mathbb)\{/);
    if (missMatch) {
      const idx = missMatch.index ?? 0;
      push(
        'missing-latex-backslash',
        'error',
        field,
        decoded.slice(Math.max(0, idx - 15), idx + 45),
        `Missing leading backslash before "${missMatch[1]}{" inside ${label} math`
      );
    }
    try {
      katex.renderToString(decoded, {
        displayMode,
        throwOnError: true,
        strict: false,
      });
    } catch (err) {
      push(
        'katex-parse-error',
        'error',
        field,
        decoded,
        `${label} math error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  // 2. KaTeX validation on rawLatex
  if (card.rawLatex) {
    validateLatexSegment('rawLatex', card.rawLatex, card.fmmDisplayMode ?? true, 'rawLatex');
  }

  // 3. Text & HTML field checks
  const textFields: Array<[string, string | undefined]> = [
    ['title', card.title],
    ['htmlContent', card.htmlContent],
    ['bodyText', card.bodyText],
    ['useText', card.useText],
    ['note', card.note],
    ['seeAlso', card.seeAlso],
    ['stepsSummary', card.stepsSummary],
    ...(card.steps || []).map((st, idx) => [`step[${idx}]`, st] as [string, string]),
  ];

  for (const [field, value] of textFields) {
    if (!value) continue;

    // Double-escaped entities
    const deMatch = value.match(DOUBLE_ESCAPED_ENTITY_RE);
    if (deMatch) {
      const idx = deMatch.index ?? 0;
      push(
        'double-escaped-entity',
        'error',
        field,
        value.slice(Math.max(0, idx - 20), idx + 40),
        `Double-escaped HTML entity "${deMatch[0]}"`
      );
    }

    // Malformed entities (&lt, &gt, &amp, &quot missing trailing ';')
    const badEnt = value.match(/&(?:lt|gt|amp|quot)(?![a-zA-Z0-9;])/);
    if (badEnt) {
      const idx = badEnt.index ?? 0;
      push(
        'malformed-entity',
        'error',
        field,
        value.slice(Math.max(0, idx - 15), idx + 35),
        `Malformed HTML entity "${badEnt[0]}" missing semicolon`
      );
    }

    // Broken anchor links in seeAlso or HTML
    if (meta.validSectionIds && value.includes('href="#')) {
      for (const m of value.matchAll(/href="#([^"]+)"/g)) {
        if (!meta.validSectionIds.has(m[1])) {
          push(
            'broken-anchor-link',
            'error',
            field,
            m[0],
            `Anchor link "#${m[1]}" does not match any topic section ID`
          );
        }
      }
    }

    // Check HTML tag balance and table column consistency on fields that may contain HTML
    if (field !== 'title' && value.includes('<')) {
      const tagErr = checkHtmlTagBalance(value);
      if (tagErr) {
        push('unbalanced-html-tags', 'error', field, value.slice(0, 140), tagErr);
      }
      if (value.includes('<table')) {
        for (const tm of value.matchAll(/<table[\s\S]*?<\/table>/gi)) {
          const rows = [...tm[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
          const counts = rows.map((r) => (r[1].match(/<(?:td|th)\b/gi) || []).length);
          const hasSpan = /colspan|rowspan/i.test(tm[0]);
          if (!hasSpan && counts.length > 1 && new Set(counts).size > 1) {
            push(
              'table-column-mismatch',
              'error',
              field,
              `row cell counts=[${counts.join(', ')}] | ${tm[0].slice(0, 100)}`,
              'HTML table rows have inconsistent column counts'
            );
          }
        }
      }
    }

    // Check inline <code> syntax-highlighting traps
    if (value.includes('<code')) {
      const codeTagRe = /<code(?:\s[^<>]*)?>([\s\S]*?)<\/code>/gi;
      let cm: RegExpExecArray | null;
      while ((cm = codeTagRe.exec(value)) !== null) {
        const inner = cm[1];
        const tokenized = tokenizeCppCodeBase(inner);
        if (
          tokenized.includes('class="tok-com"') &&
          !/^\/\//.test(inner.trim()) &&
          !/^\/\*/.test(inner.trim())
        ) {
          push(
            'inline-code-syntax-trap',
            'warning',
            field,
            inner,
            'Inline <code> contains // or /* that gets highlighted as a comment'
          );
        }
      }
    }

    // Check math delimiters & KaTeX outside <pre>/<code>
    const noCode = stripPreAndCode(value);

    for (const m of noCode.matchAll(/\$\$([\s\S]+?)\$\$/g)) {
      validateLatexSegment(field, m[1], true, 'Display $$');
    }
    for (const m of noCode.matchAll(/\\\[([\s\S]+?)\\\]/g)) {
      validateLatexSegment(field, m[1], true, 'Display \\[');
    }
    for (const m of noCode.matchAll(/\\\(([\s\S]+?)\\\)/g)) {
      validateLatexSegment(field, m[1], false, 'Inline \\(');
    }

    const withoutDisplay = noCode
      .replace(/\$\$[\s\S]+?\$\$/g, '')
      .replace(/\\\[[\s\S]+?\\\]/g, '')
      .replace(/\\\([\s\S]+?\\\)/g, '');

    for (const m of withoutDisplay.matchAll(/\$([^$\n]+?)\$/g)) {
      validateLatexSegment(field, m[1], false, 'Inline $');
    }

    const remainder = withoutDisplay.replace(/\$[^$\n]+?\$/g, '');

    const rendered = renderTextWithMath(value);
    if (rendered.includes('katex-error')) {
      const keMatch = rendered.match(/class="katex-error"[^>]*title="([^"]*)"[^>]*>([^<]*)</);
      push(
        'katex-parse-error',
        'error',
        field,
        keMatch ? `${keMatch[2]} (${keMatch[1]})` : value.slice(0, 120),
        'renderTextWithMath produced a .katex-error span'
      );
    }

    if (remainder.includes('$')) {
      const idx = remainder.indexOf('$');
      push(
        'unmatched-dollar-delimiter',
        'error',
        field,
        remainder.slice(Math.max(0, idx - 25), idx + 45),
        'Unmatched "$" delimiter outside math/code'
      );
    }

    const rawTex = remainder.match(RAW_LATEX_CMD_RE);
    if (rawTex) {
      const idx = rawTex.index ?? 0;
      push(
        'raw-latex-outside-math',
        'error',
        field,
        remainder.slice(Math.max(0, idx - 25), idx + 55),
        `Raw LaTeX command "${rawTex[0]}" outside math delimiters`
      );
    }

    const plainNoTags = remainder.replace(/<[^>]+>/g, ' ');
    if (/`[^`\n]{1,60}`/.test(plainNoTags)) {
      const bm = plainNoTags.match(/`[^`\n]{1,60}`/);
      push(
        'raw-markdown-artifact',
        'warning',
        field,
        bm ? bm[0] : '',
        'Raw markdown backticks found outside <code> tag'
      );
    }

    if (field === 'bodyText' || field === 'useText' || field === 'note') {
      const rawPlain = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (/(?<![A-Za-z0-9_~])\(\s*\)|^\s*[,;.]|\bin\s+\.(?!\d)|\bsee\s+\.(?!\d)|\bfrom\s+\.(?!\d)/i.test(rawPlain)) {
        push(
          'context-sanitization-artifact',
          'warning',
          field,
          rawPlain.slice(0, 140),
          'Possible broken punctuation/sanitization artifact in context text'
        );
      }
    }
  }

  // 4. Copy text checks
  if (card.copyText !== undefined) {
    if (/<\/?(?:div|span|p|b|strong|table|tr|td|th|ul|ol|li|pre|code|br)\b[^>]*>/i.test(card.copyText)) {
      push(
        'broken-copy-text',
        'warning',
        'copyText',
        card.copyText.slice(0, 120),
        'copyText (data-t) contains raw HTML tags'
      );
    }
    if (card.codeContent) {
      for (const bc of card.copyText.matchAll(/\/\*[\s\S]*?\*\//g)) {
        const body = bc[0].slice(2, -2);
        if (looksLikeCommentedOutBlockCode(body)) {
          push(
            'commented-out-code-block',
            'error',
            'copyText',
            bc[0],
            'copyText (data-t) has executable C/C++ statement wrapped inside /* ... */ comment'
          );
        }
      }
    }
  }

  // 5. Code block checks (.fmcode)
  if (card.codeContent) {
    const code = card.codeContent;

    // 5a. Block comments
    for (const bc of code.matchAll(/\/\*[\s\S]*?\*\//g)) {
      const body = bc[0].slice(2, -2);
      if (looksLikeCommentedOutBlockCode(body)) {
        push(
          'commented-out-code-block',
          'error',
          'codeContent',
          bc[0],
          'Executable C/C++ statement appears accidentally wrapped inside /* ... */ comment'
        );
      } else if (looksLikeProseWallInCodeComment(body)) {
        push(
          'prose-wall-in-code-comment',
          'error',
          'codeContent',
          bc[0],
          'Multi-line prose/notes/reference block stuffed inside /* ... */ code comment'
        );
      }
      // Stray revision-guide section numbers inside block comments (e.g. "7.6 Virtual functions")
      if (/\b\d+\.\d+\s+[A-Z][a-z]/.test(body)) {
        push(
          'section-number-artifact',
          'warning',
          'codeContent',
          bc[0],
          'Stray section-number prefix inside code comment'
        );
      }
    }

    // 5b. Line-by-line checks with accurate multi-line block-comment state tracking
    const lines = code.split('\n');
    let inBlockComment = false;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const trimmed = ln.trim();
      const lineNum = i + 1;

      let activeCode = '';
      let inStr: string | null = null;
      let lineCommentStart = -1;
      for (let c = 0; c < ln.length; c++) {
        const ch = ln[c];
        const next = ln[c + 1];
        if (inBlockComment) {
          if (ch === '*' && next === '/') {
            inBlockComment = false;
            c++;
          }
          continue;
        }
        if (inStr) {
          if (ch === '\\' && next !== undefined) c++;
          else if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === '/' && next === '/') {
          lineCommentStart = c;
          break;
        }
        if (ch === '/' && next === '*') {
          inBlockComment = true;
          c++;
          continue;
        }
        if (ch === '"' || ch === "'") {
          inStr = ch;
          continue;
        }
        activeCode += ch;
      }

      if (lineCommentStart !== -1 && activeCode.trim() === '') {
        const commentText = ln.slice(lineCommentStart).trim();
        const rest = commentText.slice(2).trim();
        if (rest.includes('//')) {
          push(
            'double-line-comment',
            'error',
            'codeContent',
            `L${lineNum}: ${commentText}`,
            'Double "//" comment on a single line (likely code with trailing comment was commented out)'
          );
        } else if (looksLikeCommentedOutLineCode(rest)) {
          push(
            'commented-out-code-line',
            'error',
            'codeContent',
            `L${lineNum}: ${commentText}`,
            'Full-line "//" comment contains commented-out code or pseudo-code'
          );
        }
      }

      // Glued block comment before active code on the same line: "/* 6 bytes */ char *p = ..." or ";/* ... */ code"
      if (
        /;\s*\/\*(?:[^*]|\*(?!\/))*\*\/\s*\S/.test(trimmed) ||
        /^\/\*(?:[^*]|\*(?!\/))*\*\/\s+[a-zA-Z_]\w*/.test(trimmed)
      ) {
        push(
          'glued-block-comment',
          'error',
          'codeContent',
          `L${lineNum}: ${trimmed}`,
          'Block comment glued inline before an executable statement on the same line'
        );
      }

      // Missing space after closing brace before while/else/catch
      if (/\}(?:while|else|catch)\b/.test(activeCode)) {
        push(
          'malformed-code-spacing',
          'warning',
          'codeContent',
          `L${lineNum}: ${trimmed}`,
          'Missing space between closing brace "}" and keyword'
        );
      }

      // Pseudo-code ellipsis (...) or range (..) in active code outside strings and comments
      if (
        (/\.\.\./.test(activeCode) &&
          !/catch\s*\(\s*\.\.\.\s*\)/.test(activeCode) &&
          !/#\s*define\b/.test(activeCode)) ||
        /(?<!\.)\.\.(?!\.)/.test(activeCode)
      ) {
        push(
          'pseudocode-ellipsis-in-code',
          'error',
          'codeContent',
          `L${lineNum}: ${trimmed}`,
          'Pseudo-code ellipsis "..." or range ".." inside active code statement'
        );
      }
    }

    // 5c. Balanced delimiters
    const delimErr = checkCodeDelimiters(code);
    if (delimErr) {
      push('unbalanced-code-delimiters', 'error', 'codeContent', code.slice(0, 120), delimErr);
    }
  }

  return issues;
}

export function auditContentSources(
  sources: ReadonlyArray<{ name: string; html: string }>
): AuditReport {
  let totalSections = 0;
  let totalCards = 0;
  let codeCards = 0;
  const issues: CardAuditIssue[] = [];
  const countsByCategory: Record<string, number> = {};
  const countsByCourse: Record<string, number> = {};

  const parsedBySource = sources.map((src) => ({
    name: src.name,
    sections: parseTopicSections(src.html),
  }));
  const validSectionIds = new Set<string>();
  for (const item of parsedBySource) {
    for (const sec of item.sections) {
      validSectionIds.add(sec.id);
    }
  }

  for (const item of parsedBySource) {
    const sections: TopicSectionRecord[] = item.sections;
    totalSections += sections.length;
    for (const section of sections) {
      section.cards.forEach((card, idx) => {
        totalCards++;
        if (card.codeContent) codeCards++;
        const cardIssues = auditCard(card, {
          sourceFile: item.name,
          sectionId: section.id,
          sectionTitle: section.title,
          cardIndex: idx + 1,
          validSectionIds,
        });
        for (const issue of cardIssues) {
          issues.push(issue);
          countsByCategory[issue.category] = (countsByCategory[issue.category] || 0) + 1;
          countsByCourse[issue.course] = (countsByCourse[issue.course] || 0) + 1;
        }
      });
    }
  }

  return {
    totalSections,
    totalCards,
    codeCards,
    issues,
    countsByCategory,
    countsByCourse,
  };
}
