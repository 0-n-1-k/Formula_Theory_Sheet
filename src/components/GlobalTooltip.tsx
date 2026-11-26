import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  computeTooltipPlacement,
  normalizeTooltipTone,
  type TooltipPlacement,
  type TooltipTone,
} from '../utils/tooltipPosition';

const INITIAL_SHOW_DELAY_MS = 160;
const WARM_SWITCH_WINDOW_MS = 300;

interface ActiveTipState {
  trigger: HTMLElement;
  text: string;
  tone: TooltipTone;
  courseSignal: string;
  visible: boolean;
}

interface TipCoords {
  left: number;
  top: number;
  placement: TooltipPlacement;
  arrowX: number;
}

function supportsFineHoverPointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function findTooltipTrigger(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-tip]');
  if (!el) return null;
  const text = el.getAttribute('data-tip')?.trim();
  if (!text) return null;
  return el;
}

function readCourseSignal(el: HTMLElement): string {
  try {
    return window.getComputedStyle(el).getPropertyValue('--course-signal').trim();
  } catch {
    return '';
  }
}

export const GlobalTooltip: React.FC = () => {
  const [tip, setTip] = useState<ActiveTipState | null>(null);
  const [coords, setCoords] = useState<TipCoords>({
    left: -9999,
    top: -9999,
    placement: 'bottom',
    arrowX: 20,
  });
  const [portalContainer, setPortalContainer] = useState<Element | null>(() =>
    typeof document !== 'undefined' ? document.fullscreenElement || document.body : null
  );

  const tipRef = useRef<HTMLDivElement | null>(null);
  const activeTriggerRef = useRef<HTMLElement | null>(null);
  const isVisibleRef = useRef<boolean>(false);
  const showTimerRef = useRef<number | null>(null);
  const lastHiddenAtRef = useRef<number>(0);

  const clearPendingTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const hideTooltip = useCallback(
    (recordWarmTimestamp = true) => {
      clearPendingTimer();
      if (isVisibleRef.current && recordWarmTimestamp) {
        lastHiddenAtRef.current = performance.now();
      }
      isVisibleRef.current = false;
      activeTriggerRef.current = null;
      setTip((prev) => (prev ? null : prev));
    },
    [clearPendingTimer]
  );

  const showForTrigger = useCallback(
    (trigger: HTMLElement) => {
      const text = trigger.getAttribute('data-tip')?.trim() ?? '';
      if (!text) {
        hideTooltip(false);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        hideTooltip(false);
        return;
      }

      const tone = normalizeTooltipTone(trigger.getAttribute('data-tip-tone'));
      const courseSignal = readCourseSignal(trigger);
      const now = performance.now();
      const shouldShowImmediately =
        isVisibleRef.current || now - lastHiddenAtRef.current <= WARM_SWITCH_WINDOW_MS;

      clearPendingTimer();
      activeTriggerRef.current = trigger;

      if (shouldShowImmediately) {
        isVisibleRef.current = true;
        setTip({
          trigger,
          text,
          tone,
          courseSignal,
          visible: true,
        });
      } else {
        showTimerRef.current = window.setTimeout(() => {
          showTimerRef.current = null;
          if (activeTriggerRef.current !== trigger || !trigger.isConnected) return;
          const freshText = trigger.getAttribute('data-tip')?.trim() ?? '';
          if (!freshText) return;
          const freshRect = trigger.getBoundingClientRect();
          if (freshRect.width === 0 && freshRect.height === 0) return;
          isVisibleRef.current = true;
          setTip({
            trigger,
            text: freshText,
            tone: normalizeTooltipTone(trigger.getAttribute('data-tip-tone')),
            courseSignal: readCourseSignal(trigger),
            visible: true,
          });
        }, INITIAL_SHOW_DELAY_MS);
      }
    },
    [clearPendingTimer, hideTooltip]
  );

  // Track native fullscreen changes so the portal always renders inside the active top layer
  useEffect(() => {
    const syncPortal = () => {
      setPortalContainer(document.fullscreenElement || document.body);
    };
    syncPortal();
    document.addEventListener('fullscreenchange', syncPortal);
    return () => {
      document.removeEventListener('fullscreenchange', syncPortal);
    };
  }, []);

  // Delegated document listeners
  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      if (!supportsFineHoverPointer()) return;
      const trigger = findTooltipTrigger(e.target);
      if (!trigger) return;
      if (trigger === activeTriggerRef.current && (isVisibleRef.current || showTimerRef.current !== null)) {
        return;
      }
      showForTrigger(trigger);
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (!activeTriggerRef.current) return;
      const nextTrigger = findTooltipTrigger(e.relatedTarget);
      if (nextTrigger === activeTriggerRef.current) {
        return;
      }
      if (nextTrigger && supportsFineHoverPointer()) {
        showForTrigger(nextTrigger);
        return;
      }
      hideTooltip(true);
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!supportsFineHoverPointer()) return;
      const trigger = findTooltipTrigger(e.target);
      if (!trigger) return;
      // Show on keyboard focus or focusable controls, skip if already active
      if (trigger === activeTriggerRef.current && isVisibleRef.current) return;
      showForTrigger(trigger);
    };

    const handleFocusOut = (e: FocusEvent) => {
      if (!activeTriggerRef.current) return;
      const nextTrigger = findTooltipTrigger(e.relatedTarget);
      if (nextTrigger === activeTriggerRef.current) return;
      hideTooltip(true);
    };

    const handleMouseDown = () => {
      hideTooltip(false);
    };

    const handleContextMenu = () => {
      hideTooltip(false);
    };

    const handleScroll = () => {
      hideTooltip(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideTooltip(false);
      }
    };

    const handleBlur = () => {
      hideTooltip(false);
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('blur', handleBlur);

    return () => {
      clearPendingTimer();
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [clearPendingTimer, hideTooltip, showForTrigger]);

  // Keep visible tooltip text and tone synced if attributes mutate while hovered/focused
  useEffect(() => {
    const trigger = tip?.trigger;
    if (!trigger) return;
    const observer = new MutationObserver(() => {
      if (!trigger.isConnected) {
        hideTooltip(false);
        return;
      }
      const nextText = trigger.getAttribute('data-tip')?.trim() ?? '';
      if (!nextText) {
        hideTooltip(false);
        return;
      }
      const nextTone = normalizeTooltipTone(trigger.getAttribute('data-tip-tone'));
      const nextSignal = readCourseSignal(trigger);
      setTip((prev) => {
        if (!prev || prev.trigger !== trigger) return prev;
        if (
          prev.text === nextText &&
          prev.tone === nextTone &&
          prev.courseSignal === nextSignal
        ) {
          return prev;
        }
        return {
          ...prev,
          text: nextText,
          tone: nextTone,
          courseSignal: nextSignal,
        };
      });
    });
    observer.observe(trigger, {
      attributes: true,
      attributeFilter: ['data-tip', 'data-tip-tone', 'aria-hidden', 'hidden'],
    });
    return () => observer.disconnect();
  }, [tip?.trigger, hideTooltip]);

  // Measure and clamp position + caret offset whenever active tip or its text changes
  useLayoutEffect(() => {
    if (!tip || !tip.visible) return;
    const tipEl = tipRef.current;
    const triggerEl = tip.trigger;
    if (!tipEl || !triggerEl || !triggerEl.isConnected) return;

    const triggerRect = triggerEl.getBoundingClientRect();
    if (triggerRect.width === 0 && triggerRect.height === 0) {
      hideTooltip(false);
      return;
    }

    const tipRect = tipEl.getBoundingClientRect();
    const tipWidth = tipEl.offsetWidth || tipRect.width;
    const tipHeight = tipEl.offsetHeight || tipRect.height;
    const next = computeTooltipPlacement(
      triggerRect,
      tipWidth,
      tipHeight,
      window.innerWidth,
      window.innerHeight
    );
    setCoords(next);
  }, [tip, hideTooltip]);

  if (!portalContainer) return null;

  const isVisible = Boolean(tip?.visible && tip.text);
  const style: React.CSSProperties = {
    left: `${coords.left}px`,
    top: `${coords.top}px`,
    ['--tip-arrow-x' as string]: `${coords.arrowX}px`,
    ...(tip?.courseSignal ? { ['--tip-course-signal' as string]: tip.courseSignal } : {}),
  };

  return createPortal(
    <div
      ref={tipRef}
      id="globalTooltip"
      role="tooltip"
      aria-hidden={!isVisible}
      className={isVisible ? 'is-visible' : undefined}
      data-placement={coords.placement}
      data-tone={tip?.tone ?? 'course'}
      style={style}
    >
      <span className="global-tooltip-label">{tip?.text ?? ''}</span>
    </div>,
    portalContainer
  );
};
