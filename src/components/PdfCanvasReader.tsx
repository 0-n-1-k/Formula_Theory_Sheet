import React, { memo, useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  cachePdfOffline,
  fetchPdfArrayBufferWithOfflineFallback,
  isCacheApiSupported,
  isPdfCachedOffline,
  removeCachedPdfOffline,
} from '../utils/pdfOfflineCache';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DOT_ASCII_MAGNIFIER = [' ••• ', '•   •', ' •••\\'].join('\n');

interface PdfPageCanvasProps {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  onPageVisible?: (pageNumber: number) => void;
}

const PdfPageCanvas = memo(function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  onPageVisible,
}: PdfPageCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(pageNumber <= 2);
  const [baseDims, setBaseDims] = useState<{ width: number; height: number }>({
    width: 612,
    height: 792,
  });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const stageRoot = el.closest('.pdf-canvas-stage');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsVisible(entry.isIntersecting);
          if (entry.isIntersecting && entry.intersectionRatio >= 0.35) {
            onPageVisible?.(pageNumber);
          }
        }
      },
      { root: stageRoot, rootMargin: '600px 0px', threshold: [0, 0.35, 0.65] }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [pageNumber, onPageVisible]);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    let renderTask: pdfjsLib.RenderTask | null = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        setBaseDims((prev) =>
          prev.width === baseViewport.width && prev.height === baseViewport.height
            ? prev
            : { width: baseViewport.width, height: baseViewport.height }
        );
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const outputViewport = page.getViewport({ scale: scale * dpr });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.round(outputViewport.width);
        canvas.height = Math.round(outputViewport.height);
        canvas.style.width = `${Math.round(viewport.width)}px`;
        canvas.style.height = `${Math.round(viewport.height)}px`;

        renderTask = page.render({
          canvasContext: ctx,
          canvas,
          viewport: outputViewport,
        });
        await renderTask.promise;
      } catch {
        // Ignore cancelled render tasks
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Ignore cancel error
        }
      }
    };
  }, [pdfDoc, pageNumber, scale, isVisible]);

  return (
    <div
      ref={wrapperRef}
      id={`pdf-page-${pageNumber}`}
      className="pdf-canvas-page"
      style={{
        minHeight: `${Math.round(baseDims.height * scale)}px`,
      }}
    >
      <div className="pdf-page-surface">
        <canvas
          ref={canvasRef}
          className="pdf-page-canvas"
          style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
        />
        <span className="ntype-badge pdf-page-badge">PG {pageNumber}</span>
      </div>
    </div>
  );
});

export interface PdfCanvasReaderProps {
  pdfUrl: string;
  title: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onStageClick?: () => void;
  onToggleHud?: () => void;
  isHudOpen?: boolean;
}

export const PdfCanvasReader = memo(function PdfCanvasReader({
  pdfUrl,
  title,
  isFullscreen,
  onToggleFullscreen,
  onStageClick,
  onToggleHud,
  isHudOpen,
}: PdfCanvasReaderProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.35);
  const deferredScale = useDeferredValue(scale);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [retryNonce, setRetryNonce] = useState<number>(0);
  const [jumpPage, setJumpPage] = useState<string>('1');
  const [pageInputFocused, setPageInputFocused] = useState<boolean>(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState<boolean>(false);
  const [offlineState, setOfflineState] = useState<'idle' | 'saving' | 'cached'>('idle');
  const cacheSupported = isCacheApiSupported();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const basePageWidthRef = useRef<number>(612);
  const currentPageRef = useRef<number>(1);
  const zoomGroupRef = useRef<HTMLDivElement | null>(null);

  const computeFitWidthScale = useCallback(() => {
    const stageWidth =
      stageRef.current?.clientWidth ||
      (typeof window !== 'undefined' ? window.innerWidth : 1200);
    const paddingAllowance = isFullscreen ? 16 : 24;
    const availableWidth = Math.max(300, stageWidth - paddingAllowance);
    const rawScale = availableWidth / (basePageWidthRef.current || 612);
    return Math.max(0.75, Math.min(3.0, Number(rawScale.toFixed(2))));
  }, [isFullscreen]);

  const handleResetZoomFitWidth = useCallback(() => {
    setScale(computeFitWidthScale());
  }, [computeFitWidthScale]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const handleDocMouseDown = (e: MouseEvent) => {
      if (
        zoomGroupRef.current &&
        e.target instanceof Node &&
        !zoomGroupRef.current.contains(e.target)
      ) {
        setZoomMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [zoomMenuOpen]);

  useEffect(() => {
    let active = true;
    isPdfCachedOffline(pdfUrl).then((cached) => {
      if (active) {
        setOfflineState(cached ? 'cached' : 'idle');
      }
    });
    return () => {
      active = false;
    };
  }, [pdfUrl]);

  const handleToggleOfflineCache = useCallback(async () => {
    if (!cacheSupported || offlineState === 'saving') return;
    if (offlineState === 'cached') {
      await removeCachedPdfOffline(pdfUrl);
      setOfflineState('idle');
      return;
    }
    setOfflineState('saving');
    const ok = await cachePdfOffline(pdfUrl);
    setOfflineState(ok ? 'cached' : 'idle');
  }, [cacheSupported, offlineState, pdfUrl]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg('');
    setPdfDoc(null);
    setNumPages(0);
    setJumpPage('1');
    currentPageRef.current = 1;

    (async () => {
      try {
        const buffer = await fetchPdfArrayBufferWithOfflineFallback(pdfUrl);
        if (cancelled) return;
        const loadingTask = pdfjsLib.getDocument({
          data: buffer,
          isEvalSupported: false,
        } as Parameters<typeof pdfjsLib.getDocument>[0]);
        const doc = await loadingTask.promise;
        if (cancelled) return;
        try {
          const firstPage = await doc.getPage(1);
          const vp1 = firstPage.getViewport({ scale: 1 });
          if (vp1.width > 0) {
            basePageWidthRef.current = vp1.width;
          }
        } catch {
          basePageWidthRef.current = 612;
        }
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
        const stageWidth =
          stageRef.current?.clientWidth ||
          (typeof window !== 'undefined' ? window.innerWidth : 1200);
        const availableWidth = Math.max(300, stageWidth - 20);
        const initialScale = Math.max(
          0.85,
          Math.min(2.8, Number((availableWidth / basePageWidthRef.current).toFixed(2)))
        );
        setScale(initialScale);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'Failed to load PDF');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfUrl, retryNonce]);

  // Adjust to fit-width when entering or exiting fullscreen so there is zero wasted side space
  useEffect(() => {
    if (!pdfDoc) return;
    const rafId = window.requestAnimationFrame(() => {
      setScale(computeFitWidthScale());
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isFullscreen, pdfDoc, computeFitWidthScale]);

  // Preserve current page scroll position when zoom scale or fullscreen state changes
  useEffect(() => {
    if (!pdfDoc || !stageRef.current) return;
    const activePage = currentPageRef.current;
    if (activePage <= 1) return;
    const rafId = window.requestAnimationFrame(() => {
      const stageEl = stageRef.current;
      const target = stageEl?.querySelector<HTMLElement>(`#pdf-page-${activePage}`);
      if (stageEl && target) {
        stageEl.scrollTop = target.offsetTop;
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [scale, isFullscreen, pdfDoc]);

  const handleJumpToPage = useCallback(
    (pageNum: number) => {
      if (!stageRef.current || pageNum < 1 || pageNum > numPages) return;
      currentPageRef.current = pageNum;
      const target = stageRef.current.querySelector<HTMLElement>(`#pdf-page-${pageNum}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [numPages]
  );

  const handlePageVisible = useCallback(
    (pageNum: number) => {
      currentPageRef.current = pageNum;
      if (!pageInputFocused) {
        setJumpPage(String(pageNum));
      }
    },
    [pageInputFocused]
  );

  return (
    <div
      className={`pdf-canvas-reader${isFullscreen ? ' is-fullscreen' : ''}`}
      aria-label={`${title} PDF Reader`}
    >
      <div
        ref={stageRef}
        className="pdf-canvas-stage"
        onClick={() => {
          setZoomMenuOpen(false);
          onStageClick?.();
        }}
      >
        {loading ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <span className="ntype-badge">[RENDERING PDF DOCUMENT // PLEASE WAIT...]</span>
          </div>
        ) : errorMsg ? (
          <div className="pdf-error-panel" role="alert">
            <div className="pdf-error-badge">[:: PDF ENGINE ERROR ::]</div>
            <p className="pdf-error-title">Unable to render this PDF in the canvas reader.</p>
            <p className="pdf-error-detail">{errorMsg}</p>
            <div className="pdf-error-actions">
              <button
                type="button"
                className="pdf-ctrl-btn pdf-error-retry-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setRetryNonce((n) => n + 1);
                }}
              >
                [RETRY]
              </button>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="pdf-ctrl-btn pdf-error-open-link"
                onClick={(e) => e.stopPropagation()}
              >
                [OPEN PDF DIRECTLY]
              </a>
            </div>
          </div>
        ) : pdfDoc ? (
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfPageCanvas
              key={pageNum}
              pdfDoc={pdfDoc}
              pageNumber={pageNum}
              scale={deferredScale}
              onPageVisible={handlePageVisible}
            />
          ))
        ) : null}
      </div>

      <div
        className={`pdf-floating-controls${zoomMenuOpen ? ' menu-open' : ''}`}
        id="pdfFloatingControls"
        role="toolbar"
        aria-label="PDF Navigation, Zoom and Fullscreen Controls"
      >
        <div className="pdf-ctrl-group">
          <label htmlFor="pdfJumpPageInput" className="pdf-ctrl-label">
            [PG
          </label>
          <input
            id="pdfJumpPageInput"
            type="number"
            className="pdf-page-input"
            min={1}
            max={Math.max(1, numPages)}
            value={jumpPage}
            aria-label="Current PDF page number"
            onFocus={() => setPageInputFocused(true)}
            onBlur={() => setPageInputFocused(false)}
            onChange={(e) => {
              setJumpPage(e.target.value);
              const n = Number.parseInt(e.target.value, 10);
              if (!Number.isNaN(n)) {
                handleJumpToPage(n);
              }
            }}
          />
          <span className="pdf-ctrl-label">/ {numPages || 1}]</span>
        </div>

        <span className="pdf-ctrl-divider" aria-hidden="true" />

        <div className="pdf-ctrl-group pdf-zoom-group" ref={zoomGroupRef}>
          {zoomMenuOpen ? (
            <div
              className="pdf-zoom-dropup"
              id="pdfZoomDropup"
              role="dialog"
              aria-label="PDF Zoom Slider Menu"
            >
              <div className="pdf-zoom-dropup-head">
                <span className="ntype-badge" style={{ color: 'var(--accent)', fontSize: 'var(--fs-2xs)' }}>
                  ZOOM // {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  className="fm-hud-btn"
                  id="pdfFitWidthBtn"
                  data-tip="Fit page to width"
                  data-tip-tone="neutral"
                  onClick={handleResetZoomFitWidth}
                >
                  [FIT WIDTH]
                </button>
              </div>
              <div className="pdf-zoom-slider-row">
                <button
                  type="button"
                  className="pdf-ctrl-btn"
                  aria-label="Decrease PDF zoom in slider menu"
                  onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.1).toFixed(2))))}
                >
                  [-]
                </button>
                <input
                  id="pdfZoomSlider"
                  type="range"
                  className="pdf-zoom-slider"
                  min={60}
                  max={320}
                  step={5}
                  value={Math.round(scale * 100)}
                  aria-label="PDF Zoom Percentage Slider"
                  onChange={(e) => {
                    const pct = Number(e.target.value);
                    if (Number.isFinite(pct)) {
                      setScale(Number((pct / 100).toFixed(2)));
                    }
                  }}
                />
                <button
                  type="button"
                  className="pdf-ctrl-btn"
                  aria-label="Increase PDF zoom in slider menu"
                  onClick={() => setScale((s) => Math.min(3.2, Number((s + 0.1).toFixed(2))))}
                >
                  [+]
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            className="pdf-ctrl-btn"
            aria-label="Zoom out PDF"
            data-tip="Zoom out"
            data-tip-tone="neutral"
            onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.2).toFixed(2))))}
          >
            [-]
          </button>
          <button
            type="button"
            id="pdfZoomPctBtn"
            className={`pdf-ctrl-btn pdf-zoom-pct${zoomMenuOpen ? ' active' : ''}`}
            aria-label="Toggle PDF Zoom Slider Menu"
            aria-expanded={zoomMenuOpen}
            data-tip="Click to open zoom slider menu"
            data-tip-tone="neutral"
            onClick={() => setZoomMenuOpen((o) => !o)}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            className="pdf-ctrl-btn"
            aria-label="Zoom in PDF"
            data-tip="Zoom in"
            data-tip-tone="neutral"
            onClick={() => setScale((s) => Math.min(3.2, Number((s + 0.2).toFixed(2))))}
          >
            [+]
          </button>
        </div>

        <span className="pdf-ctrl-divider" aria-hidden="true" />

        {isFullscreen && onToggleHud ? (
          <>
            <button
              type="button"
              className={`pdf-ctrl-btn pdf-mobile-search-btn${isHudOpen ? ' active' : ''}`}
              id="pdfMobileSearchBtn"
              aria-label="Toggle Formula and Theorem Search HUD"
              aria-expanded={Boolean(isHudOpen)}
              onClick={onToggleHud}
            >
              <pre className="pdf-search-ascii-icon" aria-hidden="true">
                {DOT_ASCII_MAGNIFIER}
              </pre>
              <span>Search</span>
            </button>
            <span className="pdf-ctrl-divider pdf-mobile-search-divider" aria-hidden="true" />
          </>
        ) : null}

        {cacheSupported ? (
          <>
            <button
              type="button"
              className={`pdf-ctrl-btn pdf-offline-btn${offlineState === 'cached' ? ' active' : ''}`}
              id="pdfOfflineCacheBtn"
              aria-label={
                offlineState === 'cached'
                  ? `Remove offline cached copy of ${title}`
                  : `Download ${title} PDF for offline use`
              }
              data-tip={
                offlineState === 'cached'
                  ? 'Saved for offline reading (click to remove cached copy)'
                  : 'Download PDF into local offline cache'
              }
              data-tip-tone="neutral"
              disabled={offlineState === 'saving'}
              onClick={handleToggleOfflineCache}
            >
              {offlineState === 'saving'
                ? '[CACHING...]'
                : offlineState === 'cached'
                ? '[OFFLINE READY]'
                : '[SAVE OFFLINE]'}
            </button>
            <span className="pdf-ctrl-divider" aria-hidden="true" />
          </>
        ) : null}

        <button
          type="button"
          className="pdf-ctrl-btn pdf-fs-btn"
          id="pdfFloatingFsBtn"
          aria-label={isFullscreen ? 'Exit Fullscreen PDF Reader' : 'Enter Fullscreen PDF Reader'}
          data-tip={isFullscreen ? 'Exit fullscreen (F5)' : 'Enter fullscreen (F5)'}
          data-tip-tone="neutral"
          onClick={onToggleFullscreen}
        >
          {isFullscreen ? '[EXIT FULLSCREEN]' : '[FULLSCREEN]'}
        </button>
      </div>
    </div>
  );
});
