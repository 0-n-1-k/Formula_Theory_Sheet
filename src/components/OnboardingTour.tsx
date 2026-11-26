import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildSpotlightCutoutPath,
  chooseTourDockPosition,
  interpolateSpotlightRect,
  isSpotlightSettled,
  type SpotlightRect,
  type TourDockPosition,
} from '../utils/onboardingTourLayout';

export const TOUR_STORAGE_KEY = 'buet_eee_tour_seen_v1';

export interface TourStep {
  id: string;
  tag: string;
  title: string;
  body: string;
  selectors: readonly string[];
  combineSelectors?: boolean;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'dashboard',
    tag: 'HOME DECK',
    title: 'Page Home',
    body: 'Select courses, launch active-recall flashcards, and filter cards by priority or mastery.',
    selectors: ['#commandDeck'],
  },
  {
    id: 'modes',
    tag: 'STUDY MODES',
    title: 'Formulas, Theory & Practice',
    body: 'Switch seamlessly between formula sheets, theorems & proofs, and past-paper practice.',
    selectors: ['.tabs'],
  },
  {
    id: 'search',
    tag: 'SMART SEARCH',
    title: 'Instant & Vague Search',
    body: 'Search by equation name, symbol, or rough concept — even vague queries find the right card.',
    selectors: ['#fmq'],
  },
  {
    id: 'index',
    tag: 'TOPIC INDEX',
    title: 'Jump Straight to Any Chapter',
    body: 'Open the slide-over index from anywhere to track chapter progress and jump to any topic.',
    selectors: ['#sbBtn', '#sbDetachedTab'],
  },
  {
    id: 'controls',
    tag: 'TOOLS & PRINT',
    title: 'Calendar & Settings',
    body: 'Set your exam countdown, toggle self-test blur, reset progress, or print A4 formula sheets.',
    selectors: ['#goalToggleBtn', '#settingsBtn'],
    combineSelectors: true,
  },
  {
    id: 'topic-actions',
    tag: 'RIGHT-CLICK / HOLD',
    title: 'Topic Quick Actions',
    body: 'Right-click any topic header on desktop — or tap and hold on mobile — to bulk-mark learned or starred cards, quiz just that topic, copy all formulas, or print it.',
    selectors: [
      'main:not([hidden]) details.fmt:not(.hidden) > summary',
      'details.fmt:not(.hidden) > summary',
    ],
  },
  {
    id: 'cards',
    tag: 'CARD CONTROLS',
    title: 'Formula Cards',
    body: 'Add personal margin notes, star key equations, copy LaTeX, or share direct links to any card.',
    selectors: [
      'main:not([hidden]) details.fmt[open] .fmi:not(.hidden)',
      'main:not([hidden]) details.fmt:not(.hidden)',
      'details.fmt:not(.hidden)',
      '.fmi:not(.hidden)',
    ],
  },
  {
    id: 'practice',
    tag: 'FULLSCREEN HUD',
    title: 'Practice Workspace',
    body: 'Search and pin formulas right on top of practice PDFs without leaving your problem set.',
    selectors: ['#tabPrac'],
  },
];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function isElementVisible(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function resolveStepElements(step: TourStep): HTMLElement[] {
  if (step.combineSelectors) {
    const found: HTMLElement[] = [];
    for (const sel of step.selectors) {
      const el = document.querySelector(sel);
      if (isElementVisible(el)) found.push(el);
    }
    return found;
  }
  for (const sel of step.selectors) {
    const el = document.querySelector(sel);
    if (isElementVisible(el)) return [el];
  }
  return [];
}

function measureCombinedRect(elements: HTMLElement[]): SpotlightRect | null {
  if (elements.length === 0) return null;
  let minTop = Infinity;
  let minLeft = Infinity;
  let maxBottom = -Infinity;
  let maxRight = -Infinity;

  for (const el of elements) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    minTop = Math.min(minTop, r.top);
    minLeft = Math.min(minLeft, r.left);
    maxBottom = Math.max(maxBottom, r.bottom);
    maxRight = Math.max(maxRight, r.right);
  }

  if (!Number.isFinite(minTop)) return null;

  const pad = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = Math.max(4, minTop - pad);
  const left = Math.max(4, minLeft - pad);
  const right = Math.min(vw - 4, maxRight + pad);
  const bottom = Math.min(vh - 4, maxBottom + pad);
  const width = right - left;
  const height = bottom - top;

  if (width < 12 || height < 12 || bottom < 0 || top > vh || right < 0 || left > vw) {
    return null;
  }

  return { top, left, width, height };
}

function readTargetCourseSignal(elements: HTMLElement[]): string {
  for (const el of elements) {
    try {
      const sig = window.getComputedStyle(el).getPropertyValue('--course-signal').trim();
      if (sig) return sig;
    } catch {
      // ignore
    }
  }
  return '';
}

export function markOnboardingTourSeen(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOUR_STORAGE_KEY, '1');
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
}

export function clearOnboardingTourSeen(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
}

export function hasSeenOnboardingTour(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
  onStepEnter?: (stepId: string) => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  open,
  onClose,
  onStepEnter,
}) => {
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [dockPos, setDockPos] = useState<TourDockPosition>('bottom');
  const [accentSignal, setAccentSignal] = useState<string>('');

  const dockRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrimPathRef = useRef<SVGPathElement | null>(null);
  const reticleRectRef = useRef<SVGRectElement | null>(null);

  const currentRectRef = useRef<SpotlightRect | null>(null);
  const targetRectRef = useRef<SpotlightRect | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number>(0);
  const activeScrollUntilRef = useRef<number>(0);

  const step = TOUR_STEPS[stepIdx] ?? TOUR_STEPS[0];
  const totalSteps = TOUR_STEPS.length;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === totalSteps - 1;

  const finishTour = useCallback(() => {
    markOnboardingTourSeen();
    onClose();
  }, [onClose]);

  const goNext = useCallback(() => {
    if (stepIdx >= totalSteps - 1) {
      finishTour();
    } else {
      setStepIdx((prev) => Math.min(totalSteps - 1, prev + 1));
    }
  }, [stepIdx, totalSteps, finishTour]);

  const goBack = useCallback(() => {
    setStepIdx((prev) => Math.max(0, prev - 1));
  }, []);

  // Reset to step 0 each time the tour is opened
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      currentRectRef.current = null;
      targetRectRef.current = null;
    }
  }, [open]);

  // Notify parent when entering a step so it can ensure relevant panels/sections are visible
  useEffect(() => {
    if (!open) return;
    onStepEnter?.(step.id);
  }, [open, step.id, onStepEnter]);

  // Directly paint the SVG scrim cutout and glowing reticle with zero React re-renders
  const applyGeometryToDom = useCallback((rect: SpotlightRect | null) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const svgEl = svgRef.current;
    if (svgEl) {
      svgEl.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    }
    const scrimEl = scrimPathRef.current;
    if (scrimEl) {
      scrimEl.setAttribute('d', buildSpotlightCutoutPath(vw, vh, rect, 12));
    }
    const reticleEl = reticleRectRef.current;
    if (reticleEl) {
      if (rect && rect.width >= 12 && rect.height >= 12) {
        reticleEl.setAttribute('x', rect.left.toFixed(2));
        reticleEl.setAttribute('y', rect.top.toFixed(2));
        reticleEl.setAttribute('width', rect.width.toFixed(2));
        reticleEl.setAttribute('height', rect.height.toFixed(2));
        reticleEl.style.opacity = '1';
      } else {
        reticleEl.style.opacity = '0';
      }
    }
  }, []);

  const stopAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const stepRef = useRef<TourStep>(step);
  stepRef.current = step;

  const updateDockPosition = useCallback((rect: SpotlightRect | null) => {
    const dockHeight = dockRef.current?.offsetHeight || 132;
    const nextDock = chooseTourDockPosition(rect, dockHeight, window.innerHeight, 72);
    setDockPos((prev) => (prev === nextDock ? prev : nextDock));
  }, []);

  const startAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    lastFrameMsRef.current = performance.now();

    const tick = (nowMs: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (nowMs - lastFrameMsRef.current) / 1000));
      lastFrameMsRef.current = nowMs;

      // Re-sample target rect while smooth scroll is in progress
      const stillScrolling = nowMs < activeScrollUntilRef.current;
      if (stillScrolling) {
        const els = resolveStepElements(stepRef.current);
        targetRectRef.current = measureCombinedRect(els);
      }

      const target = targetRectRef.current;
      if (!target) {
        currentRectRef.current = null;
        applyGeometryToDom(null);
        if (!stillScrolling) {
          rafIdRef.current = null;
          return;
        }
        rafIdRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const reduced = prefersReducedMotion();
      const prev = currentRectRef.current;
      if (!prev || reduced) {
        currentRectRef.current = target;
        applyGeometryToDom(target);
        if (!stillScrolling) {
          rafIdRef.current = null;
          return;
        }
        rafIdRef.current = window.requestAnimationFrame(tick);
        return;
      }

      // Exponential critically-damped glide at 60fps
      const alpha = 1 - Math.exp(-15 * dt);
      const next = interpolateSpotlightRect(prev, target, alpha);

      if (isSpotlightSettled(next, target, 0.35)) {
        currentRectRef.current = target;
        applyGeometryToDom(target);
        if (!stillScrolling) {
          rafIdRef.current = null;
          return;
        }
      } else {
        currentRectRef.current = next;
        applyGeometryToDom(next);
      }

      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    rafIdRef.current = window.requestAnimationFrame(tick);
  }, [applyGeometryToDom]);

  const measureAndSyncStep = useCallback(
    (scrollIntoSafeZone: boolean) => {
      if (!open) return;
      const elements = resolveStepElements(step);
      const signal = readTargetCourseSignal(elements);
      setAccentSignal((prev) => (prev === signal ? prev : signal));

      if (scrollIntoSafeZone && elements.length > 0) {
        const target = elements[0];
        const r = target.getBoundingClientRect();
        const dockReserve = (dockRef.current?.offsetHeight || 136) + 32;
        const safeTop = 76;
        const safeBottom = window.innerHeight - dockReserve;
        const isStickyTop = r.top >= 0 && r.bottom <= 140;

        if (!isStickyTop && (r.top < safeTop || r.bottom > safeBottom)) {
          const desiredTop = Math.max(
            safeTop + 16,
            Math.round((window.innerHeight - dockReserve - Math.min(r.height, 260)) * 0.42)
          );
          const scrollDelta = r.top - desiredTop;
          const nextScrollY = Math.max(0, window.scrollY + scrollDelta);
          try {
            window.scrollTo({
              top: nextScrollY,
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            });
          } catch {
            window.scrollTo(0, nextScrollY);
          }
          activeScrollUntilRef.current = performance.now() + 560;
        }
      }

      const rect = measureCombinedRect(elements);
      targetRectRef.current = rect;
      updateDockPosition(rect);
      startAnimationLoop();
    },
    [open, step, startAnimationLoop, updateDockPosition]
  );

  // Measure on open / step change (with a micro follow-up after parent DOM updates)
  useLayoutEffect(() => {
    if (!open) {
      stopAnimationLoop();
      return;
    }
    measureAndSyncStep(true);
    const rafFollowup = window.requestAnimationFrame(() => {
      measureAndSyncStep(true);
    });
    const postScrollCheck = window.setTimeout(() => {
      const els = resolveStepElements(step);
      const rect = measureCombinedRect(els);
      targetRectRef.current = rect;
      updateDockPosition(rect);
      startAnimationLoop();
    }, 520);

    return () => {
      window.cancelAnimationFrame(rafFollowup);
      window.clearTimeout(postScrollCheck);
    };
  }, [open, step, measureAndSyncStep, stopAnimationLoop, startAnimationLoop, updateDockPosition]);

  // Keep spotlight locked to target on scroll and resize at 60fps via refs (no React setState churn)
  useEffect(() => {
    if (!open) return;

    const handleViewportChange = () => {
      const els = resolveStepElements(stepRef.current);
      const rect = measureCombinedRect(els);
      targetRectRef.current = rect;
      // Snap directly during active user scroll so spotlight tracks 1:1 with zero lag
      currentRectRef.current = rect;
      applyGeometryToDom(rect);
      updateDockPosition(rect);
    };

    window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });
    window.addEventListener('resize', handleViewportChange, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
      stopAnimationLoop();
    };
  }, [open, applyGeometryToDom, updateDockPosition, stopAnimationLoop]);

  // Keyboard navigation: Escape closes, ArrowRight/Enter advances, ArrowLeft goes back
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishTour();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        goBack();
      } else if (e.key === 'Enter') {
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'BUTTON') return;
        e.preventDefault();
        e.stopPropagation();
        goNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, finishTour, goNext, goBack]);

  if (!open || typeof document === 'undefined') return null;

  const progressRatio = (stepIdx + 1) / totalSteps;
  const dockStyle: React.CSSProperties = accentSignal
    ? { ['--tour-accent' as string]: accentSignal }
    : {};

  return createPortal(
    <div
      id="onboardingTourLayer"
      className="tour-layer"
      aria-live="polite"
      style={dockStyle}
    >
      <svg
        ref={svgRef}
        className="tour-spotlight-svg"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <path
          ref={scrimPathRef}
          className="tour-scrim-path"
          fillRule="evenodd"
          d={`M0 0 H${window.innerWidth} V${window.innerHeight} H0 Z`}
        />
        <rect
          ref={reticleRectRef}
          className="tour-reticle-rect"
          x="0"
          y="0"
          width="0"
          height="0"
          rx="12"
          ry="12"
          style={{ opacity: 0 }}
        />
      </svg>

      <div
        ref={dockRef}
        id="onboardingTourDialog"
        className="tour-dock"
        data-dock={dockPos}
        data-step={step.id}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tourStepTitle"
        aria-describedby="tourStepBody"
      >
        <div className="tour-progress-track" aria-hidden="true">
          <div
            className="tour-progress-fill"
            style={{ transform: `scaleX(${progressRatio.toFixed(4)})` }}
          />
        </div>

        <div className="tour-dock-top">
          <div className="tour-dock-eyebrow">
            <span className="tour-step-counter">
              STEP {String(stepIdx + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
            </span>
            <span className="tour-step-tag">{step.tag}</span>
          </div>

          <div className="tour-dock-top-right">
            <div className="tour-step-dots" role="tablist" aria-label="Walkthrough steps">
              {TOUR_STEPS.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={idx === stepIdx}
                  aria-label={`Step ${idx + 1}: ${s.title}`}
                  className={`tour-step-dot${idx === stepIdx ? ' is-active' : ''}${
                    idx < stepIdx ? ' is-done' : ''
                  }`}
                  onClick={() => setStepIdx(idx)}
                />
              ))}
            </div>
            <button
              type="button"
              className="tour-skip-btn"
              onClick={finishTour}
              aria-label="Skip walkthrough tour"
            >
              Skip
            </button>
          </div>
        </div>

        <div className="tour-dock-main">
          <div key={step.id} className="tour-dock-copy">
            <h2 id="tourStepTitle" className="tour-title">
              {step.title}
            </h2>
            <p id="tourStepBody" className="tour-body">
              {step.body}
            </p>
          </div>

          <div className="tour-actions">
            <button
              type="button"
              className="tour-btn tour-btn-secondary"
              onClick={goBack}
              disabled={isFirst}
            >
              Back
            </button>
            <button
              type="button"
              className="tour-btn tour-btn-primary"
              onClick={goNext}
            >
              {isLast ? 'Start Studying' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
