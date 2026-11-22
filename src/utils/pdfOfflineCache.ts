export const PDF_OFFLINE_CACHE_NAME = 'buet-eee-practice-pdfs-v1';

export function isCacheApiSupported(): boolean {
  return typeof window !== 'undefined' && 'caches' in window && typeof window.caches?.open === 'function';
}

export async function isPdfCachedOffline(pdfUrl: string): Promise<boolean> {
  if (!pdfUrl || !isCacheApiSupported()) return false;
  try {
    const cache = await window.caches.open(PDF_OFFLINE_CACHE_NAME);
    const match = await cache.match(pdfUrl);
    return Boolean(match);
  } catch {
    return false;
  }
}

export async function cachePdfOffline(pdfUrl: string): Promise<boolean> {
  if (!pdfUrl || !isCacheApiSupported()) return false;
  try {
    const res = await fetch(pdfUrl, { cache: 'no-cache' });
    if (!res.ok) return false;
    const cache = await window.caches.open(PDF_OFFLINE_CACHE_NAME);
    await cache.put(pdfUrl, res.clone());
    return true;
  } catch {
    return false;
  }
}

export async function removeCachedPdfOffline(pdfUrl: string): Promise<boolean> {
  if (!pdfUrl || !isCacheApiSupported()) return false;
  try {
    const cache = await window.caches.open(PDF_OFFLINE_CACHE_NAME);
    return await cache.delete(pdfUrl);
  } catch {
    return false;
  }
}

export async function fetchPdfArrayBufferWithOfflineFallback(pdfUrl: string): Promise<ArrayBuffer> {
  if (isCacheApiSupported()) {
    try {
      const cache = await window.caches.open(PDF_OFFLINE_CACHE_NAME);
      const cached = await cache.match(pdfUrl);
      if (cached && cached.ok) {
        return await cached.arrayBuffer();
      }
    } catch {
      // Fall through to network fetch
    }
  }
  const res = await fetch(pdfUrl);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.arrayBuffer();
}
