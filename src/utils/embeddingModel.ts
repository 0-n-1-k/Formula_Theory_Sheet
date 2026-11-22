import type { FeatureExtractionPipeline } from '@huggingface/transformers';

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let semanticAvailable = true;
let semanticUnavailableReason: string | null = null;

export function isSemanticAvailable(): boolean {
  return semanticAvailable;
}

export function isEmbeddingModelLoaded(): boolean {
  return extractorPromise !== null && semanticAvailable;
}

export function getSemanticUnavailableReason(): string | null {
  return semanticUnavailableReason;
}

export function markSemanticUnavailable(reason?: unknown): void {
  if (semanticAvailable) {
    semanticAvailable = false;
    extractorPromise = null;
    semanticUnavailableReason =
      reason instanceof Error ? reason.message : reason !== undefined ? String(reason) : 'Unavailable';
    if (reason !== undefined) {
      console.warn('[embeddingModel] Semantic model unavailable; degrading to lexical search for this session:', reason);
    }
  }
}

export function resetEmbeddingModelForTesting(): void {
  semanticAvailable = true;
  semanticUnavailableReason = null;
  extractorPromise = null;
}

/**
 * Lazy singleton loader for the in-browser quantized MiniLM feature-extraction model.
 * Never call on app boot or eagerly on search focus — only invoked automatically
 * when a query needs semantic fallback on an eligible connection.
 */
export function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!semanticAvailable) {
    return Promise.reject(
      new Error(semanticUnavailableReason || 'Semantic embedding model is unavailable in this session.')
    );
  }
  if (typeof WebAssembly === 'undefined') {
    const err = new Error('WebAssembly is not supported in this browser.');
    markSemanticUnavailable(err);
    return Promise.reject(err);
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false && !extractorPromise) {
    const err = new Error('Browser is offline; skipping WASM embedding model download.');
    markSemanticUnavailable(err);
    return Promise.reject(err);
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

export function warmUpEmbeddingModel(): void {
  if (!semanticAvailable) return;
  void getExtractor().catch(() => {
    // Degrade to lexical search on failure
  });
}
