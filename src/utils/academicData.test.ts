import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const indexHtml = fs.readFileSync('index.html', 'utf8');
const fmCourseHtml = fs.readFileSync('src/content-fmroot.html', 'utf8');
const genHtml = fs.readFileSync('src/content-gen.html', 'utf8');
const fmHtml = fmCourseHtml + '\n' + genHtml;
const thmHtml = fs.readFileSync('src/content-thmroot.html', 'utf8');

test('index.html has clean Vite entry shell and content modules are non-empty', () => {
  assert.ok(indexHtml.includes('<div id="root"></div>'), 'index.html should contain #root mount node');
  assert.ok(indexHtml.includes('/src/main.tsx'), 'index.html should load /src/main.tsx');
  assert.ok(fmCourseHtml.trim().length > 100000, 'src/content-fmroot.html should contain full course formula markup');
  assert.ok(genHtml.trim().length > 10000, 'src/content-gen.html should contain full GEN module markup');
  assert.ok(thmHtml.trim().length > 100000, 'src/content-thmroot.html should contain full #thmroot markup');
});

test('Task 1 & 6: GEN module is cleanly extracted into src/content-gen.html and all content fixes are applied', () => {
  assert.equal(
    fmCourseHtml.includes('data-c="GEN"'),
    false,
    'src/content-fmroot.html should have all data-c="GEN" sections extracted out'
  );
  const genSections = [
    'fm-gen-math',
    'fm-gen-diff',
    'fm-gen-int',
    'fm-gen-comb',
    'fm-gen-linalg',
    'fm-gen-alg',
    'fm-gen-const',
  ];
  for (const secId of genSections) {
    assert.ok(
      genHtml.includes(`id="${secId}"`),
      `src/content-gen.html must contain GEN section ${secId}`
    );
  }

  // Task 6 checks
  assert.equal(
    thmHtml.includes('<details class="fmp">'),
    false,
    'src/content-thmroot.html must have zero <details class="fmp"> tags'
  );
  assert.ok(
    thmHtml.includes('2(|Z_{\\text{Th}}| + R_{\\text{Th}})}$.') &&
      thmHtml.includes('2(|Z_{\\text{Th}}| + R_{\\text{Th}})}$.\x3c/p>\x3c/div>'),
    't-eee1:13 must have closing </p> before </div>'
  );
  for (const k of ['m157-appl:9', 'm157-appl:11', 'm157-appl:12']) {
    const idx = fmCourseHtml.indexOf(`data-k="${k}"`);
    const fmmBlock = fmCourseHtml.slice(idx, idx + 2500);
    assert.ok(
      fmmBlock.includes('<div class="fmm">$$') && fmmBlock.includes('$$</div>'),
      `${k} must wrap LaTeX inside <div class="fmm">$$ ... $$</div>`
    );
  }
  assert.ok(
    fmCourseHtml.includes('\\frac{\\ln(s_2/s_1)}{s_1-s_2}'),
    'eee-trans:17 Use text must use \\frac{\\ln(s_2/s_1)}{s_1-s_2}'
  );
  assert.ok(
    fmCourseHtml.includes('s_1 = -13.8197\\text{ s}^{-1},\\ s_2 = -36.1803\\text{ s}^{-1}'),
    'eee-trans:17 worked airbag igniter steps must match t-eee2:8'
  );
  assert.equal(
    genHtml.includes('class="fmck"'),
    false,
    'src/content-gen.html must not contain any learned checkboxes'
  );
  assert.equal(
    genHtml.includes('class="fmcnt"'),
    false,
    'src/content-gen.html must not contain any learned counters'
  );
  assert.equal(
    genHtml.includes('**'),
    false,
    'src/content-gen.html must not contain raw ** Markdown bolding asterisks'
  );
  assert.equal(
    genHtml.trim().endsWith('</main>'),
    false,
    'src/content-gen.html must not end with a stray closing </main> tag'
  );
});

test('Zero data loss: all original 32 theorem data-k keys and all 526 formula cards (482 course + 44 GEN cards) and 161 theorem cards are preserved', () => {
  const fmCards = fmHtml.match(/<div class="fmi /g) || [];
  const thmCards = thmHtml.match(/<div class="fmi /g) || [];
  assert.equal(fmCards.length, 526, 'Expected 526 formula cards across content-fmroot.html + content-gen.html');
  assert.equal(thmCards.length, 161, 'Expected 161 theorem/definition cards in #thmroot');

  const cseCompendiumKeys = [
    'cse-c:3', 'cse-c:4', 'cse-c:5', 'cse-c:6', 'cse-c:7', 'cse-c:8', 'cse-c:9',
    'cse-lib:1',
    'cse-ptr:3', 'cse-ptr:4', 'cse-ptr:5', 'cse-ptr:6', 'cse-ptr:7',
    'cse-str:2', 'cse-str:3', 'cse-str:4', 'cse-str:5', 'cse-str:6', 'cse-str:7', 'cse-str:8', 'cse-str:9',
    'cse-file:2', 'cse-file:3', 'cse-file:4', 'cse-file:5', 'cse-file:6', 'cse-file:7', 'cse-file:8',
    'cse-bit:2', 'cse-bit:3', 'cse-bit:4', 'cse-bit:5', 'cse-bit:6',
    'cse-num:1',
    'cse-algo:2', 'cse-algo:3', 'cse-algo:4', 'cse-algo:5', 'cse-algo:6',
    'cse-pat:1', 'cse-pat:2', 'cse-pat:3', 'cse-pat:4', 'cse-pat:5',
    'cse-cpp:3', 'cse-cpp:4', 'cse-cpp:5', 'cse-cpp:6', 'cse-cpp:7',
    'cse-cpp2:2',
  ];
  for (const k of cseCompendiumKeys) {
    assert.ok(fmHtml.includes(`data-k="${k}"`), `Missing CSE 109 card ${k}`);
  }
  for (const tk of ['t-cse1:2', 't-cse1:3', 't-cse1:4', 't-cse2:2', 't-cse2:3']) {
    assert.ok(thmHtml.includes(`data-k="${tk}"`), `Missing CSE 109 theory card ${tk}`);
  }

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

test('EEE-101 includes series/parallel RLC, damping formulas, general 2nd-order circuit steps, and all 2010–2025 definitions, proofs & worked problems', () => {
  const eeeFmKeys = [
    'eee-basic:11', 'eee-basic:12', 'eee-basic:13', 'eee-basic:14',
    'eee-delta:6', 'eee-delta:7',
    'eee-nodal:7',
    'eee-thev:6',
    'eee-maxp:6', 'eee-maxp:7',
    'eee-lc:11', 'eee-lc:12',
    'eee-trans:10', 'eee-trans:11', 'eee-trans:12', 'eee-trans:13', 'eee-trans:14', 'eee-trans:15', 'eee-trans:16', 'eee-trans:17',
    'eee-ac:17',
    'eee-mag:10',
  ];
  for (const k of eeeFmKeys) {
    assert.ok(fmHtml.includes(`data-k="${k}"`), `Missing EEE-101 formula card ${k} in #fmroot`);
  }

  const eeeThmKeys = [
    't-eee1:0', 't-eee1:1', 't-eee1:2', 't-eee1:3', 't-eee1:4', 't-eee1:5', 't-eee1:6',
    't-eee1:7', 't-eee1:8', 't-eee1:9', 't-eee1:10', 't-eee1:11', 't-eee1:12', 't-eee1:13',
    't-eee2:0', 't-eee2:1', 't-eee2:2', 't-eee2:3', 't-eee2:4',
    't-eee2:5', 't-eee2:6', 't-eee2:7', 't-eee2:8', 't-eee2:9', 't-eee2:10', 't-eee2:11',
  ];
  for (const k of eeeThmKeys) {
    assert.ok(thmHtml.includes(`data-k="${k}"`), `Missing EEE-101 theorem/definition card ${k} in #thmroot`);
  }
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

  assert.ok(thmHtml.includes('Fundamental Theorem of Calculus (Parts I & II):'), 't-m1573:0 should state FTC Parts I & II');
  assert.ok(thmHtml.includes('Leibnitz\'s Rule (Differentiation Under the Integral Sign):'), 't-m1573:0 should state Leibnitz Rule');
  assert.ok(thmHtml.includes('Riemann Limit of a Sum:'), 't-m1573:2 should state Riemann Limit of a Sum');
  assert.ok(thmHtml.includes('Infinite Products via Definite Integrals:'), 't-m1573:2 should state Infinite Products via Definite Integrals');
  assert.ok(thmHtml.includes('Green\'s Theorem in the Plane:'), 't-m1593:1 should state Green\'s Theorem');
  assert.ok(thmHtml.includes('Stokes\' Curl Theorem:'), 't-m1593:1 should state Stokes\' Theorem');
  assert.ok(thmHtml.includes('Gauss\' Divergence Theorem:'), 't-m1593:1 should state Gauss\' Divergence Theorem');
});

test('MATH 157 (Calculus I) Equations 1–55, definitions, theorems, proofs, optimization & curve-tracing tables are comprehensively integrated', () => {
  const m157FmKeys = [
    'm157-limits:6', 'm157-limits:7', 'm157-limits:8',
    'm157-mvt:5', 'm157-mvt:6',
    'm157-succ:13', 'm157-succ:14', 'm157-succ:15',
    'm157-partial:11', 'm157-partial:12',
    'm157-maxmin:7',
    'm157-curv:11', 'm157-curv:12',
    'm157-integ:16',
    'm157-reduc:7',
    'm157-def:7',
    'm157-gamma:7',
    'm157-appl:13',
  ];
  for (const k of m157FmKeys) {
    assert.ok(fmHtml.includes(`data-k="${k}"`), `Missing MATH 157 formula card ${k} in #fmroot`);
  }

  const m157ThmKeys = [
    't-m1571:6', 't-m1571:7', 't-m1571:8', 't-m1571:9', 't-m1571:10',
    't-m1572:5', 't-m1572:6', 't-m1572:7', 't-m1572:8',
    't-m1573:5', 't-m1573:6', 't-m1573:7', 't-m1573:8',
  ];
  for (const k of m157ThmKeys) {
    assert.ok(thmHtml.includes(`data-k="${k}"`), `Missing MATH 157 theorem/definition card ${k} in #thmroot`);
  }
});

test('MATH 159 theorems, laws, definitions, short proofs, and formulas are comprehensively expanded across all sections', () => {
  const m159FmKeys = [
    'm159-complexnum:15', 'm159-complexnum:16',
    'm159-analytic:11',
    'm159-cint:10',
    'm159-series:12',
    'm159-vec:7',
    'm159-ops:6',
    'm159-int:3',
    'm159-int:4',
    'm159-thm:4',
    'm159-thm:5',
  ];
  for (const k of m159FmKeys) {
    assert.ok(fmHtml.includes(`data-k="${k}"`), `Missing MATH 159 formula card ${k} in #fmroot`);
  }

  const m159ThmKeys = [
    't-m1591:5', 't-m1591:6', 't-m1591:7', 't-m1591:8', 't-m1591:9', 't-m1591:10',
    't-m1592:5', 't-m1592:6', 't-m1592:7', 't-m1592:8', 't-m1592:9',
    't-m1593:5', 't-m1593:6', 't-m1593:7', 't-m1593:8', 't-m1593:9', 't-m1593:10', 't-m1593:11', 't-m1593:12',
  ];
  for (const k of m159ThmKeys) {
    assert.ok(thmHtml.includes(`data-k="${k}"`), `Missing MATH 159 theorem/definition card ${k} in #thmroot`);
  }

  // Verify Cylindrical & Spherical coordinates for double & triple integrals in Surface Integral and Divergence Theorem sections
  assert.ok(
    fmHtml.includes('dV = r\\,dz\\,dr\\,d\\theta') && fmHtml.includes('dV = \\rho^2\\sin\\varphi\\,d\\rho\\,d\\varphi\\,d\\theta'),
    'MATH 159 must include cylindrical and spherical triple integral volume elements'
  );
  assert.ok(
    fmHtml.includes('dS_{\\text{cyl}}(r=R) = R\\,dz\\,d\\theta') && fmHtml.includes('dS_{\\text{sph}} = R^2\\sin\\varphi\\,d\\varphi\\,d\\theta'),
    'MATH 159 must include cylindrical and spherical surface (double) integral elements'
  );

  // Verify every <div class="fmm"> across all files uses $$...$$ display delimiters
  for (const [label, html] of [['fmHtml', fmHtml], ['thmHtml', thmHtml]] as const) {
    const fmmMatches = html.match(/<div class="fmm">[\s\S]*?<\/div>/g) || [];
    for (const m of fmmMatches) {
      assert.ok(
        m.startsWith('<div class="fmm">$$') && m.endsWith('$$</div>'),
        `Every .fmm in ${label} must start with <div class="fmm">$$ and end with $$</div>, got: ${m.slice(0, 60)}`
      );
    }
  }
});

test('PHY 121 theorems and definitions are comprehensively expanded across all three syllabus sections', () => {
  const phySections = ['t-phy1', 't-phy2', 't-phy3'];
  let totalPhyThmCards = 0;
  for (const secId of phySections) {
    const matches = thmHtml.match(new RegExp(`data-k="${secId}:\\d+"`, 'g')) || [];
    totalPhyThmCards += matches.length;
    assert.ok(matches.length >= 20, `PHY 121 section ${secId} should have at least 20 theorem/definition cards (found ${matches.length})`);
  }
  assert.equal(totalPhyThmCards, 63, 'Expected 63 total PHY 121 theorem & definition cards in #thmroot');

  const phyAtlasFmKeys = [
    'phy-shm:6', 'phy-shm:7', 'phy-shm:8', 'phy-shm:9',
    'phy-damp:3',
    'phy-forced:3', 'phy-forced:4',
    'phy-wave:5', 'phy-wave:6', 'phy-wave:7',
    'phy-interf:5', 'phy-interf:6',
    'phy-diff:4', 'phy-diff:5',
    'phy-polar:3',
    'phy-aber:2', 'phy-aber:3',
    'phy-thermo:3', 'phy-thermo:4',
    'phy-entropy:3',
    'phy-maxwell:4', 'phy-maxwell:5', 'phy-maxwell:6',
    'phy-kinetic:3', 'phy-kinetic:4', 'phy-kinetic:5',
    'gen-const:1',
  ];
  for (const k of phyAtlasFmKeys) {
    assert.ok(fmHtml.includes(`data-k="${k}"`), `Missing PHY 121 Formula Atlas card ${k}`);
  }

  const phyAtlasThmKeys = [
    't-phy1:13', 't-phy1:14', 't-phy1:15', 't-phy1:16', 't-phy1:17', 't-phy1:18', 't-phy1:19', 't-phy1:20', 't-phy1:21',
    't-phy2:12', 't-phy2:13', 't-phy2:14', 't-phy2:15', 't-phy2:16', 't-phy2:17', 't-phy2:18', 't-phy2:19', 't-phy2:20',
    't-phy3:12', 't-phy3:13', 't-phy3:14', 't-phy3:15', 't-phy3:16', 't-phy3:17', 't-phy3:18', 't-phy3:19',
  ];
  for (const k of phyAtlasThmKeys) {
    assert.ok(thmHtml.includes(`data-k="${k}"`), `Missing PHY 121 theorem/definition card ${k} in #thmroot`);
  }
});

test('Zero emojis exist anywhere in index.html', () => {
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  assert.equal(emojiRegex.test(indexHtml), false, 'index.html must not contain any emojis');
});

test('Zero unescaped angle brackets outside script and style blocks for parse5 compatibility', () => {
  const validTagRe = /^<(\/?[a-zA-Z][a-zA-Z0-9-]*(\s+[a-zA-Z_:][a-zA-Z0-9_.:-]*(="[^"]*"|='[^']*')?)*\s*\/?>|!doctype\s+html>|!--[\s\S]*?-->)/i;
  for (const [name, content] of [['index.html', indexHtml], ['src/content-fmroot.html', fmCourseHtml], ['src/content-gen.html', genHtml], ['src/content-thmroot.html', thmHtml]] as const) {
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
