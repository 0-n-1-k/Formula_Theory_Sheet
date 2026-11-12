import type { FeatureExtractionPipeline } from '@huggingface/transformers';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let semanticAvailable = true;

export function isSemanticAvailable(): boolean {
  return semanticAvailable;
}

export function markSemanticUnavailable(reason?: unknown): void {
  if (semanticAvailable) {
    semanticAvailable = false;
    extractorPromise = null;
    if (reason !== undefined) {
      console.warn('[embeddingModel] Semantic model unavailable; degrading to lexical search for this session:', reason);
    }
  }
}

export function resetEmbeddingModelForTesting(): void {
  semanticAvailable = true;
}

/**
 * Lazy singleton loader for the in-browser quantized MiniLM feature-extraction model.
 * Never call on app boot — invoke on first search input focus or when a semantic pass runs.
 * If WASM or network loading fails, sets `semanticAvailable = false` and never retries mid-session.
 */
export function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!semanticAvailable) {
    return Promise.reject(new Error('Semantic embedding model is unavailable in this session.'));
  }
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers')
      .then(
        ({ pipeline }) =>
          pipeline('feature-extraction', MODEL_ID, {
            dtype: 'q8',
          }) as unknown as Promise<FeatureExtractionPipeline>
      )
      .catch((err) => {
        markSemanticUnavailable(err);
        throw err;
      });
  }
  return extractorPromise;
}

/**
 * Triggers a background preload of the embedding pipeline without throwing if offline/unsupported.
 */
export function warmUpEmbeddingModel(): void {
  if (!semanticAvailable) return;
  void getExtractor().catch(() => {
    // Silently degrade to lexical-only search per Appendix A
  });
}
