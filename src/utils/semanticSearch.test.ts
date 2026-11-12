import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import cardEmbeddingsData from '../data/card-embeddings.json';
import { parseTopicSections } from './contentParser';
import {
  isSemanticAvailable,
  markSemanticUnavailable,
  resetEmbeddingModelForTesting,
} from './embeddingModel';
import { buildFormulaSearchIndex } from './formulaSearch';
import {
  CONFIDENT_LEXICAL_THRESHOLD,
  computeHybridCardScore,
  computeLexicalConfidence,
  dot,
  getSearchDebugMode,
  rankBySemanticSimilarity,
  rankCardsHybrid,
  shouldUseSemanticRanking,
  type CardEmbeddingsFile,
} from './semanticSearch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const fmHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'content-fmroot.html'), 'utf8');
const thmHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'content-thmroot.html'), 'utf8');
const genHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'content-gen.html'), 'utf8');

const allCards = [
  ...parseTopicSections(fmHtml),
  ...parseTopicSections(thmHtml),
  ...parseTopicSections(genHtml),
].flatMap((s) => s.cards);

const precomputedIndexById = new Map(
  allCards.map((c) => [c.id, buildFormulaSearchIndex(c)])
);

const embeddingsFile = cardEmbeddingsData as unknown as CardEmbeddingsFile;

describe('Semantic Search Upgrade — Phase 1 to Phase 4 & Appendix A Verification', () => {
  it('Phase 1: card-embeddings.json covers all cards with 384-d unit vectors and separates related vs unrelated cards', () => {
    assert.equal(embeddingsFile.model, 'Xenova/all-MiniLM-L6-v2');
    assert.equal(embeddingsFile.dim, 384);

    for (const card of allCards) {
      const entry = embeddingsFile.cards[card.id];
      assert.ok(entry, `Missing embedding entry for card ${card.id}`);
      assert.equal(entry.vector.length, 384, `Card ${card.id} vector must have length 384`);
      assert.ok(entry.hash && entry.hash.length >= 8, `Card ${card.id} must have content hash`);
    }

    const thevVec = embeddingsFile.cards['eee-thev:0']?.vector;
    const nortVec = embeddingsFile.cards['eee-thev:1']?.vector;
    const cppVec = embeddingsFile.cards['cse-cpp:0']?.vector;
    assert.ok(thevVec && nortVec && cppVec);

    const relatedCosine = dot(thevVec, nortVec);
    const unrelatedCosine = dot(thevVec, cppVec);
    assert.ok(
      relatedCosine > 0.6,
      `Expected Thevenin & Norton cosine similarity > 0.6, got ${relatedCosine}`
    );
    assert.ok(
      unrelatedCosine < 0.25,
      `Expected Thevenin & C++ Rule of Three cosine similarity < 0.25, got ${unrelatedCosine}`
    );
  });

  it('Phase 2 & 3: debug query parameter parsing and hybrid ranking switches', () => {
    assert.equal(getSearchDebugMode(''), 'auto');
    assert.equal(getSearchDebugMode('?debug=lexical'), 'lexical');
    assert.equal(getSearchDebugMode('?debug=semantic'), 'semantic');
    assert.equal(getSearchDebugMode('?debug=SEMANTIC&foo=1'), 'semantic');
    assert.equal(getSearchDebugMode('?debug=unknown'), 'auto');

    const mockScores = new Map<string, number>([['eee-thev:0', 0.55]]);
    // Above threshold in auto mode -> keep lexical
    assert.equal(
      shouldUseSemanticRanking(CONFIDENT_LEXICAL_THRESHOLD + 200, mockScores, 'auto'),
      false
    );
    // Below threshold in auto mode -> use semantic
    assert.equal(
      shouldUseSemanticRanking(CONFIDENT_LEXICAL_THRESHOLD - 200, mockScores, 'auto'),
      true
    );
    // Forced lexical mode -> never use semantic
    assert.equal(
      shouldUseSemanticRanking(100, mockScores, 'lexical'),
      false
    );
    // Forced semantic mode -> always use semantic when scores exist
    assert.equal(
      shouldUseSemanticRanking(CONFIDENT_LEXICAL_THRESHOLD + 2000, mockScores, 'semantic'),
      true
    );
    // Null scores (still loading) -> immediately render lexical without blocking
    assert.equal(
      shouldUseSemanticRanking(0, null, 'auto'),
      false
    );

    // Hybrid score calculation
    assert.equal(
      computeHybridCardScore('eee-thev:0', 3200, mockScores, false),
      3200
    );
    assert.ok(
      computeHybridCardScore('eee-thev:0', 0, mockScores, true) >= 550
    );
  });

  it('Phase 3 & 4: exact technical keyword queries stay in lexical mode with zero regressions', async () => {
    const exactFixtures: Array<{ query: string; expectedId: string }> = [
      { query: 'Thevenin', expectedId: 'eee-thev:0' },
      { query: 'Norton equivalent', expectedId: 'eee-thev:1' },
      { query: 'Maximum Power Transfer', expectedId: 't-eee1:3' },
      { query: 'Superposition', expectedId: 'eee-thev:3' },
      { query: 'Cauchy-Riemann', expectedId: 'm159-analytic:1' },
      { query: 'Stokes theorem', expectedId: 'm159-thm:1' },
      { query: 'Gauss divergence theorem', expectedId: 'm159-thm:2' },
      { query: 'Leibniz rule', expectedId: 'm157-def:6' },
      { query: 'L Hopital', expectedId: 'm157-limits:1' },
      { query: 'Michelson interferometer', expectedId: 'phy-interf:4' },
      { query: 'Clausius Clapeyron', expectedId: 'phy-maxwell:3' },
      { query: 'Rule of Three', expectedId: 'cse-cpp:0' },
    ];

    for (const item of exactFixtures) {
      const res = await rankCardsHybrid(allCards, item.query, {
        precomputedIndexById,
      });
      assert.equal(
        res.modeUsed,
        'lexical',
        `Expected exact query "${item.query}" to use lexical mode (confidence=${res.bestLexicalConfidence})`
      );
      const top3Ids = res.ranked.slice(0, 3).map((r) => r.card.id);
      assert.ok(
        top3Ids.includes(item.expectedId),
        `Expected "${item.query}" to rank ${item.expectedId} in top 3, got ${top3Ids.join(', ')}`
      );
    }
  });

  it('Phase 4: 20 vague conceptual queries across all 5 courses trigger semantic ranking and place expected card in top 3', async () => {
    const vagueFixtures: Array<{
      query: string;
      course: string;
      expectedIds: string[];
    }> = [
      // EEE 101
      {
        query: 'replace whole circuit with one voltage source and one resistor',
        course: 'EEE',
        expectedIds: ['eee-thev:0', 't-eee1:2'],
      },
      {
        query: 'when maximum power goes to the load',
        course: 'EEE',
        expectedIds: ['t-eee1:3', 'eee-maxp:0', 'eee-maxp:2'],
      },
      {
        query: 'replace network with parallel current source and resistor',
        course: 'EEE',
        expectedIds: ['eee-thev:1', 't-eee1:2'],
      },
      {
        query: 'sum of currents entering a junction equals leaving',
        course: 'EEE',
        expectedIds: ['t-eee1:0', 'eee-basic:1'],
      },
      {
        query: 'convert star resistor network into delta configuration',
        course: 'EEE',
        expectedIds: ['t-eee1:6', 'eee-delta:0', 'eee-delta:1'],
      },
      {
        query: 'capacitor charging voltage over time in rc circuit',
        course: 'EEE',
        expectedIds: ['eee-trans:3', 't-eee2:0'],
      },
      // MATH 159
      {
        query: 'turn a surface integral into a volume integral',
        course: 'M159',
        expectedIds: ['m159-thm:2', 'm159-thm:5'],
      },
      {
        query: 'convert closed line integral around loop into curl surface integral',
        course: 'M159',
        expectedIds: ['m159-thm:1', 't-m1593:11'],
      },
      {
        query: 'partial differential equations satisfied by analytic complex function',
        course: 'M159',
        expectedIds: ['m159-analytic:1', 'm159-analytic:3', 't-m1591:0'],
      },
      {
        query: 'contour integral around isolated singularities using sum of residues',
        course: 'M159',
        expectedIds: ['m159-series:8', 't-m1592:8', 't-m1592:9'],
      },
      {
        query: 'condition for vector field to have zero curl and scalar potential',
        course: 'M159',
        expectedIds: ['t-m1593:0', 'm159-ops:3'],
      },
      // MATH 157
      {
        query: 'derivative of an integral with variable limits',
        course: 'M157',
        expectedIds: ['m157-def:6', 't-m1573:0'],
      },
      {
        query: 'limit of indeterminate zero over zero using derivatives',
        course: 'M157',
        expectedIds: ['m157-limits:1', 't-m1571:5', 't-m1571:7'],
      },
      {
        query: 'volume of solid formed by rotating curve around axis',
        course: 'M157',
        expectedIds: ['m157-appl:1', 't-m1573:8'],
      },
      // PHY 165
      {
        query: 'bouncing between two mirrors interference',
        course: 'PHY',
        expectedIds: ['phy-interf:4', 't-phy2:17', 'phy-interf:2'],
      },
      {
        query: 'bending of light waves passing through a single narrow slit',
        course: 'PHY',
        expectedIds: ['t-phy2:4', 't-phy2:18', 'phy-diff:0'],
      },
      {
        query: 'entropy change in reversible heat transfer',
        course: 'PHY',
        expectedIds: ['phy-entropy:2', 'phy-entropy:0', 't-phy3:19'],
      },
      // CSE 109
      {
        query: 'memory that forgets to be freed in c++',
        course: 'CSE',
        expectedIds: ['cse-ptr:2', 't-cse1:1', 't-cse2:2'],
      },
      {
        query: 'child class overriding virtual method at runtime in c++',
        course: 'CSE',
        expectedIds: ['cse-cpp:2', 'cse-cpp:7', 't-cse2:1'],
      },
      {
        query: 'non-member function allowed to access private class members',
        course: 'CSE',
        expectedIds: ['cse-cpp2:2', 't-cse2:2', 'cse-cpp2:0'],
      },
    ];

    for (const fixture of vagueFixtures) {
      const res = await rankCardsHybrid(allCards, fixture.query, {
        course: fixture.course,
        precomputedIndexById,
      });
      assert.equal(
        res.modeUsed,
        'semantic',
        `Expected vague query "${fixture.query}" to trigger semantic ranking (got lexConfidence=${res.bestLexicalConfidence})`
      );
      const top3Ids = res.ranked.slice(0, 3).map((r) => r.card.id);
      const matched = fixture.expectedIds.some((id) => top3Ids.includes(id));
      assert.ok(
        matched,
        `Expected "${fixture.query}" (${fixture.course}) top 3 [${top3Ids.join(', ')}] to include one of [${fixture.expectedIds.join(', ')}]`
      );
    }
  });

  it('Appendix A: graceful degradation when WASM/network model is unavailable', async () => {
    try {
      markSemanticUnavailable('Simulated offline / blocked HuggingFace Hub');
      assert.equal(isSemanticAvailable(), false);

      const emptyScores = await rankBySemanticSimilarity(
        'replace whole circuit with one voltage source and one resistor'
      );
      assert.equal(emptyScores.size, 0);

      const fallbackRes = await rankCardsHybrid(allCards, 'Thevenin', {
        precomputedIndexById,
      });
      assert.equal(fallbackRes.modeUsed, 'lexical');
      assert.equal(fallbackRes.ranked[0]?.card.id, 'eee-thev:0');
    } finally {
      resetEmbeddingModelForTesting();
      assert.equal(isSemanticAvailable(), true);
    }
  });
});
