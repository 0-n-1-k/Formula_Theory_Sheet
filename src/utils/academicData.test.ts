import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync('index.html', 'utf8');
const fmHtml = fs.readFileSync('src/content-fmroot.html', 'utf8');
const thmHtml = fs.readFileSync('src/content-thmroot.html', 'utf8');

test('index.html is synced with src/content-fmroot.html and src/content-thmroot.html', () => {
  assert.ok(indexHtml.includes(fmHtml), 'index.html should contain exact #fmroot markup');
  assert.ok(indexHtml.includes(thmHtml), 'index.html should contain exact #thmroot markup');
});

test('Zero data loss: all original 32 theorem data-k keys and 364 formula cards are preserved', () => {
  const fmCards = fmHtml.match(/<div class="fmi /g) || [];
  const thmCards = thmHtml.match(/<div class="fmi /g) || [];
  assert.equal(fmCards.length, 364, 'Expected 364 formula cards in #fmroot');
  assert.equal(thmCards.length, 84, 'Expected 84 theorem/definition cards in #thmroot');

  const originalThmKeys = [
    't-eee1:0', 't-eee1:1', 't-eee1:2', 't-eee1:3', 't-eee1:4',
    't-eee2:0', 't-eee2:1', 't-eee2:2',
    't-m1571:0', 't-m1571:1', 't-m1571:2', 't-m1571:3',
    't-m1572:0', 't-m1572:1', 't-m1572:2',
    't-m1573:0', 't-m1573:1', 't-m1573:2',
    't-m1591:0', 't-m1591:1', 't-m1591:2',
    't-m1592:0', 't-m1592:1',
    't-m1593:0', 't-m1593:1',
    't-phy1:0', 't-phy1:1',
    't-phy2:0', 't-phy2:1',
    't-phy3:0', 't-phy3:1',
    't-cse1:0', 't-cse1:1',
    't-cse2:0', 't-cse2:1',
  ];
  for (const k of originalThmKeys) {
    assert.ok(thmHtml.includes(`data-k="${k}"`), `Missing original theorem key ${k}`);
  }
});

test('EEE-101 includes series/parallel RLC, damping formulas, and general 2nd-order circuit steps', () => {
  const eeeFmKeys = [
    'eee-trans:10',
    'eee-trans:11',
    'eee-trans:12',
    'eee-trans:13',
    'eee-trans:14',
    'eee-trans:15',
  ];
  for (const k of eeeFmKeys) {
    assert.ok(fmHtml.includes(`data-k="${k}"`), `Missing EEE-101 RLC card ${k} in #fmroot`);
  }
  assert.ok(thmHtml.includes('data-k="t-eee2:3"'), 'Missing Series vs Parallel RLC & Damping Regimes theorem card t-eee2:3');
  assert.ok(thmHtml.includes('data-k="t-eee2:4"'), 'Missing General 2nd-Order Dynamic Circuits card t-eee2:4');
  assert.ok(thmHtml.includes('Step 1 ($t = 0^-$ steady state):'), 'Missing step-by-step 2nd-order solution algorithm');
});

test('Math 157 and Math 159 cards in #fmroot and #thmroot elaborate all concepts in their titles', () => {
  const parts = fmHtml.split('<details class="fmt"').slice(1);
  for (const p of parts) {
    const sec = '<details class="fmt"' + p;
    const course = (sec.match(/data-c="([^"]+)"/) || [])[1];
    if (course !== 'M157' && course !== 'M159') continue;
    const cards = sec.split('<div class="fmi ').slice(1);
    for (const c of cards) {
      const k = (c.match(/data-k="([^"]+)"/) || [])[1];
      assert.ok(c.includes('<div class="fmm">'), `Card ${k} in ${course} should have math display block`);
      assert.ok(c.includes('<div class="fmdet">'), `Card ${k} in ${course} should have Where/Use explanation`);
    }
  }

  // Verify specific previously unelaborated theorem cards in #thmroot now have formal statements & equations
  assert.ok(thmHtml.includes('Fundamental Theorem of Calculus (Parts I & II):'), 't-m1573:0 should state FTC Parts I & II');
  assert.ok(thmHtml.includes('Leibnitz\'s Rule (Differentiation Under the Integral Sign):'), 't-m1573:0 should state Leibnitz Rule');
  assert.ok(thmHtml.includes('Riemann Limit of a Sum:'), 't-m1573:2 should state Riemann Limit of a Sum');
  assert.ok(thmHtml.includes('Infinite Products via Definite Integrals:'), 't-m1573:2 should state Infinite Products via Definite Integrals');
  assert.ok(thmHtml.includes('Green\'s Theorem in the Plane:'), 't-m1593:1 should state Green\'s Theorem');
  assert.ok(thmHtml.includes('Stokes\' Curl Theorem:'), 't-m1593:1 should state Stokes\' Theorem');
  assert.ok(thmHtml.includes('Gauss\' Divergence Theorem:'), 't-m1593:1 should state Gauss\' Divergence Theorem');
});

test('PHY 121 theorems and definitions are comprehensively expanded across all three syllabus sections', () => {
  const phySections = ['t-phy1', 't-phy2', 't-phy3'];
  let totalPhyThmCards = 0;
  for (const secId of phySections) {
    const matches = thmHtml.match(new RegExp(`data-k="${secId}:\\d+"`, 'g')) || [];
    totalPhyThmCards += matches.length;
    assert.ok(matches.length >= 12, `PHY 121 section ${secId} should have at least 12 theorem/definition cards (found ${matches.length})`);
  }
  assert.equal(totalPhyThmCards, 37, 'Expected 37 total PHY 121 theorem & definition cards in #thmroot');
});

test('Zero emojis exist anywhere in index.html', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(indexHtml), false, 'index.html must not contain any emojis');
});

test('Zero unescaped angle brackets outside script and style blocks for parse5 compatibility', () => {
  const validTagRe = /^<(\/?[a-zA-Z][a-zA-Z0-9-]*(\s+[a-zA-Z_:][a-zA-Z0-9_.:-]*(="[^"]*"|='[^']*')?)*\s*\/?>|!doctype\s+html>|!--[\s\S]*?-->)/i;
  for (const [name, content] of [['index.html', indexHtml], ['src/content-fmroot.html', fmHtml], ['src/content-thmroot.html', thmHtml]] as const) {
    const masked = content
      .replace(/<style[\s\S]*?<\/style>/gi, m => ' '.repeat(m.length))
      .replace(/<script[\s\S]*?<\/script>/gi, m => ' '.repeat(m.length));
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] === '<') {
        const rest = masked.slice(i, i + 5000);
        assert.ok(validTagRe.test(rest), `Unescaped "<" found in ${name} at offset ${i}: ${rest.slice(0, 60)}`);
      }
    }
  }
});

