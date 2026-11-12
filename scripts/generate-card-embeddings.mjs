import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from '@huggingface/transformers';
import { register } from 'tsx/esm/api';

// Register tsx loader so Node can import ../src/utils/contentParser.ts directly
register();

const { parseTopicSections } = await import('../src/utils/contentParser.ts');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;
const OUTPUT_PATH = path.join(ROOT_DIR, 'src', 'data', 'card-embeddings.json');

/**
 * Strips HTML markup, code blocks, and LaTeX delimiters/commands so the sentence-embedding
 * model receives clean natural-language prose.
 */
export function stripMarkupForEmbedding(raw) {
  if (!raw) return '';
  return String(raw)
    // Remove code blocks, inline code, and HTML tables completely
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<code[\s\S]*?<\/code>/gi, ' ')
    .replace(/<table[\s\S]*?<\/table>/gi, ' ')
    // Remove display math blocks $$...$$
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    // Remove inline LaTeX math $...$ (leaving only prose words if \text{...} was used)
    .replace(/\$([^$]+)\$/g, (_, inner) => {
      const textMatches = [...inner.matchAll(/\\(?:text|textbf|textrm|mathrm)\{([^{}]*)\}/g)];
      return textMatches.length > 0 ? ' ' + textMatches.map((m) => m[1]).join(' ') + ' ' : ' ';
    })
    // Strip sub/sup tags while keeping their inner text (e.g. V<sub>oc</sub> -> Voc)
    .replace(/<\/?(?:sub|sup)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    // Strip past-paper exam citations like (2019–20 Q.1b) or BUET 2024–25 Q.5a
    .replace(/\b(?:BUET\s*)?\d{4}[–-]\d{2,4}\s*Q\.?\s*\d+[a-z]?/gi, ' ')
    .replace(/\([^)]*\d{4}[–-]\d{2}[^)]*\)/g, ' ')
    // Remove boilerplate field prefixes
    .replace(/\b(?:Where|Use|Conditions|Exam Application|Note)\s*:/gi, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds the semantic text string for a FormulaCardRecord in priority order:
 * title, useText, bodyText, note (plus prose htmlContent and topicTitle),
 * leaving out rawLatex and code blocks entirely.
 */
export function buildCardSemanticText(card) {
  const parts = [
    stripMarkupForEmbedding(card.title),
    stripMarkupForEmbedding(card.useText),
    stripMarkupForEmbedding(card.htmlContent),
    stripMarkupForEmbedding(card.bodyText),
    stripMarkupForEmbedding(card.note),
    stripMarkupForEmbedding(card.topicTitle),
  ].filter(Boolean);

  return parts.join('. ').replace(/\.\s*\./g, '.').trim();
}

export function hashSemanticText(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
}

async function main() {
  const fmHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'content-fmroot.html'), 'utf8');
  const thmHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'content-thmroot.html'), 'utf8');
  const genHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'content-gen.html'), 'utf8');

  const allSections = [
    ...parseTopicSections(fmHtml),
    ...parseTopicSections(thmHtml),
    ...parseTopicSections(genHtml),
  ];

  /** @type {Array<import('../src/utils/formulaSearch').FormulaCardRecord>} */
  const allCards = [];
  for (const section of allSections) {
    for (const card of section.cards) {
      allCards.push(card);
    }
  }

  let existingCards = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
      if (parsed && parsed.model === MODEL_ID && parsed.cards && typeof parsed.cards === 'object') {
        existingCards = parsed.cards;
      }
    } catch {
      existingCards = {};
    }
  }

  const cardsToEmbed = [];
  const nextCards = {};
  let reusedCount = 0;

  for (const card of allCards) {
    const semanticText = buildCardSemanticText(card);
    const hash = hashSemanticText(semanticText);
    const prev = existingCards[card.id];
    if (
      prev &&
      prev.hash === hash &&
      Array.isArray(prev.vector) &&
      prev.vector.length === EMBEDDING_DIM
    ) {
      nextCards[card.id] = prev;
      reusedCount++;
    } else {
      cardsToEmbed.push({ id: card.id, semanticText, hash });
    }
  }

  console.log(
    `[embeddings:build] Total cards: ${allCards.length} | Reused unchanged: ${reusedCount} | To embed: ${cardsToEmbed.length}`
  );

  if (cardsToEmbed.length > 0) {
    const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });
    for (let i = 0; i < cardsToEmbed.length; i++) {
      const { id, semanticText, hash } = cardsToEmbed[i];
      const output = await extractor(semanticText, { pooling: 'mean', normalize: true });
      // Round to 6 decimal places to keep JSON compact while preserving full cosine accuracy
      const vector = Array.from(output.data, (v) => Number(v.toFixed(6)));
      nextCards[id] = { hash, vector };
      if ((i + 1) % 100 === 0 || i + 1 === cardsToEmbed.length) {
        console.log(`[embeddings:build] Embedded ${i + 1}/${cardsToEmbed.length} cards...`);
      }
    }
  }

  // Preserve deterministic card ordering matching content files
  const orderedCards = {};
  for (const card of allCards) {
    if (nextCards[card.id]) {
      orderedCards[card.id] = nextCards[card.id];
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const payload = {
    model: MODEL_ID,
    dim: EMBEDDING_DIM,
    generatedAt: new Date().toISOString(),
    cards: orderedCards,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`[embeddings:build] Wrote ${Object.keys(orderedCards).length} card vectors to ${OUTPUT_PATH}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((err) => {
    console.error('[embeddings:build] Failed:', err);
    process.exit(1);
  });
}
