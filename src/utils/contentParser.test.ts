import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CURATED_CONTEXT_FALLBACKS,
  findOpeningTagEndIndex,
  parseTopicSections,
} from './contentParser.ts';
import { CARD_TITLE_OVERRIDES, extractValidExamTag } from './titleCleaner.ts';

const fmCourseHtml = fs.readFileSync('src/content-fmroot.html', 'utf8');
const genHtml = fs.readFileSync('src/content-gen.html', 'utf8');
const thmHtml = fs.readFileSync('src/content-thmroot.html', 'utf8');

test('findOpeningTagEndIndex ignores > inside quoted attributes and prevents m157-gamma:0 data-s truncation', () => {
  const sample = 'tex" data-k="m157-gamma:0" data-s="gamma ∫₀<sup>∞</sup> for n > 0"><div class="fmh">';
  const endIdx = findOpeningTagEndIndex(sample, true);
  assert.equal(sample.slice(endIdx), '><div class="fmh">');

  const syntheticSection = `<details class="fmt" id="fm-test" data-c="M157"><summary><span class="fmtt">Gamma Test</span></summary><div class="fmgrid"><div class="fmi tex" data-k="m157-gamma:0" data-s="gamma function ∫₀<sup>∞</sup> for n > 0"><div class="fmh"><span class="fmn">Gamma function</span><span class="fmb"></span></div><div class="fmbody"><div class="fmm">$$\\Gamma(n)$$</div></div></div></div></details>`;
  const parsed = parseTopicSections(syntheticSection);
  assert.equal(parsed[0].cards[0].keywords, 'gamma function ∫₀<sup>∞</sup> for n > 0');
});

test('parseTopicSections extracts all 66 formula sections (59 course + 7 GEN = 535 cards) and 13 theorem sections (161 cards)', () => {
  const fmCourseSections = parseTopicSections(fmCourseHtml);
  const genSections = parseTopicSections(genHtml);
  const fmSections = [...fmCourseSections, ...genSections];
  const thmSections = parseTopicSections(thmHtml);

  assert.equal(fmCourseSections.length, 59, 'Expected 59 course formula topic sections in content-fmroot.html');
  assert.equal(genSections.length, 7, 'Expected 7 GEN topic sections in content-gen.html');
  assert.equal(fmSections.length, 66, 'Expected 66 total formula topic sections');
  const totalFmCards = fmSections.reduce((acc, s) => acc + s.cards.length, 0);
  assert.equal(totalFmCards, 535, 'Expected 535 formula cards');

  assert.equal(thmSections.length, 13, 'Expected 13 theorem topic sections');
  const totalThmCards = thmSections.reduce((acc, s) => acc + s.cards.length, 0);
  assert.equal(totalThmCards, 161, 'Expected 161 theorem/definition cards');

  // Check badges on thmroot cards
  for (const sec of thmSections) {
    for (const card of sec.cards) {
      assert.ok(card.badge, `Theorem card ${card.id} should have a .thty badge`);
      assert.ok(card.htmlContent, `Theorem card ${card.id} should have .fmhtml content`);
    }
  }

  const allFmCards = fmSections.flatMap((s) => s.cards);
  const gammaCard = allFmCards.find((c) => c.id === 'm157-gamma:0');
  assert.ok(
    gammaCard?.keywords && gammaCard.keywords.includes('gamma function'),
    'm157-gamma:0 must retain its full data-s search keywords'
  );

  const optCard = allFmCards.find((c) => c.id === 'm157-maxmin:7');
  assert.ok(optCard?.steps?.some((s) => s.includes('Norman window')), 'm157-maxmin:7 should retain all 12 past-paper optimization steps');
  const curveCard = allFmCards.find((c) => c.id === 'm157-appl:13');
  assert.ok(curveCard?.title.includes('Witch of Agnesi') && Boolean(curveCard?.rawLatex), 'm157-appl:13 should retain all curve quadrature/volume details');

  const allThmCards = thmSections.flatMap((s) => s.cards);
  const rolleCard = allThmCards.find((c) => c.id === 't-m1571:9');
  assert.equal(rolleCard?.title, "Rolle's & MVT Exam Proofs", 't-m1571:9 should have cleaned textbook title');
  assert.equal(rolleCard?.examTag, '2012–2025', 't-m1571:9 should have extracted examTag');
  assert.ok(
    rolleCard?.fullTitle?.includes("Rolle's Geometric Mean Proof"),
    't-m1571:9 should retain fullTitle with Rolle & MVT proof details'
  );
  assert.equal(rolleCard?.steps?.length, 4, 't-m1571:9 should have 4 proof steps');

  const cseConditionalCard = allFmCards.find((c) => c.id === 'cse-c:5');
  assert.ok(
    cseConditionalCard?.title.includes('Vowel Switch'),
    'cse-c:5 must retain its Vowel Switch / Restricted Conditionals title and not be overwritten by cse-c:6'
  );

  const cseReminders = allFmCards.find((c) => c.id === 'cse-c:6');
  assert.equal(cseReminders?.title, 'Top 40 C Exam Reminders & Core Mnemonics');
  assert.equal(cseReminders?.examTag, undefined, 'cse-c:6 should not have a Sec. tag as examTag');
  assert.ok(cseReminders?.fullTitle?.includes('Top 40 Exam Reminders (1–40)'));
});

test('parseTopicSections strips all PDF/textbook/Sec. artifacts, ensures non-empty keywords & context, and has zero double-escaped HTML entities', () => {
  for (const [name, raw] of [
    ['content-fmroot.html', fmCourseHtml],
    ['content-thmroot.html', thmHtml],
    ['content-gen.html', genHtml],
  ] as const) {
    assert.equal(
      /&amp;(?:lt|gt|amp|quot|#39|#x27);/i.test(raw),
      false,
      `${name} should contain zero double-escaped HTML entities`
    );
  }

  const allCards = [
    ...parseTopicSections(fmCourseHtml).flatMap((s) => s.cards),
    ...parseTopicSections(thmHtml).flatMap((s) => s.cards),
    ...parseTopicSections(genHtml).flatMap((s) => s.cards),
  ];

  for (const card of allCards) {
    assert.ok(
      card.keywords && card.keywords.trim().length > 0,
      `Card ${card.id} must have non-empty data-s search keywords`
    );
    if (card.examTag) {
      assert.match(
        card.examTag,
        /^(?:19|20)\d{2}/,
        `Card ${card.id} examTag "${card.examTag}" must be a real academic year`
      );
    }
    const combinedText = `${card.title} ${card.bodyText} ${card.useText || ''} ${card.htmlContent || ''} ${card.note || ''}`;
    assert.ok(
      !/Rev\.\s*Guide|\bSec(?:t|tion)?s?\.\s*\d|\bSadiku\b|\bSchildt\b/i.test(combinedText),
      `Card ${card.id} should not contain PDF/textbook/section artifacts`
    );
    if (card.course !== 'GEN') {
      assert.ok(
        card.bodyText && card.bodyText.trim().length > 0,
        `Card ${card.id} must have non-empty bodyText (PARAMETERS // CONTEXT)`
      );
      assert.ok(
        card.useText && card.useText.trim().length > 0,
        `Card ${card.id} must have non-empty useText (APPLICATION // STRATEGY)`
      );
    }
  }

  const strCard = allCards.find((c) => c.id === 'cse-str:9');
  assert.ok(strCard?.codeContent, 'cse-str:9 should have formatted codeContent');
  assert.ok(
    strCard.codeContent.includes('int myStrlen(char *s) {\n  char *p = s;'),
    'cse-str:9 should unpack one-liner functions into 2-space K&R indented blocks'
  );
  assert.ok(
    strCard.codeContent.includes('// remove char\nfor (i = 0, k = 0; s[i]; i++)'),
    'cse-str:9 should extract far-right padded comments above unpacked multi-statement lines'
  );

  // Verify missing or duplicate data-k throws instead of silently drifting
  const missingKeyHtml = `<details class="fmt" id="fm-cse-c" data-c="CSE"><summary><span class="fmtt">C Basics</span></summary><div class="fmgrid"><div class="fmi html" data-s="c types"><div class="fmh"><span class="fmn">Missing Key</span><span class="fmb"></span></div><div class="fmbody"></div></div></div></details>`;
  assert.throws(() => parseTopicSections(missingKeyHtml), /Missing explicit data-k/);

  const duplicateKeyHtml = `
    <details class="fmt" id="fm-cse-c" data-c="CSE"><summary><span class="fmtt">C Basics</span></summary><div class="fmgrid">
      <div class="fmi html" data-k="cse-c:6" data-s="c types"><div class="fmh"><span class="fmn">First</span><span class="fmb"></span></div><div class="fmbody"></div></div>
      <div class="fmi html" data-k="cse-c:6" data-s="c types"><div class="fmh"><span class="fmn">Duplicate</span><span class="fmb"></span></div><div class="fmbody"></div></div>
    </div></details>
  `;
  assert.throws(() => parseTopicSections(duplicateKeyHtml), /Duplicate data-k="cse-c:6"/);
});

test('CARD_TITLE_OVERRIDES and CURATED_CONTEXT_FALLBACKS have zero orphaned keys and every override aligns with its raw HTML card title', () => {
  const allCards = [
    ...parseTopicSections(fmCourseHtml).flatMap((s) => s.cards),
    ...parseTopicSections(thmHtml).flatMap((s) => s.cards),
    ...parseTopicSections(genHtml).flatMap((s) => s.cards),
  ];
  const cardById = new Map(allCards.map((c) => [c.id, c]));

  const stopWords = new Set([
    'and',
    'the',
    'for',
    'with',
    'from',
    'into',
    'via',
    'all',
    'two',
    'one',
    'types',
    'part',
    'proof',
    'proofs',
    'exam',
    'formula',
    'formulas',
    'common',
  ]);

  const tokenizeTitle = (str: string): string[] =>
    str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/leibnitz/g, 'leibniz')
      .replace(/\\gamma|Γ/gi, 'gamma')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));

  for (const [cardId, override] of Object.entries(CARD_TITLE_OVERRIDES)) {
    const card = cardById.get(cardId);
    assert.ok(
      card,
      `CARD_TITLE_OVERRIDES["${cardId}"] ("${override.title}") does not match any card in HTML`
    );

    const overrideTokens = tokenizeTitle(override.title);
    const rawTokens = new Set(tokenizeTitle(card.fullTitle || ''));
    const sharedTokens = overrideTokens.filter((tok) => rawTokens.has(tok));

    assert.ok(
      sharedTokens.length >= 2,
      `CARD_TITLE_OVERRIDES["${cardId}"] drift detected: override="${override.title}" shares only [${sharedTokens.join(', ')}] with raw fullTitle="${card.fullTitle}"`
    );

    const rawExamTag = extractValidExamTag(card.fullTitle);
    if (rawExamTag) {
      assert.ok(
        Boolean(override.examTag),
        `CARD_TITLE_OVERRIDES["${cardId}"] silently discards real examTag "${rawExamTag}" from raw fullTitle="${card.fullTitle}"`
      );
    }
  }

  for (const fallbackId of Object.keys(CURATED_CONTEXT_FALLBACKS)) {
    assert.ok(
      cardById.has(fallbackId),
      `CURATED_CONTEXT_FALLBACKS["${fallbackId}"] does not match any card in HTML`
    );
  }
});

test('parseTopicSections provides complete course, id, and title metadata for dynamic sidebar navigation groups', () => {
  const fmSections = [...parseTopicSections(fmCourseHtml), ...parseTopicSections(genHtml)];
  const thmSections = parseTopicSections(thmHtml);
  const fmCourses = new Set(fmSections.map((s) => s.course));
  const thmCourses = new Set(thmSections.map((s) => s.course));

  assert.equal(fmCourses.size, 6, 'Expected 6 course groups across formula + GEN sections');
  assert.equal(thmCourses.size, 5, 'Expected 5 course groups across theorem sections');
  for (const sec of [...fmSections, ...thmSections]) {
    assert.ok(sec.id && sec.title && sec.course, `Section ${sec.id} must have id, title, and course`);
  }
});

test('parseTopicSections decodes residual HTML entities in copyText and rawLatex and wraps math titles in $...$', () => {
  const allCards = [
    ...parseTopicSections(fmCourseHtml).flatMap((s) => s.cards),
    ...parseTopicSections(thmHtml).flatMap((s) => s.cards),
  ];
  const cardById = new Map(allCards.map((c) => [c.id, c]));

  for (const id of [
    'm157-mvt:5',
    'm157-mvt:6',
    'm157-succ:14',
    't-m1571:8',
    't-m1571:9',
    't-m1571:10',
    't-m1573:6',
  ]) {
    const card = cardById.get(id);
    assert.ok(card, `Expected card ${id} to exist`);
    assert.ok(
      !/&(lt|gt|amp);/.test(card.copyText || ''),
      `Expected ${id} copyText to have no residual HTML entities`
    );
    assert.ok(
      !/&(lt|gt|amp);/.test(card.rawLatex || ''),
      `Expected ${id} rawLatex to have no residual HTML entities`
    );
  }

  for (const id of [
    'eee-trans:14',
    'm157-limits:7',
    'm157-succ:1',
    'm157-succ:9',
    'm157-succ:12',
    'm157-succ:14',
    'm157-integ:9',
    'm157-integ:13',
    'm157-appl:7',
    't-m1571:7',
    't-m1571:8',
  ]) {
    const card = cardById.get(id);
    assert.ok(
      (card?.fullTitle || card?.title || '').includes('$'),
      `Expected ${id} fullTitle or title to contain $...$ math delimiters`
    );
  }
});

test('parseTopicSections strips exam-year citations from bold definition headings and derivation summaries while keeping examTag searchable', () => {
  const allCards = [
    ...parseTopicSections(fmCourseHtml).flatMap((s) => s.cards),
    ...parseTopicSections(thmHtml).flatMap((s) => s.cards),
  ];
  const cardById = new Map(allCards.map((c) => [c.id, c]));

  const slidingCard = cardById.get('eee-delta:6');
  assert.equal(slidingCard?.examTag, '2018–19 Q.1c', 'examTag must remain on record for search indexing');

  const thmWorked = cardById.get('t-eee1:11');
  assert.ok(thmWorked, 'Expected t-eee1:11 to exist');
  assert.equal(
    thmWorked.stepsSummary,
    'Proof & Worked Exam Problems',
    'stepsSummary must strip parenthetical exam-year/question lists'
  );
  assert.ok(
    thmWorked.htmlContent && !/\(2018[–-]19\s*Q\.1c\)/.test(thmWorked.htmlContent),
    'Bold definition headings inside htmlContent must not display parenthetical exam-year citations'
  );
  assert.ok(
    thmWorked.htmlContent && thmWorked.htmlContent.includes('<b>Sliding Load Between Two Sources:</b>'),
    'Trailing colons inside bold definition headings must be preserved cleanly'
  );

  // Verify details.fmd step headings also strip exam-year citations (both dotted and undotted Q numbers)
  const mvtWorked = cardById.get('t-m1571:9');
  assert.ok(mvtWorked && mvtWorked.steps && mvtWorked.steps.length > 0, 'Expected t-m1571:9 to have steps');
  assert.ok(
    mvtWorked.steps.every((st) => !/\((?:BUET\s+)?(?:19|20)\d{2}[–-]\d{2,4}[^()]*\)/.test(st)),
    'Bold step headings inside details.fmd must not display parenthetical exam-year citations'
  );
  assert.ok(
    mvtWorked.steps[0].includes('</b>') && mvtWorked.steps[0].includes(':</b>'),
    'Trailing colons in derivation step bold headings must be preserved cleanly'
  );
  assert.ok(
    mvtWorked.keywords.includes('2023–24 Q2b') || mvtWorked.keywords.toLowerCase().includes('2023–24 q2b'),
    'Stripped step exam-year citations must remain searchable in keywords'
  );

  // Verify steps whose bold tag was ONLY an exam-year citation don't leave a stray empty <b>:</b>
  const limitDeriv = cardById.get('m157-limits:7');
  assert.ok(limitDeriv && limitDeriv.steps && limitDeriv.steps.length > 0, 'Expected m157-limits:7 to have steps');
  assert.ok(
    limitDeriv.steps.every((st) => !/<b>\s*:?\s*<\/b>/i.test(st)),
    'Stripping a citation-only bold prefix must not leave an empty <b>:</b> tag'
  );
  assert.ok(
    limitDeriv.steps.every((st) => !/\(2024[–-]25\s*Q1c/i.test(st) && !/\(2010[–-]11\s*Q1b\)/i.test(st)),
    'Citation-only bold prefixes in details.fmd must be cleanly removed'
  );
});




