export interface CleanedTitleResult {
  /** Short, scannable textbook-grade card title */
  title: string;
  /** Extracted exam year tag (e.g., "2024–25 Q.4b"), strictly validated to real academic years */
  examTag?: string;
}

/**
 * Validates and extracts only genuine BUET academic year ranges or exam question citations
 * (e.g. "2018–19", "2019–20 Q.1b", "2024–25 Q4b", "2010–2025").
 * Strips any "Sec.", "Sect.", "Ch.", "Part", "Lec.", "pp.", "Sadiku", "Rev. Guide", or stray digits.
 */
export function extractValidExamTag(rawTag?: string | null): string | undefined {
  if (!rawTag) return undefined;
  const yearMatch = rawTag.match(
    /\b((?:19|20)\d{2}\s*[–-]\s*(?:\d{4}|\d{2})(?:\s*Q\.?\s*\d+[a-z]?(?:\s*\([ivx]+\))?)?)/i
  );
  if (!yearMatch) return undefined;
  return yearMatch[1].replace(/\s+/g, ' ').trim();
}

/**
 * Curated textbook-grade titles for cards whose raw HTML `.fmn` headers
 * packed full exam-problem descriptions, redundant formulas, or topic lists.
 *
 * NOTE: The original raw title is still preserved in `FormulaCardRecord.fullTitle`
 * and indexed in `buildFormulaSearchIndex` so 100% of keywords remain searchable.
 */
export const CARD_TITLE_OVERRIDES: Record<string, CleanedTitleResult> = {
  // EEE 101 Formulas (verified exact IDs)
  'eee-basic:6': { title: 'Independent vs. Dependent Sources' },
  'eee-delta:3': { title: 'Balanced Bridge Condition' },
  'eee-delta:4': { title: 'Ladder & Symmetric Network Reduction' },
  'eee-nodal:6': { title: 'Mesh Analysis with Current Sources' },
  'eee-thev:4': { title: 'Thévenin Resistance ($R_{th}$) — 3 Cases' },
  'eee-thev:5': { title: 'Open-Circuit & Short-Circuit Specials' },
  'eee-thev:6': { title: 'Valid vs. Invalid Source Transformation' },
  'eee-maxp:4': {
    title: 'Sliding Load on Resistive Rails',
    examTag: '2018–19 Q.1c',
  },
  'eee-ac:10': { title: 'Instantaneous, Average & Reactive Power' },

  // MATH 157 Formulas (verified exact IDs)
  'm157-limits:6': {
    title: 'Oscillating & Cusp Continuity Proofs ($x = 0$)',
    examTag: '2012–2025',
  },
  'm157-limits:7': {
    title: 'Indeterminate Exponential & Log Limits ($1^\\infty, \\infty - \\infty$)',
    examTag: '2010–2025',
  },
  'm157-succ:13': {
    title: '$n$-th Derivative of $1/(x^2 + a^2)$ & Trig Substitutions',
  },
  'm157-succ:14': {
    title: 'Classic Leibniz ODEs & $(y_n)_0$ Product Formula',
    examTag: '2011–2025',
  },
  'm157-mvt:5': {
    title: 'Rolle’s Geometric Mean & MVT Speeding Proofs',
  },
  'm157-mvt:6': {
    title: 'Lagrange & Cauchy MVT Sharp Inequalities',
    examTag: '2011–2022',
  },
  'm157-maxmin:5': {
    title: 'Norman Window Perimeter & Max-Area Problem',
  },
  'm157-maxmin:7': {
    title: 'BUET Applied Optimization Catalogue (12 Types)',
    examTag: '2010–2025',
  },
  'm157-appl:7': {
    title: 'Astroid & Hypocycloid Quadrature ($x^{2/3}+y^{2/3}=a^{2/3}$)',
  },
  'm157-appl:13': {
    title: 'Strophoid, Witch of Agnesi & Polar Circle Areas',
  },

  // CSE 109 Formulas & Reference Cards (verified exact IDs, no Sec. tags)
  'cse-c:6': {
    title: 'Top 40 C Exam Reminders & Core Mnemonics',
  },
  'cse-c:7': {
    title: 'C Data Types, 15-Level Precedence & Type Promotion',
  },
  'cse-c:8': {
    title: 'printf/scanf Formatting & Loop Conversions',
  },
  'cse-c:9': {
    title: '34 Common C/C++ Exam Traps & Fixes',
  },
  'cse-lib:0': {
    title: 'Common C Headers: stdio.h, stdlib.h, string.h, ctype.h, math.h',
  },
  'cse-lib:1': {
    title: 'math.h Exact Results & string.h / ctype.h / stdlib.h Quick Table',
  },
  'cse-ptr:4': {
    title: 'Dynamic 2D Matrix Allocate, Read, Free & 3x3 Multiply',
  },
  'cse-ptr:5': {
    title: 'Magic Square Verification, Diagonal Sums & Row-Major 2D Sort',
  },
  'cse-ptr:7': {
    title: 'Pointer Expressions, 2D/3D Star Indexing & Dynamic Memory Idioms',
  },
  'cse-str:8': {
    title: 'Array Syntax, 1D Array One-Liners, Sorting/Searching & Matrix Templates',
  },
  'cse-str:9': {
    title: 'Write-Your-Own String Functions (myStrlen..myStrrev) & 16 String One-Liners',
  },
  'cse-file:8': {
    title: 'Structure, Union, Enum, Bit-Field & File I/O Complete Reference',
  },
  'cse-bit:5': {
    title: 'Six Bitwise Operators, Mask Building & Bit Tricks (#1–#18)',
  },
  'cse-bit:6': {
    title: 'Bitwise Tricks (#19–#35) & 14 Past-Paper Bitwise Functions',
  },
  'cse-num:1': {
    title: "Two's Complement Step-by-Step Method & Bit-Pattern Solutions",
  },
  'cse-algo:6': {
    title: 'Functions, 16 Recursion One-Liners, Trace Recognition & Macros',
  },
  'cse-pat:5': {
    title: 'Common Number Codes & 3-Question Row Pattern Method',
  },
  'cse-cpp:7': {
    title: 'C++ Class Skeleton (Rule of Three), Operator Overloading & Virtual Dispatch',
  },

  // Theorem & Definition Cards (content-thmroot.html, verified exact IDs)
  't-m1571:7': {
    title: 'Solved Indeterminate Limits ($1^\\infty, \\infty - \\infty$) & RL $R \\to 0^+$ Limit',
  },
  't-m1571:8': {
    title: 'Master Derivations of Leibniz ODEs & $(y_n)_0$ Recurrences',
    examTag: '2010–2025',
  },
  't-m1571:9': {
    title: "Rolle's & MVT Exam Proofs",
    examTag: '2012–2025',
  },
  't-m1571:10': {
    title: 'Taylor/Maclaurin Lagrange Remainder & Error Bound Proofs',
  },
  't-m1572:6': {
    title: 'Straight-Line Tangent & Master Pedal Equation Derivations',
    examTag: '2010–2025',
  },
  't-m1572:7': {
    title: 'Curvature, Ellipse Semi-Latus Rectum & Parabola Focal Chord Proofs',
  },
  't-m1573:5': {
    title: 'Antiderivative, Constant of Integration & IBP Proof',
    examTag: '2024–25 Q5c',
  },
  't-m1573:6': {
    title: "Master Reduction Formulas & Wallis's Sine/Cosine Proofs",
    examTag: '2010–2025',
  },
  't-m1573:7': {
    title: '$\\Gamma(1/2) = \\sqrt{\\pi}$, Legendre Duplication & Beta–Gamma Proofs',
    examTag: '2011–2025',
  },
  't-cse1:3': {
    title: 'C Theory One-Liners, Scope/Lifetime Table, Struct vs. Union & Macros',
  },
  't-cse1:4': {
    title: "Output-Tracing Rules (1–28), Error Checklist & Two's Complement Theory",
  },
  't-cse2:2': {
    title: 'Rule of Three, Two-Class Friend Forward Declaration & Operator Overloading',
  },
  't-cse2:3': {
    title: 'Pointer vs. Reference, new vs. malloc, Overloading Ambiguity & OOP Theory',
  },
};

/**
 * Cleans any card title:
 * 1. Checks `CARD_TITLE_OVERRIDES[cardId]` first (validating `examTag` so no `Sec.` tag slips through).
 * 2. Extracts genuine exam-year citations into `examTag`.
 * 3. Strips textbook/PDF section/chapter/lecture/page/Sadiku/Rev. Guide tags and stray trailing digits.
 * 4. Strips redundant inline formulas `($...$)` inside parentheticals when the title is already descriptive.
 */
export function cleanCardTitle(rawTitle: string, cardId?: string): CleanedTitleResult {
  if (cardId && CARD_TITLE_OVERRIDES[cardId]) {
    const ov = CARD_TITLE_OVERRIDES[cardId];
    return {
      title: ov.title,
      examTag: extractValidExamTag(ov.examTag),
    };
  }

  let working = String(rawTitle || '').trim();
  let examTag: string | undefined;

  // 1. Extract any genuine exam year from trailing parentheticals before stripping reference noise
  const trailingParens = working.match(/\(([^()]*)\)\s*$/);
  if (trailingParens) {
    const candidateYear = extractValidExamTag(trailingParens[1]);
    if (candidateYear) {
      examTag = candidateYear;
    }
  }

  // 2. Strip trailing or embedded parentheticals containing Sec., Sect., Ch., Part, Lec., pp., Slide, Prob., Sadiku, Schildt, Rev. Guide, reference, etc.
  working = working.replace(
    /\s*\((?:[^()]*\b(?:Rev\.?\s*Guide|Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?|Part|Lec(?:ture)?s?\.?|pp\.?|Pages?|Slides?|Prob(?:lem)?s?\.?|Sadiku|Schildt|Kernighan|Ritchie|Boylestad|Alexander|Grewal|Kreyszig|Schaum|reference|new in)\b[^()]*)\)/gi,
    ''
  );

  // 3. If a trailing parenthetical was purely a valid exam year (and wasn't stripped above), strip it from the main title
  const yearParenMatch = working.match(
    /^(.*?)\s*\(\s*(?:BUET\s+)?(?:19|20)\d{2}\s*[–-]\s*(?:\d{2}|\d{4})[^()]*\)\s*$/i
  );
  if (yearParenMatch && yearParenMatch[1].trim().length > 0) {
    if (!examTag) {
      examTag = extractValidExamTag(working.slice(yearParenMatch[1].length));
    }
    working = yearParenMatch[1].trim();
  }

  // 4. Strip inline/unparenthesized Sec. / Sect. / Ch. / Chap. numbers
  working = working.replace(
    /\s*(?:[,–—-]\s*)?\b(?:Rev\.?\s*Guide\s*)?(?:Sec(?:t|tion)?s?\.?|Ch(?:ap(?:ter)?)?\.?)\s*\d+(?:\.\d+)*(?:\s*(?:&|and|[–,-])\s*(?:Sec(?:t|tion)?s?\.?\s*)?\d+(?:\.\d+)*)*/gi,
    ''
  );

  // 5. Strip stray digits attached after C header names (e.g. "<math.h> 5" or "math.h 5")
  working = working.replace(
    /(\b(?:ctype|stdio|stdlib|string|math|assert|stdarg|time|limits|float)\.h>?)\s+\d+\b/gi,
    '$1'
  );

  // 6. Strip stray trailing standalone digits that are not part of course codes, dimensions, or equations
  if (!/(?:\b(?:EEE|MATH|PHY|CSE)\s+\d+|\b[123]D|\b(?:1st|2nd|3rd|\d+th)|[=<>≈≠±]\s*\d+|\bPart\s+\d+)\s*$/i.test(working)) {
    working = working.replace(/\s+\d+\s*$/, '');
  }

  // 7. Strip redundant trailing formula parentheticals like "($A^{-1} = \frac{1}{\det A}\operatorname{adj} A$)"
  // when the main title is already descriptive (>= 18 chars)
  const formulaParenMatch = working.match(/^(.*?)\s*\(\$[^)]{10,}\$\)\s*$/);
  if (formulaParenMatch && formulaParenMatch[1].trim().length >= 18) {
    working = formulaParenMatch[1].trim();
  }

  working = working
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,;–—-]\s*$/, '')
    .trim();

  return { title: working || rawTitle.trim(), examTag };
}
