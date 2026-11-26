import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TopicSectionRecord } from '../utils/contentParser';
import {
  computeContextMenuPosition,
  computeTopicMenuStats,
  type ContextMenuPosition,
} from '../utils/topicContextMenu';

export interface TopicContextMenuState {
  section: TopicSectionRecord;
  courseBadge: string;
  anchorX: number;
  anchorY: number;
  source: 'mouse' | 'touch' | 'keyboard';
  courseSignal: string;
  triggerEl: HTMLElement | null;
}

export interface TopicContextMenuProps {
  menu: TopicContextMenuState | null;
  learnedMap: Readonly<Record<string, boolean>>;
  starredMap: Readonly<Record<string, boolean>>;
  onClose: () => void;
  onMarkAllLearned: (section: TopicSectionRecord) => void;
  onMarkAllUnlearned: (section: TopicSectionRecord) => void;
  onStarAll: (section: TopicSectionRecord) => void;
  onUnstarAll: (section: TopicSectionRecord) => void;
  onQuizTopic: (section: TopicSectionRecord) => void;
  onFocusOnlyTopic: (section: TopicSectionRecord) => void;
  onCopyTopicLink: (section: TopicSectionRecord) => void;
  onCopyAllFormulas: (section: TopicSectionRecord, courseBadge: string) => void;
  onPrintTopic: (section: TopicSectionRecord) => void;
}

export const TopicContextMenu: React.FC<TopicContextMenuProps> = ({
  menu,
  learnedMap,
  starredMap,
  onClose,
  onMarkAllLearned,
  onMarkAllUnlearned,
  onStarAll,
  onUnstarAll,
  onQuizTopic,
  onFocusOnlyTopic,
  onCopyTopicLink,
  onCopyAllFormulas,
  onPrintTopic,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<ContextMenuPosition>({
    left: -9999,
    top: -9999,
    originX: 'left',
    originY: 'top',
  });
  const [ready, setReady] = useState<boolean>(false);
  const [isMobileSheet, setIsMobileSheet] = useState<boolean>(false);

  const stats = useMemo(
    () => (menu ? computeTopicMenuStats(menu.section, learnedMap, starredMap) : null),
    [menu, learnedMap, starredMap]
  );

  // Measure and clamp floating menu coordinates before paint
  useLayoutEffect(() => {
    if (!menu) {
      setReady(false);
      return;
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const useSheet = menu.source === 'touch' && vw <= 540;
    setIsMobileSheet(useSheet);

    if (!useSheet) {
      const el = menuRef.current;
      const width = el?.offsetWidth || 276;
      const height = el?.offsetHeight || 360;
      setCoords(
        computeContextMenuPosition(menu.anchorX, menu.anchorY, width, height, vw, vh)
      );
    }
    setReady(true);
  }, [menu]);

  // Move keyboard focus into the menu on open, restore to trigger on Escape
  useEffect(() => {
    if (!menu || !ready) return;
    const menuEl = menuRef.current;
    if (!menuEl) return;

    const rafId = window.requestAnimationFrame(() => {
      if (menu.source === 'keyboard') {
        const firstEnabled = menuEl.querySelector<HTMLButtonElement>(
          'button[role="menuitem"]:not(:disabled)'
        );
        firstEnabled?.focus();
      } else {
        menuEl.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [menu, ready]);

  // Dismiss on outside pointerdown, Escape, resize, or outside scroll + arrow navigation
  useEffect(() => {
    if (!menu) return;

    const handlePointerDown = (e: PointerEvent) => {
      const menuEl = menuRef.current;
      if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) {
        return;
      }
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const trigger = menu.triggerEl;
        onClose();
        if (trigger && trigger.isConnected) {
          trigger.focus({ preventScroll: true });
        }
        return;
      }

      if (e.key === 'Tab') {
        onClose();
        return;
      }

      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        const menuEl = menuRef.current;
        if (!menuEl) return;
        const items = Array.from(
          menuEl.querySelectorAll<HTMLButtonElement>(
            'button[role="menuitem"]:not(:disabled)'
          )
        );
        if (items.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
        let nextIdx = 0;
        if (e.key === 'Home') {
          nextIdx = 0;
        } else if (e.key === 'End') {
          nextIdx = items.length - 1;
        } else if (e.key === 'ArrowDown') {
          nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
        } else {
          nextIdx =
            currentIdx <= 0 ? items.length - 1 : (currentIdx - 1) % items.length;
        }
        items[nextIdx]?.focus();
      }
    };

    const handleResize = () => onClose();

    const handleScroll = (e: Event) => {
      const menuEl = menuRef.current;
      if (menuEl && e.target instanceof Node && menuEl.contains(e.target)) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu, onClose]);

  if (!menu || !stats || typeof document === 'undefined') return null;

  const { section, courseBadge, courseSignal } = menu;

  const runAction = (fn: () => void) => {
    onClose();
    fn();
  };

  const menuStyle: React.CSSProperties = isMobileSheet
    ? {
        ...(courseSignal ? { ['--tcm-course-signal' as string]: courseSignal } : {}),
      }
    : {
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        transformOrigin: `${coords.originY} ${coords.originX}`,
        ...(courseSignal ? { ['--tcm-course-signal' as string]: courseSignal } : {}),
      };

  const statusSummary = stats.isReferenceOnly
    ? `${stats.totalCount} cards · ${stats.starredCount} starred`
    : `${stats.learnedCount}/${stats.totalCount} learned · ${stats.starredCount} starred`;

  return createPortal(
    <>
      {isMobileSheet ? (
        <div
          className={`tcm-backdrop${ready ? ' is-open' : ''}`}
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}

      <div
        ref={menuRef}
        id="topicContextMenu"
        role="menu"
        tabIndex={-1}
        data-c={section.course}
        data-sheet={isMobileSheet ? 'true' : 'false'}
        aria-label={`Topic actions for ${section.title}`}
        className={`topic-context-menu${ready ? ' is-open' : ''}${
          isMobileSheet ? ' is-sheet' : ''
        }`}
        style={menuStyle}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="tcm-header">
          <div className="tcm-eyebrow-row">
            <span className="tcm-course-badge">{courseBadge}</span>
            <span className="tcm-status">{statusSummary}</span>
          </div>
          <div className="tcm-title" title={undefined}>
            {section.title}
          </div>
        </div>

        <div className="tcm-divider" role="separator" />

        {/* Group 1: Progress */}
        <div className="tcm-group" role="group" aria-label="Topic progress actions">
          {!stats.isReferenceOnly ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="tcm-item"
                disabled={stats.unlearnedCount === 0}
                onClick={() => runAction(() => onMarkAllLearned(section))}
              >
                <span className="tcm-item-left">
                  <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3.2 8.4L6.4 11.6L12.8 4.8"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="tcm-label">Mark all learned</span>
                </span>
                <span className="tcm-meta">
                  {stats.unlearnedCount > 0 ? `+${stats.unlearnedCount}` : 'Done'}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="tcm-item"
                disabled={stats.learnedCount === 0}
                onClick={() => runAction(() => onMarkAllUnlearned(section))}
              >
                <span className="tcm-item-left">
                  <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M4.2 4.2L11.8 11.8M11.8 4.2L4.2 11.8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="tcm-label">Mark all unlearned</span>
                </span>
                <span className="tcm-meta">{stats.learnedCount}</span>
              </button>
            </>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="tcm-item"
            disabled={stats.unstarredCount === 0}
            onClick={() => runAction(() => onStarAll(section))}
          >
            <span className="tcm-item-left">
              <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M8 2.2L9.75 5.75L13.65 6.32L10.82 9.07L11.49 12.95L8 11.12L4.51 12.95L5.18 9.07L2.35 6.32L6.25 5.75L8 2.2Z"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="tcm-label">Star all cards</span>
            </span>
            <span className="tcm-meta">
              {stats.unstarredCount > 0 ? `+${stats.unstarredCount}` : 'All'}
            </span>
          </button>

          {stats.starredCount > 0 ? (
            <button
              type="button"
              role="menuitem"
              className="tcm-item"
              onClick={() => runAction(() => onUnstarAll(section))}
            >
              <span className="tcm-item-left">
                <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 3L13 13M8 2.2L9.75 5.75L13.65 6.32L11.45 8.45M9.55 11.9L8 11.12L4.51 12.95L5.18 9.07L2.35 6.32L5.35 5.88"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="tcm-label">Unstar all cards</span>
              </span>
              <span className="tcm-meta">{stats.starredCount}</span>
            </button>
          ) : null}
        </div>

        <div className="tcm-divider" role="separator" />

        {/* Group 2: Study & Workspace */}
        <div className="tcm-group" role="group" aria-label="Study and workspace actions">
          <button
            type="button"
            role="menuitem"
            className="tcm-item tcm-item-accent"
            disabled={stats.totalCount === 0}
            onClick={() => runAction(() => onQuizTopic(section))}
          >
            <span className="tcm-item-left">
              <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect
                  x="2.2"
                  y="3.2"
                  width="9.4"
                  height="7.6"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.35"
                />
                <path
                  d="M5.2 12.8H12.3C13.13 12.8 13.8 12.13 13.8 11.3V6"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                />
              </svg>
              <span className="tcm-label">Quiz this topic</span>
            </span>
            <span className="tcm-meta">
              {stats.totalCount} {stats.totalCount === 1 ? 'card' : 'cards'}
            </span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="tcm-item"
            onClick={() => runAction(() => onFocusOnlyTopic(section))}
          >
            <span className="tcm-item-left">
              <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M2.5 5.5V3.5C2.5 2.95 2.95 2.5 3.5 2.5H5.5M10.5 2.5H12.5C13.05 2.5 13.5 2.95 13.5 3.5V5.5M13.5 10.5V12.5C13.5 13.05 13.05 13.5 12.5 13.5H10.5M5.5 13.5H3.5C2.95 13.5 2.5 13.05 2.5 12.5V10.5"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                />
                <circle cx="8" cy="8" r="1.6" fill="currentColor" />
              </svg>
              <span className="tcm-label">Focus only this topic</span>
            </span>
            <span className="tcm-meta">Solo</span>
          </button>
        </div>

        <div className="tcm-divider" role="separator" />

        {/* Group 3: Export & Share */}
        <div className="tcm-group" role="group" aria-label="Export and share actions">
          <button
            type="button"
            role="menuitem"
            className="tcm-item"
            onClick={() => runAction(() => onCopyTopicLink(section))}
          >
            <span className="tcm-item-left">
              <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6.7 9.3L9.3 6.7M6.2 11.4L5 12.6C3.9 13.7 2.1 13.7 1.1 12.6C0 11.5 0 9.8 1.1 8.7L2.3 7.5M9.8 4.6L11 3.4C12.1 2.3 13.9 2.3 14.9 3.4C16 4.5 16 6.2 14.9 7.3L13.7 8.5"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                />
              </svg>
              <span className="tcm-label">Copy topic link</span>
            </span>
            <span className="tcm-meta">#URL</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="tcm-item"
            disabled={stats.totalCount === 0}
            onClick={() => runAction(() => onCopyAllFormulas(section, courseBadge))}
          >
            <span className="tcm-item-left">
              <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect
                  x="5.2"
                  y="5.2"
                  width="8.3"
                  height="8.3"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.35"
                />
                <path
                  d="M10.8 5.2V3.8C10.8 2.97 10.13 2.3 9.3 2.3H3.8C2.97 2.3 2.3 2.97 2.3 3.8V9.3C2.3 10.13 2.97 10.8 3.8 10.8H5.2"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                />
              </svg>
              <span className="tcm-label">Copy all formulas</span>
            </span>
            <span className="tcm-meta">LaTeX</span>
          </button>

          <button
            type="button"
            role="menuitem"
            className="tcm-item"
            disabled={stats.totalCount === 0}
            onClick={() => runAction(() => onPrintTopic(section))}
          >
            <span className="tcm-item-left">
              <svg className="tcm-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M4.5 6V2.5H11.5V6M4.5 11.5H3.2C2.54 11.5 2 10.96 2 10.3V7.2C2 6.54 2.54 6 3.2 6H12.8C13.46 6 14 6.54 14 7.2V10.3C14 10.96 13.46 11.5 12.8 11.5H11.5M4.5 9.5H11.5V13.5H4.5V9.5Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="tcm-label">Print this topic</span>
            </span>
            <span className="tcm-meta">A4</span>
          </button>
        </div>

        {isMobileSheet ? (
          <>
            <div className="tcm-divider" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="tcm-item tcm-sheet-cancel"
              onClick={onClose}
            >
              <span className="tcm-label">Cancel</span>
            </button>
          </>
        ) : null}
      </div>
    </>,
    document.body
  );
};
