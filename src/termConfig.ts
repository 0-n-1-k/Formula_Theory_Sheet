export type TermId = 'l1t1' | 'l1t2' | 'l2t1' | 'l2t2';

export interface TermCourseConfig {
  code: string;
  badge: string;
  label: string;
}

export interface TermConfig {
  termId: TermId;
  shortCode: string;
  emblemText: string;
  brandTitle: string;
  brandSubtitle: string;
  archiveLabel: string;
  deployedUrl?: string;
  courses: ReadonlyArray<TermCourseConfig>;
}

export const ACTIVE_TERM_ID: TermId = 'l1t1';

export const TERM_REGISTRY: Readonly<Record<TermId, TermConfig>> = {
  l1t1: {
    termId: 'l1t1',
    shortCode: 'L-1 // T-1',
    emblemText: ':: BUET.EEE ::\nL-1 // T-1 SYS',
    brandTitle: 'BUET L-1/T-1 EEE — Formula & Theorem Sheet',
    brandSubtitle: 'EEE 101 · MATH 157 · MATH 159 · PHY 121/165 · CSE 109',
    archiveLabel: 'Level 1 · Term 1 (EEE 101, MATH 157/159, PHY 121, CSE 109)',
    courses: [
      { code: 'EEE', badge: 'EEE 101', label: 'Circuits I' },
      { code: 'M157', badge: 'MATH 157', label: 'Calculus I & II' },
      { code: 'M159', badge: 'MATH 159', label: 'Complex & Vectors' },
      { code: 'PHY', badge: 'PHY 121', label: 'Waves, Optics & Thermo' },
      { code: 'CSE', badge: 'CSE 109', label: 'C / C++ Prog.' },
      { code: 'GEN', badge: 'GEN', label: 'Math & Constants' },
    ],
  },
  l1t2: {
    termId: 'l1t2',
    shortCode: 'L-1 // T-2',
    emblemText: ':: BUET.EEE ::\nL-1 // T-2 SYS',
    brandTitle: 'BUET L-1/T-2 EEE — Formula & Theorem Sheet',
    brandSubtitle: 'EEE 105 · MATH 159/257 · CHEM 101 · HUM · GEN',
    archiveLabel: 'Level 1 · Term 2 (EEE 105, ODE & LA, CHEM 101, HUM)',
    courses: [
      { code: 'EEE105', badge: 'EEE 105', label: 'Circuits II' },
      { code: 'M257', badge: 'MATH 159 / 257', label: 'ODE & Linear Algebra' },
      { code: 'CHEM101', badge: 'CHEM 101', label: 'Chemistry' },
      { code: 'HUM', badge: 'HUM', label: 'Economics / Accounting / English' },
      { code: 'GEN', badge: 'GEN', label: 'Math & Constants' },
    ],
  },
  l2t1: {
    termId: 'l2t1',
    shortCode: 'L-2 // T-1',
    emblemText: ':: BUET.EEE ::\nL-2 // T-1 SYS',
    brandTitle: 'BUET L-2/T-1 EEE — Formula & Theorem Sheet',
    brandSubtitle: 'EEE 201 · EEE 203 · EEE 205 · MATH 257 · GEN',
    archiveLabel: 'Level 2 · Term 1 (EEE 201, EEE 203, EEE 205, MATH 257)',
    courses: [
      { code: 'EEE201', badge: 'EEE 201', label: 'Electronic Circuits I' },
      { code: 'EEE203', badge: 'EEE 203', label: 'Energy Conversion I' },
      { code: 'EEE205', badge: 'EEE 205', label: 'Signals & Linear Systems' },
      { code: 'MATH257', badge: 'MATH 257', label: 'PDE & Fourier / Laplace' },
      { code: 'GEN', badge: 'GEN', label: 'Math & Constants' },
    ],
  },
  l2t2: {
    termId: 'l2t2',
    shortCode: 'L-2 // T-2',
    emblemText: ':: BUET.EEE ::\nL-2 // T-2 SYS',
    brandTitle: 'BUET L-2/T-2 EEE — Formula & Theorem Sheet',
    brandSubtitle: 'EEE 207 · EEE 209 · EEE 211 · MATH 259 · GEN',
    archiveLabel: 'Level 2 · Term 2 (EEE 207, EEE 209, EEE 211, MATH 259)',
    courses: [
      { code: 'EEE207', badge: 'EEE 207', label: 'Electronic Circuits II' },
      { code: 'EEE209', badge: 'EEE 209', label: 'Energy Conversion II' },
      { code: 'EEE211', badge: 'EEE 211', label: 'Continuous Signals' },
      { code: 'MATH259', badge: 'MATH 259', label: 'Probability & Statistics' },
      { code: 'GEN', badge: 'GEN', label: 'Math & Constants' },
    ],
  },
};

export const CURRENT_TERM_CONFIG: TermConfig = TERM_REGISTRY[ACTIVE_TERM_ID];

/**
 * Combines the active term's configured courses with any auto-discovered `data-c` course codes
 * found in `fmSections` or `thmSections` so that no course is ever hidden.
 * Always prepends `{ code: 'ALL', badge: 'ALL', label: 'All Courses' }` and keeps `'GEN'` last.
 */
export function buildEffectiveCoursePills(
  termConfig: TermConfig = CURRENT_TERM_CONFIG,
  discoveredCourseCodes: Iterable<string> = []
): ReadonlyArray<TermCourseConfig> {
  const configuredWithoutGen = termConfig.courses.filter((c) => c.code !== 'GEN');
  const genEntry = termConfig.courses.find((c) => c.code === 'GEN') || {
    code: 'GEN',
    badge: 'GEN',
    label: 'Math & Constants',
  };

  const knownCodes = new Set<string>(['ALL', 'GEN', ...configuredWithoutGen.map((c) => c.code)]);
  const autoDiscovered: TermCourseConfig[] = [];

  for (const rawCode of discoveredCourseCodes) {
    const code = (rawCode || '').trim();
    if (!code || knownCodes.has(code)) continue;
    knownCodes.add(code);
    autoDiscovered.push({
      code,
      badge: code,
      label: `${code} Module`,
    });
  }

  return [
    { code: 'ALL', badge: 'ALL', label: 'All Courses' },
    ...configuredWithoutGen,
    ...autoDiscovered,
    genEntry,
  ];
}

/**
 * Generates a term-specific SEO & OpenGraph description string from a `TermConfig`.
 */
export function buildTermMetaDescription(termConfig: TermConfig = CURRENT_TERM_CONFIG): string {
  const courseList = termConfig.courses
    .filter((c) => c.code !== 'GEN')
    .map((c) => `${c.badge} (${c.label})`)
    .join(', ');
  return `Interactive BUET ${termConfig.shortCode.replace(/\s*\/\/\s*/g, '/')} EEE formula, theorem, and definition reference sheet covering ${courseList}, plus general mathematics and physical constants.`;
}

/**
 * Synchronizes `document.title` as well as `<meta name="description">`, `og:title`,
 * `og:description`, `twitter:title`, and `twitter:description` with the active `TermConfig`.
 */
export function syncDocumentMetaForTerm(
  termConfig: TermConfig = CURRENT_TERM_CONFIG,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): void {
  if (!doc) return;
  doc.title = termConfig.brandTitle;
  const desc = buildTermMetaDescription(termConfig);

  const setMeta = (selector: string, content: string) => {
    const el = doc.querySelector<HTMLMetaElement>(selector);
    if (el) {
      el.setAttribute('content', content);
    }
  };

  setMeta('meta[name="description"]', desc);
  setMeta('meta[property="og:title"]', termConfig.brandTitle);
  setMeta('meta[property="og:description"]', desc);
  setMeta('meta[name="twitter:title"]', termConfig.brandTitle);
  setMeta('meta[name="twitter:description"]', desc);
}

