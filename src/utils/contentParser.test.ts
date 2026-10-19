import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseTopicSections, parseNavContent } from './contentParser.ts';

const fmHtml = fs.readFileSync('src/content-fmroot.html', 'utf8');
const thmHtml = fs.readFileSync('src/content-thmroot.html', 'utf8');
const navHtml = fs.readFileSync('src/content-nav.html', 'utf8');

test('parseTopicSections extracts all 61 formula sections (364 cards) and 13 theorem sections (84 cards)', () => {
  const fmSections = parseTopicSections(fmHtml);
  const thmSections = parseTopicSections(thmHtml);

  assert.equal(fmSections.length, 61, 'Expected 61 formula topic sections');
  const totalFmCards = fmSections.reduce((acc, s) => acc + s.cards.length, 0);
  assert.equal(totalFmCards, 364, 'Expected 364 formula cards');

  assert.equal(thmSections.length, 13, 'Expected 13 theorem topic sections');
  const totalThmCards = thmSections.reduce((acc, s) => acc + s.cards.length, 0);
  assert.equal(totalThmCards, 84, 'Expected 84 theorem/definition cards');

  // Check badges on thmroot cards
  for (const sec of thmSections) {
    for (const card of sec.cards) {
      assert.ok(card.badge, `Theorem card ${card.id} should have a .thty badge`);
      assert.ok(card.htmlContent, `Theorem card ${card.id} should have .fmhtml content`);
    }
  }
});

test('parseNavContent extracts all course navigation groups for #navF and #navT', () => {
  const parsedNav = parseNavContent(navHtml);
  assert.equal(parsedNav.navF.length, 6, 'Expected 6 course groups in #navF (EEE, M157, M159, PHY, CSE, GEN)');
  assert.equal(parsedNav.navT.length, 5, 'Expected 5 course groups in #navT (EEE, M157, M159, PHY, CSE)');

  const totalFmLinks = parsedNav.navF.reduce((acc, g) => acc + g.links.length, 0);
  const totalThmLinks = parsedNav.navT.reduce((acc, g) => acc + g.links.length, 0);
  assert.equal(totalFmLinks, 61, 'Every formula topic section has a corresponding link in #navF');
  assert.equal(totalThmLinks, 13, 'Every theorem topic section has a corresponding link in #navT');
});
