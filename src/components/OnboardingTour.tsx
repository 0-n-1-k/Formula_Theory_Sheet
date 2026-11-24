import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const TOUR_STORAGE_KEY = 'buet_eee_tour_seen_v1';

interface TourStep {
  id: string;
  title: string;
  body: string;
  selectors: readonly string[];
  combineSelectors?: boolean;
}

const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'dashboard',
    title: 'Your study home base',
    body: 'Pick a course, check your overall mastery, filter All / Starred / Unlearned cards, isolate 5/5 High-Yield finals topics, or jump straight into Self-Test Blur and Random Flashcards.',
    selectors: ['#commandDeck'],
  },
  {
    id: 'modes',
    title: 'Formulas, Theory, and Practice',
    body: 'Switch anytime between compact Formulas, full Theorems & Definitions, and past-paper Practice PDFs without losing your place or progress.',
    selectors: ['.tabs'],
  },
  {
    id: 'search',
    title: 'Find anything in seconds',
    body: 'Press / or Ctrl+K anywhere on the page. Type exact keywords like "thevenin" or "cif", or describe what you need in plain English — semantic search activates automatically when needed.',
    selectors: ['#fmq'],
  },
  {
    id: 'index',
    title: 'Jump straight to any chapter',
    body: 'Open the slide-over topic list from here to jump directly to any chapter. As you scroll down the sheet, this docks neatly into a floating Index tab in the corner.',
    selectors: ['#sbBtn', '#sbDetachedTab'],
  },
  {
    id: 'controls',
    title: 'Countdown & workspace controls',
    body: 'Set your exam date for the live countdown, and open Settings to switch to 1-column wide cards, expand or collapse all topics, back up or restore your progress JSON, or replay this tour anytime.',
    selectors: ['#goalToggleBtn', '#settingsBtn'],
    combineSelectors: true,
  },
  {
    id: 'cards',
    title: 'Hover to reveal context & tools',
    body: 'Click any topic bar to open it, then hover a card to light up its Parameters and Exam Strategy footer. You can star tricky formulas, add personal margin notes, copy LaTeX, or check them off as learned.',
    selectors: [
      'main:not([hidden]) details.fmt[open] .fmi:not(.hidden)',
      'main:not([hidden]) details.fmt:not(.hidden)',
      'details.fmt:not(.hidden)',
      '.fmi:not(.hidden)',
    ],
  },
  {
    id: 'practice',
    title: 'Solve papers without switching tabs',
    body: 'Open any Practice PDF in Fullscreen (F5), move your cursor to the top edge to pull down the Quick-Glance Search HUD, and pin formulas directly onto the PDF while you solve.',
    selectors: ['#tabPrac'],
  },
];

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
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

function measureCombinedRect(elements: HTMLElement[]): RectBox | null {
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

  // Treat completely off-screen or degenerate targets as unavailable so popover centers cleanly
  if (width < 12 || height < 12 || bottom < 0 || top > vh || right < 0 || left > vw) {
    return null;
  }

  return { top, left, width, height };
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
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ open, onClose }) => {
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [spotlightRect, setSpotlightRect] = useState<RectBox | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; centered: boolean }>({
    top: 120,
    left: 16,
    centered: true,
  });

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

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
    }
  }, [open]);

  const recomputeLayout = useCallback(() => {
    if (!open) return;
    const elements = resolveStepElements(step);
    const rect = measureCombinedRect(elements);
    setSpotlightRect(rect);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 16;
    const gap = 14;
    const popEl = popoverRef.current;
    const popWidth = Math.min(372, vw - margin * 2);
    const popHeight = popEl ? popEl.offsetHeight : 230;

    if (!rect || vw < 420) {
      setPopoverPos({
        top: Math.max(margin, Math.round((vh - popHeight) / 2)),
        left: Math.max(margin, Math.round((vw - popWidth) / 2)),
        centered: !rect,
      });
      return;
    }

    const spaceBelow = vh - (rect.top + rect.height) - margin;
    const spaceAbove = rect.top - margin;

    let top: number;
    if (spaceBelow >= popHeight + gap) {
      top = rect.top + rect.height + gap;
    } else if (spaceAbove >= popHeight + gap) {
      top = rect.top - popHeight - gap;
    } else if (spaceBelow >= spaceAbove) {
      top = Math.min(vh - popHeight - margin, rect.top + rect.height + gap);
    } else {
      top = Math.max(margin, rect.top - popHeight - gap);
    }

    const idealLeft = rect.left + rect.width / 2 - popWidth / 2;
    const left = Math.max(margin, Math.min(vw - popWidth - margin, idealLeft));

    setPopoverPos({
      top: Math.max(margin, Math.min(vh - popHeight - margin, Math.round(top))),
      left: Math.round(left),
      centered: false,
    });
  }, [open, step]);

  // Scroll the active step target into view smoothly, then re-measure
  useLayoutEffect(() => {
    if (!open) return;
    const elements = resolveStepElements(step);
    if (elements.length > 0) {
      const target = elements[0];
      const r = target.getBoundingClientRect();
      const inView = r.top >= 64 && r.bottom <= window.innerHeight - 64;
      if (!inView) {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {
          target.scrollIntoView();
        }
      }
    }

    recomputeLayout();
    const t1 = window.setTimeout(recomputeLayout, 160);
    const t2 = window.setTimeout(recomputeLayout, 420);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, step, recomputeLayout]);

  // Keep spotlight aligned on resize and scroll (rAF-throttled)
  useEffect(() => {
    if (!open) return;
    const scheduleMeasure = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        recomputeLayout();
      });
    };

    window.addEventListener('resize', scheduleMeasure, { passive: true });
    window.addEventListener('scroll', scheduleMeasure, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [open, recomputeLayout]);

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

  if (!open) return null;

  const progressPct = Math.round(((stepIdx + 1) / totalSteps) * 100);

  return (
    <div className="tour-layer" aria-live="polite">
      <div
        className={`tour-backdrop${spotlightRect ? ' has-spotlight' : ''}`}
        aria-hidden="true"
      />

      {spotlightRect ? (
        <div
          className="tour-spotlight"
          aria-hidden="true"
          style={{
            top: `${spotlightRect.top}px`,
            left: `${spotlightRect.left}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
          }}
        />
      ) : null}

      <div
        ref={popoverRef}
        id="onboardingTourDialog"
        className={`tour-popover${popoverPos.centered ? ' is-centered' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tourStepTitle"
        aria-describedby="tourStepBody"
        style={{
          top: `${popoverPos.top}px`,
          left: `${popoverPos.left}px`,
        }}
      >
        <div className="tour-popover-head">
          <span className="tour-step-counter">
            STEP {stepIdx + 1} / {totalSteps}
          </span>
          <button
            type="button"
            className="tour-skip-btn"
            onClick={finishTour}
            aria-label="Skip walkthrough tour"
          >
            Skip
          </button>
        </div>

        <div className="tour-progress-track" aria-hidden="true">
          <div className="tour-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <h2 id="tourStepTitle" className="tour-title">
          {step.title}
        </h2>
        <p id="tourStepBody" className="tour-body">
          {step.body}
        </p>

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
  );
};
