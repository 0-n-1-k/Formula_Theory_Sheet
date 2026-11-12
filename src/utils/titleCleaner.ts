export interface CleanedTitleResult {
  /** Short, scannable textbook-grade card title */
  title: string;
  /** Extracted exam year / source tag (e.g., "2024–25 Q.4b"), if present */
  examTag?: string;
}

/**
 * Curated textbook-grade titles for cards whose raw HTML `.fmn` headers
 * packed full exam-problem descriptions, redundant formulas, or topic lists.
 *
 * NOTE: The original raw title is still preserved in `FormulaCardRecord.fullTitle`
 * and indexed in `buildFormulaSearchIndex` so 100% of keywords remain searchable.
 */
export const CARD_TITLE_OVERRIDES: Record<string, CleanedTitleResult> = {
  // EEE 101 Formulas
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
  'eee-trans:11': { title: 'First-Order Switching — 5-Step Procedure' },
  'eee-trans:12': { title: 'Sequential (Multi-Event) Switching' },
  'eee-trans:13': { title: 'Op-Amp / Inductor Ramp Input Response' },
  'eee-ac:10': { title: 'Instantaneous, Average & Reactive Power' },
  'eee-ac3:8': { title: 'Series vs. Parallel RLC Resonance' },
  'eee-mag:6': { title: 'Series & Parallel Coupled Inductors' },
  'eee-mag:7': { title: 'Magnetic Reluctance & Ohm’s Law' },

  // MATH 157 Formulas
  'm157-limits:4': { title: "L'Hôpital's Rule — Indeterminate Forms" },
  'm157-limits:5': {
    title: 'Piecewise Continuity & Differentiability',
    examTag: '2024–25',
  },
  'm157-limits:6': {
    title: 'Oscillating & Cusp Continuity Proofs ($x = 0$)',
    examTag: '2012–2025',
  },
  'm157-limits:7': {
    title: 'Infinite Square-Root Limit Trick',
    examTag: '2021–22 Q1a',
  },
  'm157-succ:7': { title: 'Leibniz $n$-th Derivative at $x = 0$' },
  'm157-succ:9': { title: 'Trig Power Reduction before Leibniz' },
  'm157-succ:10': {
    title: 'Partial Fractions $n$-th Derivative',
    examTag: '2016–2025',
  },
  'm157-succ:11': {
    title: 'Euler’s Theorem — 2nd-Order Homogeneous PDE',
  },
  'm157-succ:12': {
    title: 'Euler’s Theorem — Right-Hand Side Rules',
    examTag: '2015–2025',
  },
  'm157-succ:13': {
    title: 'Implicit Differentiation & Higher Tangents',
    examTag: '2016–2024',
  },
  'm157-succ:14': {
    title: 'Three-Term Leibniz Recurrence',
    examTag: '2011–2025',
  },
  'm157-mvt:5': {
    title: 'Classical Rolle’s & MVT Exam Proofs',
    examTag: '2011–2024',
  },
  'm157-mvt:6': {
    title: 'Lagrange MVT Sharp Inequalities',
    examTag: '2014–2025',
  },
  'm157-maxmin:5': { title: '2D Unconstrained Maxima & Minima ($D$-Test)' },
  'm157-maxmin:6': { title: 'Lagrange Multipliers (Constrained Extrema)' },
  'm157-maxmin:7': {
    title: 'BUET Applied Optimization Catalogue (12 Types)',
    examTag: '2010–2025',
  },
  'm157-curve:6': { title: 'Folium of Descartes & Classic Polar Curves' },
  'm157-curve:7': {
    title: 'Angle Between Radius Vector & Tangent',
    examTag: '2015–2025',
  },
  'm157-curve:8': {
    title: 'Curve Tracing Master Checklist (Cartesian & Polar)',
    examTag: '2010–2025',
  },
  'm157-integ:7': { title: 'Rational Trig Integrals ($t = \\tan(x/2)$)' },
  'm157-integ:8': { title: 'Even Trig Integrals ($t = \\tan x$)' },
  'm157-integ:10': { title: 'Linear-Over-Quadratic & Root Integrals' },
  'm157-integ:11': { title: 'Self-Generating Reduction Recurrence' },
  'm157-integ:12': {
    title: 'High-Frequency Indefinite Integrals',
    examTag: '2010–2025',
  },
  'm157-integ:13': {
    title: 'Dual $\\sin x \\pm \\cos x$ Substitution',
    examTag: '2017–2023',
  },
  'm157-def:5': { title: 'King’s Property & Symmetry Rules' },
  'm157-def:8': {
    title: 'Riemann Sum Limit via Definite Integral',
    examTag: '2015–2025',
  },
  'm157-def:9': {
    title: 'Master Definite Integrals & Log-Trig',
    examTag: '2010–2025',
  },
  'm157-def:10': {
    title: 'Beta–Gamma Master Formula Sheet',
    examTag: '2010–2025',
  },
  'm157-appl:7': {
    title: 'Astroid & Hypocycloid Quadrature',
    examTag: '2013–2024',
  },
  'm157-appl:8': {
    title: 'Cycloid Arch Area, Length & Revolution',
    examTag: '2011–2023',
  },
  'm157-appl:9': {
    title: 'Cardioid & Three-Leaved Rose Integrals',
    examTag: '2012–2025',
  },
  'm157-appl:10': {
    title: 'Lemniscate & Loop Intersection Areas',
    examTag: '2010–2025',
  },
  'm157-appl:11': {
    title: 'Volume & Surface Area of Revolution',
    examTag: '2012–2024',
  },
  'm157-appl:12': {
    title: 'Centroid & Moment of Inertia of Standard Shapes',
    examTag: '2014–2023',
  },
  'm157-appl:13': {
    title: 'Witch of Agnesi, Cissoid & Strophoid',
    examTag: '2011–2025',
  },

  // CSE 109 Formulas & Reference Cards
  'cse-c:6': {
    title: 'Top 40 C Exam Reminders & Core Mnemonics',
    examTag: 'Sec. 1.1–1.2',
  },
  'cse-c:7': {
    title: 'C Data Types, 15-Level Precedence & Type Promotion',
    examTag: 'Sec. 2.1–2.2',
  },
  'cse-c:8': {
    title: 'printf/scanf Formatting & Loop Conversions',
    examTag: 'Sec. 2.3–2.5',
  },
  'cse-c:9': {
    title: '34 Common C/C++ Exam Traps & Fixes',
    examTag: 'Sec. 1.3',
  },
  'cse-c:10': {
    title: '25 Pre-Submission Exam Checkpoints',
    examTag: 'Sec. 1.4',
  },
  'cse-ptr:5': {
    title: 'Pointer Declaration Grammar & Commandment',
    examTag: 'Sec. 2.1',
  },
  'cse-cpp:8': {
    title: 'Rule of Three — Copy Constructor, operator= & Destructor',
    examTag: 'Sec. 3.1',
  },
  'cse-inh:6': {
    title: 'Virtual Functions, vtable & Polymorphism Rules',
    examTag: 'Sec. 4.1',
  },
  'cse-io:5': {
    title: 'C FILE* vs. C++ fstream Complete Cheat Sheet',
    examTag: 'Sec. 5.1',
  },

  // Theorem & Definition Cards (content-thmroot.html)
  't-eee1:7': { title: 'Source Transformation & Non-Transformable Cases' },
  't-eee2:3': { title: 'Complex Power Triangle & PF Correction' },
  't-m1571:7': {
    title: 'Piecewise Continuity & Corner Proofs',
    examTag: '2018–2025',
  },
  't-m1571:8': {
    title: 'Leibniz $n$-th Derivative Recurrence Proofs',
    examTag: '2011–2025',
  },
  't-m1571:9': {
    title: "Rolle's & MVT Exam Proofs",
    examTag: '2012–2025',
  },
  't-m1571:10': {
    title: 'Euler’s Homogeneous PDE & Deduction Rules',
    examTag: '2015–2025',
  },
  't-m1572:2': {
    title: 'Taylor’s Theorem with Lagrange & Cauchy Remainder',
  },
  't-m1572:6': {
    title: 'Applied Extrema & Constrained Optimization Proofs',
    examTag: '2010–2025',
  },
  't-m1572:7': {
    title: 'Curvature, Pedal Equation & Asymptote Proofs',
    examTag: '2012–2025',
  },
  't-m1573:4': {
    title: 'Antiderivative, Constant of Integration & IBP Proof',
    examTag: '2024–25 Q5c',
  },
  't-m1573:5': {
    title: 'Trigonometric Power Reduction Formulas',
    examTag: '2011–2025',
  },
  't-m1573:6': {
    title: 'Definite Integral Properties & Frullani’s Theorem',
    examTag: '2010–2025',
  },
  't-m1573:7': {
    title: 'Beta–Gamma Duplication & Reflection Proofs',
    examTag: '2010–2025',
  },
  't-cse1:3': {
    title: 'C Control Flow, Arrays & String Fundamentals',
    examTag: 'Sec. 2.1–2.4',
  },
  't-cse1:4': {
    title: 'Bitwise Tricks, Unions & Undefined Behavior Rules',
    examTag: 'Sec. 2.5–2.9',
  },
  't-cse2:3': {
    title: 'Pointers, Dynamic Memory & Function Pointers',
    examTag: 'Sec. 3.1–3.6',
  },
  't-cse3:3': {
    title: 'Classes, Constructors, Copy Semantics & Friends',
    examTag: 'Sec. 4.1–4.7',
  },
  't-cse4:3': {
    title: 'Operator Overloading, Inheritance & Virtual Dispatch',
    examTag: 'Sec. 5.1–5.6',
  },
  't-cse5:2': {
    title: 'Templates, Exceptions, STL & File I/O',
    examTag: 'Sec. 6.1–6.5',
  },
};

/**
 * Cleans any card title:
 * 1. Checks `CARD_TITLE_OVERRIDES[cardId]` first.
 * 2. Extracts trailing `(2018–19 Q.1c)` / `(2010–2025)` / `(Rev. Guide Sec. ...)` metadata into `examTag`.
 * 3. Strips redundant inline formulas `($...$)` inside parentheticals when the title is already long.
 */
export function cleanCardTitle(rawTitle: string, cardId?: string): CleanedTitleResult {
  if (cardId && CARD_TITLE_OVERRIDES[cardId]) {
    return CARD_TITLE_OVERRIDES[cardId];
  }

  let working = rawTitle.trim();
  let examTag: string | undefined;

  // Extract trailing exam-year / reference citation parenthetical
  const yearMatch = working.match(
    /^(.*?)\s*\(((?:19|20)\d{2}[^)]*|Sadiku[^)]*|new in [^)]+|Rev\.\s*Guide[^)]*|Sec\.\s*\d[^)]*|reference)\)\s*$/i
  );
  if (yearMatch && yearMatch[1].trim().length > 0) {
    working = yearMatch[1].trim();
    examTag = yearMatch[2].trim().replace(/^Rev\.\s*Guide\s*/i, '');
  }

  // Strip redundant trailing formula parentheticals like "($A^{-1} = \frac{1}{\det A}\operatorname{adj} A$)"
  // when the main title is already descriptive (>= 18 chars)
  const formulaParenMatch = working.match(/^(.*?)\s*\(\$[^)]{10,}\$\)\s*$/);
  if (formulaParenMatch && formulaParenMatch[1].trim().length >= 18) {
    working = formulaParenMatch[1].trim();
  }

  return { title: working, examTag };
}
