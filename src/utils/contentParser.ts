import type { FormulaCardRecord } from './formulaSearch';
import { decodeHtmlEntities } from './mathParser';
import type { CourseCode } from './storageSafety';
import { cleanCardTitle, extractValidExamTag } from './titleCleaner';

export interface TopicSectionRecord {
  id: string;
  course: CourseCode;
  title: string;
  freqBadge?: string;
  isOpenByDefault: boolean;
  cards: FormulaCardRecord[];
}

export interface NavLinkRecord {
  href: string;
  targetId: string;
  label: string;
}

export interface NavCourseGroupRecord {
  course: CourseCode;
  badgeText: string;
  links: NavLinkRecord[];
}

export interface ParsedNavContent {
  navF: NavCourseGroupRecord[];
  navT: NavCourseGroupRecord[];
}

/**
 * Curated variable/parameter explanations and practical/exam applications for cards
 * whose original HTML either had no `.fmw`/`.fmu` or only cited a PDF/revision-guide section number.
 */
const CURATED_CONTEXT_FALLBACKS: Record<
  string,
  { bodyText?: string; useText?: string }
> = {
  'eee-basic:8': {
    bodyText:
      '$R_{\\text{ammeter}} = 0\\,\\Omega$ (ideal short circuit in series); $R_{\\text{voltmeter}} = \\infty\\,\\Omega$ (ideal open circuit in parallel).',
    useText:
      'Replace ideal ammeters with a wire and remove ideal voltmeters as open branches before writing nodal or mesh equations; read $V$ across the open terminals afterward.',
  },
  'eee-delta:5': {
    bodyText:
      '$R_{\\text{eq}} = V_T / I_T$ across the target terminal pair $(a, b)$ with all independent sources inside the network deactivated.',
    useText:
      'Use series/parallel + $\\Delta\\text{--}Y$ reduction when no dependent sources exist; apply a $1\\text{ V}$ or $1\\text{ A}$ test source at $(a, b)$ whenever dependent sources are present.',
  },
  'eee-trans:8': {
    bodyText:
      '$t_1, t_2$ = switching instants; $v_C(t_k^+) = v_C(t_k^-)$ and $i_L(t_k^+) = i_L(t_k^-)$ enforce energy continuity across each switching event.',
    useText:
      'Solve each time interval $(0 < t < t_1$, $t > t_1)$ as a separate first-order step response, using the final value at $t_1^-$ as the initial condition at $t_1^+$.',
  },
  'eee-mag:6': {
    bodyText:
      '$\\Phi = B \\cdot A$ = magnetic flux ($\\text{Wb}$); $\\mathcal{F} = N I = \\sum H_k \\ell_k = \\Phi \\mathcal{R}_{\\text{eq}}$ = magnetomotive force ($\\text{A}\\cdot\\text{turns}$).',
    useText:
      'Given required flux $\\Phi$ or flux density $B = \\Phi/A$, compute $H_k$ in each core section and air gap ($H_g = B_g/\\mu_0$), then sum $NI = \\sum H_k \\ell_k$ to find coil current $I$.',
  },
  'eee-dual:2': {
    bodyText:
      'Series $\\leftrightarrow$ Parallel, $R \\leftrightarrow G$, $L \\leftrightarrow C$, $V_s \\leftrightarrow I_s$, KVL mesh $\\leftrightarrow$ KCL node ($n$ meshes $\\to n$ principal nodes plus reference).',
    useText:
      'Place one node inside each mesh of the original planar circuit plus one outer reference node; draw dual elements across every shared boundary.',
  },
  'cse-c:6': {
    bodyText:
      'Covers integer division truncation (<code>a/b</code> vs <code>(double)a/b</code>), sign of modulo (<code>-7 % 2 == -1</code>), short-circuit logic (<code>&amp;&amp;</code>, <code>||</code>), and pointer/array decay rules.',
  },
  'cse-c:7': {
    bodyText:
      '<code>sizeof(char) = 1</code>, <code>int = 4</code>, <code>double = 8</code> bytes; arithmetic promotion converts <code>char</code>/<code>short</code> to <code>int</code> and mixed <code>int</code>/<code>double</code> expressions to <code>double</code>.',
  },
  'cse-c:8': {
    bodyText:
      '<code>%[flags][width][.precision]specifier</code> controls formatted I/O; <code>scanf("%lf", &amp;d)</code> requires <code>%lf</code> and address-of <code>&amp;</code> for scalar variables.',
  },
  'cse-c:9': {
    bodyText:
      'Focuses on sequence-point undefined behavior (<code>i++ * ++i</code>), dangling-else binding, uninitialized local garbage values, off-by-one loop bounds, and missing <code>break</code> fallthrough.',
  },
  'cse-lib:1': {
    bodyText:
      '<code>s</code>, <code>d</code>, <code>t</code> = null-terminated <code>char*</code> buffers; <code>n</code> = byte/character bound; <code>math.h</code> functions take and return <code>double</code> in radians.',
  },
  'cse-ptr:7': {
    bodyText:
      '<code>p</code> = typed pointer (advances by <code>sizeof(*p)</code> bytes per increment); <code>B</code> = base address of contiguous row-major array <code>a[R][C]</code>; <code>m</code> = heap row-pointer array.',
  },
  'cse-str:8': {
    bodyText:
      '<code>a[n]</code> = 1D array of <code>n</code> elements; <code>m[R][C]</code> = row-major 2D matrix where element <code>(i, j)</code> resides at byte offset <code>(i*C + j) * sizeof(type)</code>.',
  },
  'cse-str:9': {
    bodyText:
      '<code>s</code>, <code>d</code>, <code>t</code> = null-terminated C strings ending at sentinel <code>\'\\0\'</code> (ASCII 0); in-place two-pointer algorithms use indices <code>L = 0</code> and <code>R = len - 1</code>.',
  },
  'cse-file:8': {
    bodyText:
      '<code>struct</code> allocates sum of member sizes (plus alignment padding); <code>union</code> overlays all members at offset 0 (size = largest member); <code>FILE *fp</code> manages buffered stream state.',
  },
  'cse-bit:5': {
    bodyText:
      '<code>x</code> = 32-bit integer operand; <code>k</code> = 0-indexed bit position from LSB ($0 \\le k < 31$); masks use <code>1U &lt;&lt; k</code> to avoid signed-overflow undefined behavior on bit 31.',
  },
  'cse-bit:6': {
    bodyText:
      '<code>x &amp; (x - 1)</code> clears the lowest set bit; <code>x &amp; -x</code> isolates the lowest set bit; unsigned shift <code>(unsigned int)x &gt;&gt; k</code> forces zero-fill logical shift.',
  },
  'cse-num:1': {
    bodyText:
      'For an $N$-bit signed integer, range is $-2^{N-1}$ to $2^{N-1}-1$; MSB $b_{N-1}=1$ indicates a negative value with magnitude $\\sim x + 1$ ($2^N - x$).',
  },
  'cse-algo:6': {
    bodyText:
      'Every recursive function requires a terminating base case (e.g., <code>n == 0</code>) and a state transition that strictly reduces distance to the base case on each stack frame.',
  },
  'cse-pat:5': {
    bodyText:
      '<code>n</code> = number of rows; outer loop index <code>i</code> ($1 \\le i \\le n$) tracks the current row, while inner loops print leading spaces ($n - i$) followed by $2i - 1$ or $i$ symbols.',
  },
  'cse-cpp:7': {
    bodyText:
      '<code>this</code> = implicit pointer to invoking object; <code>virtual</code> enables dynamic dispatch via per-class <code>vtable</code> and per-object <code>vptr</code> at runtime.',
  },
  't-cse1:3': {
    bodyText:
      '<code>auto</code> (stack, block scope, uninitialized garbage) vs. <code>static</code>/<code>extern</code> (data/BSS segment, program lifetime, zero-initialized by default).',
  },
  't-cse1:4': {
    bodyText:
      'Covers short-circuit evaluation order, integer promotion before bitwise/arithmetic operators, and two’s complement single-zero representation ($-2^{n-1} \\dots 2^{n-1}-1$).',
  },
  't-cse2:3': {
    bodyText:
      'Reference <code>T &amp;r = x</code> is a non-null, non-reseatable alias; <code>new T(...)</code> allocates typed heap memory and invokes the constructor (paired with <code>delete</code> / <code>delete[]</code>).',
  },
};

/**
 * Strips leading `Where:`, `Conditions:`, `Use:`, or `Exam Application:` labels from `.fmw` / `.fmu` HTML.
 */
export function stripContextPrefix(html: string): string {
  if (!html) return '';
  return html
    .replace(
      /^\s*(?:<(?:b|strong)>\s*)?(?:Where|Conditions|Use|Exam Application)\s*:?\s*(?:<\/(?:b|strong)>\s*)?:?\s*/i,
      ''
    )
    .trim();
}

/**
 * Removes all mentions of uploaded PDF filenames, revision guides, lecture/class notes,
 * textbook author/chapter/section/problem numbers, and stray section citations from
 * `.fmw`, `.fmu`, and `.fmnote` strings while preserving real BUET exam-year references.
 */
export function sanitizeContextText(
  rawHtml: string | undefined,
  cardTitle: string,
  topicTitle: string,
  course?: string
): string {
  if (!rawHtml) return '';
  let text = stripContextPrefix(rawHtml);
  if (!text) return '';

  // 1. Remove full clauses or sentences referencing revision guides, class/lecture notes, or handouts (do not stop at decimal dots like 2.8)
  text = text.replace(
    /(?:^|(?<!\d)\.\s+|;\s*)(?:Directly\s+(?:covered|tested|asked)\s+in\s+|From\s+|In\s+|See\s+|Source\s*:\s*|Covered\s+in\s+)?(?:BUET\s+)?(?:CSE\s*10[19]|EEE\s*101|MATH\s*15[79]|PHY\s*121|PHY\s*165)?\s*(?:[A-Za-z\s&]+?\s+)?(?:Complete\s+)?(?:Revision\s+Guide|Lecture\s+Notes|Class\s+Notes|Study\s+Guide|Handout|Cheatsheet|Formula\s+Sheet)(?:[^.;]|\.\d)*(?:\.(?!\d)|;|$)/gi,
    ' '
  );

  // 2. Remove inline mentions of revision guides / lecture notes / class notes
  text = text.replace(
    /(?:from\s+|in\s+|see\s+|source:\s*|covered\s+in\s+)?(?:buet\s+)?(?:cse\s*10[19]|eee\s*101|math\s*15[79]|phy\s*121)?\s*(?:complete\s+)?(?:revision\s+guide|lecture\s+notes|class\s+notes|study\s+guide|handout|cheatsheet|formula\s+sheet)(?:\s*\([^)]*\))?\.?/gi,
    ''
  );

  // 3. Remove "Textbook Ref: ..." sentences or clauses
  text = text.replace(
    /Textbook\s+Ref\s*:\s*(?:[^.;]|\.\d)+(?:\.(?!\d)|;|$)/gi,
    ' '
  );

  // 4. Remove parenthetical textbook / section / page / problem citations e.g. "(Sadiku Prob. 6.57)", "(pp. 7–9)", "(Sec. 4.1)"
  text = text.replace(
    /\(\s*(?:[^()]*\b(?:Sadiku|Boylestad|Alexander|Grewal|Kreyszig|Schaum(?:'s)?|Kernighan|Ritchie|Balagurusamy|Herbert\s+Schildt|Schildt|Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?|pp\.?|Pages?|Lec(?:ture)?s?\.?|Slides?|Prob(?:lem)?s?\.?)\b[^()]*)\)/gi,
    ''
  );

  // 5. Remove inline textbook author + section/chapter/problem citations
  text = text.replace(
    /\b(?:Sadiku|Boylestad|Alexander|Grewal|Kreyszig|Schaum(?:'s)?|Kernighan(?:\s*&(?:amp;)?\s*Ritchie)?|Ritchie|Balagurusamy|Herbert\s+Schildt|Schildt)(?:\s*,\s*Teach\s+Yourself\s+C(?:\+\+)?)?(?:\s*\([^)]*\))?\s*(?:[,:]?\s*(?:Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?|Prob(?:lem)?s?\.?|Ex(?:ample)?s?\.?)\s*\d+(?:\.\d+)*(?:\s*[–,-]\s*\d+(?:\.\d+)*)*)*/gi,
    ''
  );

  // 6. Remove standalone Section / Chapter / Page number references
  text = text.replace(
    /\b(?:Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?|Pages?|pp\.?)\s*\d+(?:\.\d+)*(?:\s*(?:&|and|[–,-])\s*(?:Sec(?:t|tion)?s?\.?\s*|Pages?\s*|pp\.?\s*)?\d+(?:\.\d+)*)*(?:\s*\([^)]*\))?/gi,
    ''
  );

  // 7. Clean leftover empty parens, dangling connectors, and duplicate spaces
  text = text
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/([,.;:])\s*[,.;:]+/g, '$1')
    .replace(/^\s*(?:[,;:.–—-]|and|&|&amp;)\s*/i, '')
    .replace(/\s*(?:[,;:–—-]|and|&|&amp;)\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 8. Check if remaining plain text is meaningless boilerplate (< 4 chars or just repeats title/topic/course)
  const plain = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length < 4 || !/[a-zA-Z]/.test(plain)) return '';

  const normPlain = plain.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normTitle = cardTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normTopic = topicTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normCourse = (course || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  if (
    normPlain === normTitle ||
    normPlain === normTopic ||
    normPlain === normCourse ||
    normPlain === `cse 109` ||
    normPlain === `${normCourse} ${normTopic}`
  ) {
    return '';
  }

  return text;
}

/**
 * Cleans section-number prefixes and textbook/guide parentheticals inside `.fmhtml` rich content
 * while preserving all academic points, tables, and formulas.
 */
export function sanitizeHtmlContentArtifacts(html?: string): string | undefined {
  if (!html) return undefined;
  let out = html;

  // Strip leading numbered section prefixes inside bold headings e.g. "<b>1.1 Top 40 Exam Reminders" -> "<b>Top 40 Exam Reminders"
  out = out.replace(
    /(<(?:b|strong)>\s*)\d+\.\d+(?:\.\d+)?\s+(?=[A-Za-z<])/g,
    '$1'
  );

  // Strip parenthetical textbook / Sec. / Rev. Guide tags inside .fmhtml headings
  out = out.replace(
    /\s*\((?:[^()]*\b(?:Schildt|Sadiku|Rev\.?\s*Guide|Revision\s+Guide|Sec(?:t|tion)?s?\.?|Ch(?:ap)?\.?)\b[^()]*)\)/gi,
    ''
  );

  return out;
}

/**
 * Generates a concise, domain-accurate explanation of a card's variables, parameters,
 * or practical/exam purpose whenever `bodyText` (`PARAMETERS // CONTEXT`) or `useText`
 * (`APPLICATION // STRATEGY`) is empty after stripping PDF/section artifacts.
 */
function ensureMeaningfulCardContext(
  cardId: string,
  course: CourseCode,
  cardTitle: string,
  topicTitle: string,
  rawLatex: string,
  codeContent: string | undefined,
  htmlContent: string | undefined,
  cleanedBodyText: string,
  cleanedUseText: string | undefined
): { bodyText: string; useText?: string } {
  const curated = CURATED_CONTEXT_FALLBACKS[cardId];
  let bodyText = curated?.bodyText || cleanedBodyText || '';
  let useText = cleanedUseText || curated?.useText;

  if (!bodyText) {
    if (course === 'CSE' || codeContent) {
      bodyText = `Defines core syntax, pointer/index invariants, and boundary conditions for ${cardTitle.toLowerCase()} in ${topicTitle}.`;
    } else if (rawLatex) {
      bodyText = `Relates the primary circuit/mathematical quantities in ${cardTitle} under standard ${topicTitle.toLowerCase()} assumptions.`;
    } else if (htmlContent) {
      bodyText = `Key conditions, parameter definitions, and structural properties governing ${cardTitle.toLowerCase()}.`;
    } else {
      bodyText = `Fundamental parameter relationships and operating conditions for ${cardTitle}.`;
    }
  }

  if (!useText) {
    if (course === 'EEE') {
      useText = `Apply directly when setting up KCL/KVL, equivalent network reductions, or transient/phasor equations in ${topicTitle.toLowerCase()} problems.`;
    } else if (course === 'M157' || course === 'M159') {
      useText = `Verify continuity, differentiability, or domain bounds first, then substitute directly to evaluate ${topicTitle.toLowerCase()} exam problems.`;
    } else if (course === 'PHY') {
      useText = `Convert all wavelengths, lengths, and thermodynamic quantities to consistent SI units before substituting into ${cardTitle.toLowerCase()}.`;
    } else if (course === 'CSE') {
      useText = `Check null-terminator ('\\0'), 0-based array bounds, and base/corner cases when tracing output or writing ${topicTitle.toLowerCase()} code.`;
    }
  }

  return { bodyText, useText };
}

/**
 * Splits a single crammed C/C++ line (containing `{`, `;`, `}` on one line) into
 * individual logical lines while respecting string literals `"..."`, char literals `'...'`,
 * comments, `for (...)` headers, and `= { ... }` array/struct initializers.
 */
function unpackCrammedCseLine(line: string): string[] {
  // Collapse excessive padding spaces before trailing `//` comments
  const trimmed = line.trim().replace(/(\S)\s{3,}(\/\/.*)$/, '$1  $2');
  if (!trimmed) return [''];

  // Keep preprocessor directives, pure comments, and short single statements intact
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('//') ||
    (trimmed.startsWith('/*') && trimmed.endsWith('*/'))
  ) {
    return [trimmed];
  }

  // Keep compact switch case table rows (e.g., "case 'I': return 1; case 'V': return 5;") intact
  if (/^case\s+[^:]+:.*case\s+[^:]+:/.test(trimmed)) {
    return [trimmed];
  }

  const hasBraces = trimmed.includes('{') || trimmed.includes('}');
  const semicolonCount = (trimmed.match(/;/g) || []).length;

  // Decide whether this line needs unpacking:
  // 1. Multiple closing braces `} }` or statement followed by closing brace `; }`
  // 2. Opening brace `{` followed by statements on the same line (not an `= { ... }` initializer)
  // 3. Long line (> 72 chars) with multiple statements or braces
  const hasMultipleCloseBraces = /\}\s*\}/.test(trimmed) && !/=\s*\{/.test(trimmed);
  const hasTrailingCloseBraceAfterStmt = /;\s*\}\s*$/.test(trimmed) && !trimmed.includes('{');
  const hasOpenBraceWithCode =
    /\{\s*[^}\s]/.test(trimmed) &&
    !/=\s*\{/.test(trimmed) &&
    (trimmed.length > 62 || !trimmed.endsWith('}') || semicolonCount >= 2);
  const hasMultipleTopStatements = trimmed.length > 74 && semicolonCount >= 2;

  if (
    !hasMultipleCloseBraces &&
    !hasTrailingCloseBraceAfterStmt &&
    !hasOpenBraceWithCode &&
    !hasMultipleTopStatements &&
    !hasBraces
  ) {
    return [trimmed];
  }
  if (
    !hasMultipleCloseBraces &&
    !hasTrailingCloseBraceAfterStmt &&
    !hasOpenBraceWithCode &&
    trimmed.length <= 72
  ) {
    return [trimmed];
  }

  const out: string[] = [];
  let buf = '';
  let parenDepth = 0;
  let initBraceDepth = 0;
  let inStr: string | null = null;
  let inBlockComment = false;

  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = '';
  };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    const next = trimmed[i + 1];

    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') {
        buf += '/';
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (inStr) {
      buf += ch;
      if (ch === '\\' && next !== undefined) {
        buf += next;
        i++;
      } else if (ch === inStr) {
        inStr = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      const commentRest = trimmed.slice(i).trim();
      if (buf.trim()) {
        buf = `${buf.trim()} ${commentRest}`;
        flush();
      } else if (out.length > 0) {
        out[out.length - 1] = `${out[out.length - 1]} ${commentRest}`;
      } else {
        out.push(commentRest);
      }
      break;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      buf += '/*';
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inStr = ch;
      buf += ch;
      continue;
    }

    if (ch === '(') {
      parenDepth++;
      buf += ch;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      buf += ch;
      continue;
    }

    if (ch === '{' && parenDepth === 0) {
      const before = buf.trim();
      if (/=\s*$/.test(before) || initBraceDepth > 0) {
        initBraceDepth++;
        buf += ch;
        continue;
      }
      buf = `${buf.trimEnd()} {`;
      flush();
      continue;
    }

    if (ch === '}' && parenDepth === 0) {
      if (initBraceDepth > 0) {
        initBraceDepth--;
        buf += ch;
        continue;
      }
      flush();
      if (next === ';') {
        out.push('};');
        i++;
      } else {
        out.push('}');
      }
      continue;
    }

    if (ch === ';' && parenDepth === 0 && initBraceDepth === 0) {
      buf += ';';
      if (
        trimmed.length > 72 ||
        hasOpenBraceWithCode ||
        hasTrailingCloseBraceAfterStmt ||
        hasMultipleCloseBraces
      ) {
        flush();
      }
      continue;
    }

    buf += ch;
  }

  flush();
  return out.length > 0 ? out : [trimmed];
}

/**
 * Deterministic C/C++ AST-style Code Formatter (`formatCseCodeBlock`):
 * - Strips section-number prefixes in comments (e.g. `/* 4.1 Array syntax * /` -> `/* Array syntax * /`).
 * - Unpacks crammed one-liner functions, `for`/`while` loops, and multi-brace lines into clean lines.
 * - Re-indents with consistent 2-space K&R indentation based on `{` and `}` depth.
 */
export function formatCseCodeBlock(rawCode: string): string {
  if (!rawCode) return '';

  // 1. Normalize line endings and strip section-number prefixes inside comments
  const cleaned = rawCode
    .replace(/\r\n?/g, '\n')
    .replace(/(\/\*\s*)\d+\.\d+(?:\.\d+)?\s+(?=[A-Za-z])/g, '$1')
    .replace(/\s*\((?:Rev\.?\s*Guide\s*)?Sec(?:t|tion)?s?\.?\s*[\d.,\s–&-]+\)/gi, '')
    .trim();

  const rawLines = cleaned.split('\n');
  const unpackedLines: string[] = [];

  for (const rawLine of rawLines) {
    // Normalize excessive whitespace before `{` in function signatures: `int fn(char *s)        {` -> `int fn(char *s) {`
    const normalizedSig = rawLine.replace(/^(\s*[^/\n]+?\))\s{2,}\{/g, '$1 {');
    const pieces = unpackCrammedCseLine(normalizedSig);
    for (const p of pieces) {
      unpackedLines.push(p);
    }
  }

  // 2. Re-indent with consistent 2-space K&R indentation based on `{` and `}` depth
  const formatted: string[] = [];
  let indentDepth = 0;
  let inBlockComment = false;

  for (let i = 0; i < unpackedLines.length; i++) {
    const trimmed = unpackedLines[i].trim();
    if (!trimmed) {
      if (formatted.length > 0 && formatted[formatted.length - 1] !== '') {
        formatted.push('');
      }
      continue;
    }

    if (inBlockComment) {
      formatted.push(`${'  '.repeat(indentDepth)} ${trimmed}`);
      if (trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      formatted.push(`${'  '.repeat(indentDepth)}${trimmed}`);
      inBlockComment = true;
      continue;
    }

    // Count leading closing braces `}` so the line is dedented before printing
    let leadingClose = 0;
    while (leadingClose < trimmed.length && trimmed[leadingClose] === '}') {
      leadingClose++;
    }
    const lineDepth = Math.max(0, indentDepth - (leadingClose > 0 ? 1 : 0));

    // Preprocessor directives `#include` / `#define` at top level stay at column 0
    const isPreprocessor = trimmed.startsWith('#');
    const isAccessLabel = /^(?:public|private|protected)\s*:$/.test(trimmed);
    const effectiveDepth = isPreprocessor
      ? 0
      : isAccessLabel
      ? Math.max(0, lineDepth - 1)
      : lineDepth;

    formatted.push(`${'  '.repeat(effectiveDepth)}${trimmed}`);

    // Update indentDepth by scanning braces outside strings and comments on this line
    let inStr: string | null = null;
    let localComment = false;
    for (let c = 0; c < trimmed.length; c++) {
      const ch = trimmed[c];
      const next = trimmed[c + 1];
      if (localComment) {
        if (ch === '*' && next === '/') {
          localComment = false;
          c++;
        }
        continue;
      }
      if (inStr) {
        if (ch === '\\') c++;
        else if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '/' && next === '/') break;
      if (ch === '/' && next === '*') {
        localComment = true;
        c++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        continue;
      }
      if (ch === '{') indentDepth++;
      else if (ch === '}') indentDepth = Math.max(0, indentDepth - 1);
    }
  }

  return formatted.join('\n').trim();
}

/**
 * Extracts the inner HTML of `<div class="${className}">...</div>` while properly
 * balancing any nested `<div...>` / `</div>` pairs inside it.
 */
function extractBalancedDivContent(html: string, className: string): string | undefined {
  const startToken = `<div class="${className}">`;
  const startIdx = html.indexOf(startToken);
  if (startIdx === -1) return undefined;
  const contentStart = startIdx + startToken.length;
  let depth = 1;
  let i = contentStart;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const charAfter = html[nextOpen + 4];
      if (charAfter === ' ' || charAfter === '>' || charAfter === '\t' || charAfter === '\n') {
        depth++;
      }
      i = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, nextClose).trim();
      }
      i = nextClose + 6;
    }
  }
  return undefined;
}

/**
 * Finds the closing `>` of an opening HTML tag while ignoring any `>` characters
 * that appear inside quoted attribute values.
 *
 * @param rawTagContent Remainder of the opening tag after splitting on its prefix
 * @param startsInsideDoubleQuote Set to `true` when the split prefix opened a `"` (e.g. `<div class="fmi `)
 */
export function findOpeningTagEndIndex(
  rawTagContent: string,
  startsInsideDoubleQuote = false
): number {
  let quoteChar: string | null = startsInsideDoubleQuote ? '"' : null;
  for (let i = 0; i < rawTagContent.length; i++) {
    const ch = rawTagContent[i];
    if (quoteChar !== null) {
      if (ch === quoteChar) {
        quoteChar = null;
      }
      continue;
    }
    if (ch === '"') {
      quoteChar = '"';
      continue;
    }
    if (ch === "'" && i > 0 && rawTagContent[i - 1] === '=') {
      quoteChar = "'";
      continue;
    }
    if (ch === '>') {
      return i;
    }
  }
  return -1;
}

/**
 * Parses `<details class="fmt" ...>` topic accordions and `.fmi` cards from
 * `content-fmroot.html` or `content-thmroot.html`, applying:
 * - `cleanCardTitle` & `extractValidExamTag` (real exam years only, no `Sec.` or stray digits)
 * - `sanitizeContextText` & `ensureMeaningfulCardContext` (clean `.fmw`/`.fmu` with guaranteed meaningful context)
 * - `sanitizeHtmlContentArtifacts`
 * - `formatCseCodeBlock` (clean K&R 2-space formatted C/C++ code)
 */
export function parseTopicSections(html: string): TopicSectionRecord[] {
  if (!html) return [];
  const rawSections = html.split('<details class="fmt"').slice(1);
  const sections: TopicSectionRecord[] = [];

  for (const rawSec of rawSections) {
    const openTagEnd = findOpeningTagEndIndex(rawSec, false);
    if (openTagEnd === -1) continue;
    const openTagAttrs = rawSec.slice(0, openTagEnd);
    const id = (openTagAttrs.match(/id="([^"]+)"/) || [])[1] || '';
    const course = ((openTagAttrs.match(/data-c="([^"]+)"/) || [])[1] || 'ALL') as CourseCode;
    const isOpenByDefault = /\bopen\b/.test(openTagAttrs);

    const summaryMatch = rawSec.match(/<summary>([\s\S]*?)<\/summary>/);
    const summaryHtml = summaryMatch ? summaryMatch[1] : '';
    const titleRaw = (summaryHtml.match(/<span class="fmtt">([\s\S]*?)<\/span>/) || [])[1] || '';
    const title = decodeHtmlEntities(titleRaw).trim();
    const freqRaw = (summaryHtml.match(/<span class="fmfreq"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
    const freqBadge = freqRaw ? decodeHtmlEntities(freqRaw).trim() : undefined;

    const rawCards = rawSec.split('<div class="fmi ').slice(1);
    const cards: FormulaCardRecord[] = [];

    for (const rawCard of rawCards) {
      const cardTagEnd = findOpeningTagEndIndex(rawCard, true);
      if (cardTagEnd === -1) continue;
      const cardAttrs = rawCard.slice(0, cardTagEnd);
      const cardTypeClass = (cardAttrs.match(/^([a-zA-Z0-9_-]+)/) || [])[1] || 'tex';
      const cardId = (cardAttrs.match(/data-k="([^"]+)"/) || [])[1] || '';
      const keywordsRaw = (cardAttrs.match(/data-s="([^"]*)"/) || [])[1] || '';
      const keywords = decodeHtmlEntities(keywordsRaw);

      const fmnRaw =
        (rawCard.match(/<span class="fmn">([\s\S]*?)<\/span>\s*<span class="fmb">/) || [])[1] || '';
      const badgeMatch = fmnRaw.match(/<span class="thty">([\s\S]*?)<\/span>/);
      const badge = badgeMatch ? decodeHtmlEntities(badgeMatch[1]).trim() : undefined;
      const rawCardTitle = decodeHtmlEntities(
        fmnRaw.replace(/<span class="thty">[\s\S]*?<\/span>/g, '')
      ).trim();
      const cleanedTitle = cleanCardTitle(rawCardTitle, cardId);

      const copyAttrMatch = rawCard.match(/data-t="([^"]*)"/);
      const copyText = copyAttrMatch
        ? decodeHtmlEntities(copyAttrMatch[1])
        : undefined;

      const bodyStartIdx = rawCard.indexOf('<div class="fmbody">');
      const bodyHtml = bodyStartIdx !== -1 ? rawCard.slice(bodyStartIdx) : '';

      const fmmInner = extractBalancedDivContent(bodyHtml, 'fmm');
      let rawLatex = '';
      let fmmDisplayMode = true;
      if (fmmInner !== undefined) {
        if (fmmInner.startsWith('$$') && fmmInner.endsWith('$$')) {
          rawLatex = decodeHtmlEntities(fmmInner.slice(2, -2).trim());
          fmmDisplayMode = true;
        } else if (fmmInner.startsWith('$') && fmmInner.endsWith('$')) {
          rawLatex = decodeHtmlEntities(fmmInner.slice(1, -1).trim());
          fmmDisplayMode = false;
        } else {
          rawLatex = decodeHtmlEntities(fmmInner);
          fmmDisplayMode = true;
        }
      }

      const rawHtmlContent = extractBalancedDivContent(bodyHtml, 'fmhtml');
      const htmlContent = sanitizeHtmlContentArtifacts(rawHtmlContent);

      const codeMatch = bodyHtml.match(/<pre class="fmcode"><code>([\s\S]*?)<\/code><\/pre>/);
      const rawCodeContent = codeMatch ? decodeHtmlEntities(codeMatch[1]) : undefined;
      const codeContent = rawCodeContent ? formatCseCodeBlock(rawCodeContent) : undefined;

      const rawBodyText = extractBalancedDivContent(bodyHtml, 'fmw') ?? '';
      const rawUseText = extractBalancedDivContent(bodyHtml, 'fmu');
      const rawNote = extractBalancedDivContent(bodyHtml, 'fmnote');
      const seeAlso = extractBalancedDivContent(bodyHtml, 'thsee');

      const sanitizedBody = sanitizeContextText(rawBodyText, cleanedTitle.title, title, course);
      const sanitizedUse = rawUseText
        ? sanitizeContextText(rawUseText, cleanedTitle.title, title, course) || undefined
        : undefined;
      const note = rawNote
        ? sanitizeContextText(rawNote, cleanedTitle.title, title, course) || undefined
        : undefined;

      const { bodyText, useText } = ensureMeaningfulCardContext(
        cardId,
        course,
        cleanedTitle.title,
        title,
        rawLatex,
        codeContent,
        htmlContent,
        sanitizedBody,
        sanitizedUse
      );

      // If no examTag was in the title, check if rawBodyText/rawUseText contained a genuine exam year
      const examTag =
        cleanedTitle.examTag ||
        extractValidExamTag(rawBodyText) ||
        extractValidExamTag(rawUseText);

      const fmdMatch = bodyHtml.match(
        /<details class="fmd">\s*<summary>([\s\S]*?)<\/summary>\s*<ol class="fmsteps">([\s\S]*?)<\/ol>\s*<\/details>/
      );
      let stepsSummary: string | undefined;
      let steps: string[] | undefined;
      if (fmdMatch) {
        stepsSummary = decodeHtmlEntities(fmdMatch[1]).trim();
        const stepsListHtml = fmdMatch[2];
        const liMatches = [...stepsListHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)];
        steps = liMatches.map((m) => m[1].trim());
      }

      cards.push({
        id: cardId,
        course,
        topicId: id,
        topicTitle: title,
        title: cleanedTitle.title,
        fullTitle: rawCardTitle,
        examTag,
        badge,
        cardTypeClass,
        copyText,
        keywords,
        rawLatex,
        fmmDisplayMode,
        htmlContent,
        codeContent,
        bodyText,
        useText,
        stepsSummary,
        steps,
        note,
        seeAlso,
      });
    }

    sections.push({
      id,
      course,
      title,
      freqBadge,
      isOpenByDefault,
      cards,
    });
  }

  return sections;
}

function parseSingleNavBlock(navBlockHtml: string): NavCourseGroupRecord[] {
  if (!navBlockHtml) return [];
  const rowMatches = [
    ...navBlockHtml.matchAll(/<div class="fmnavrow" data-c="([^"]+)">([\s\S]*?)<\/div>/g),
  ];
  return rowMatches.map((m) => {
    const course = m[1] as CourseCode;
    const inner = m[2];
    const badgeRaw = (inner.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || course;
    const badgeText = decodeHtmlEntities(badgeRaw).trim();
    const linkMatches = [
      ...inner.matchAll(/<a href="([^"]+)" class="fmlink">([\s\S]*?)<\/a>/g),
    ];
    const links: NavLinkRecord[] = linkMatches.map((lm) => {
      const href = lm[1];
      const targetId = href.startsWith('#') ? href.slice(1) : href;
      const label = decodeHtmlEntities(lm[2]).trim();
      return { href, targetId, label };
    });
    return { course, badgeText, links };
  });
}

/**
 * Parses `content-nav.html` into structured navigation groups for `#navF` and `#navT`.
 */
export function parseNavContent(navHtml: string): ParsedNavContent {
  const navFMatch = navHtml.match(/<nav class="fmnav" id="navF"[^>]*>([\s\S]*?)<\/nav>/);
  const navTMatch = navHtml.match(/<nav class="fmnav" id="navT"[^>]*>([\s\S]*?)<\/nav>/);
  return {
    navF: parseSingleNavBlock(navFMatch ? navFMatch[1] : ''),
    navT: parseSingleNavBlock(navTMatch ? navTMatch[1] : ''),
  };
}
