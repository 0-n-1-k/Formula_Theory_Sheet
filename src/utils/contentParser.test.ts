import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTopicSections, parseNavContent } from './contentParser.ts';

const fmCourseHtml = fs.readFileSync('src/content-fmroot.html', 'utf8');
const genHtml = fs.readFileSync('src/content-gen.html', 'utf8');
const thmHtml = fs.readFileSync('src/content-thmroot.html', 'utf8');
const navHtml = fs.readFileSync('src/content-nav.html', 'utf8');

test('parseTopicSections extracts all 66 formula sections (59 course + 7 GEN = 511 cards) and 13 theorem sections (158 cards)', () => {
  const fmCourseSections = parseTopicSections(fmCourseHtml);
  const genSections = parseTopicSections(genHtml);
  const fmSections = [...fmCourseSections, ...genSections];
  const thmSections = parseTopicSections(thmHtml);

  assert.equal(fmCourseSections.length, 59, 'Expected 59 course formula topic sections in content-fmroot.html');
  assert.equal(genSections.length, 7, 'Expected 7 GEN topic sections in content-gen.html');
  assert.equal(fmSections.length, 66, 'Expected 66 total formula topic sections');
  const totalFmCards = fmSections.reduce((acc, s) => acc + s.cards.length, 0);
  assert.equal(totalFmCards, 511, 'Expected 511 formula cards');

  assert.equal(thmSections.length, 13, 'Expected 13 theorem topic sections');
  const totalThmCards = thmSections.reduce((acc, s) => acc + s.cards.length, 0);
  assert.equal(totalThmCards, 158, 'Expected 158 theorem/definition cards');

  // Check badges on thmroot cards
  for (const sec of thmSections) {
    for (const card of sec.cards) {
      assert.ok(card.badge, `Theorem card ${card.id} should have a .thty badge`);
      assert.ok(card.htmlContent, `Theorem card ${card.id} should have .fmhtml content`);
    }
  }

  const allFmCards = fmSections.flatMap((s) => s.cards);
  const optCard = allFmCards.find((c) => c.id === 'm157-maxmin:7');
  assert.ok(optCard?.steps?.some((s) => s.includes('Norman window')), 'm157-maxmin:7 should retain all 12 past-paper optimization steps');
  const curveCard = allFmCards.find((c) => c.id === 'm157-appl:13');
  assert.ok(curveCard?.title.includes('Witch of Agnesi') && Boolean(curveCard?.rawLatex), 'm157-appl:13 should retain all curve quadrature/volume details');

  const allThmCards = thmSections.flatMap((s) => s.cards);
  const rolleCard = allThmCards.find((c) => c.id === 't-m1571:9');
  assert.ok(rolleCard?.title.includes("Rolle's Geometric Mean Proof"), 't-m1571:9 should retain Rolle & MVT proof card');
  assert.equal(rolleCard?.steps?.length, 4, 't-m1571:9 should have 4 proof steps');
});

test('parseNavContent extracts all course navigation groups for #navF and #navT', () => {
  const parsedNav = parseNavContent(navHtml);
  assert.equal(parsedNav.navF.length, 6, 'Expected 6 course groups in #navF (EEE, M157, M159, PHY, CSE, GEN)');
  assert.equal(parsedNav.navT.length, 5, 'Expected 5 course groups in #navT (EEE, M157, M159, PHY, CSE)');

  const totalFmLinks = parsedNav.navF.reduce((acc, g) => acc + g.links.length, 0);
  const totalThmLinks = parsedNav.navT.reduce((acc, g) => acc + g.links.length, 0);
  assert.equal(totalFmLinks, 66, 'Every formula topic section has a corresponding link in #navF');
  assert.equal(totalThmLinks, 13, 'Every theorem topic section has a corresponding link in #navT');
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
    assert.ok(card?.title.includes('$'), `Expected ${id} title to contain $...$ math delimiters`);
  }
});

