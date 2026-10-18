/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  Component,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import {
  buildFormulaSearchIndex,
  filterFormulaCards,
  matchesSearchTokens,
  tokenizeSearchQuery,
  type FormulaCardRecord,
  type TheoremCategoryFilter,
} from './utils/formulaSearch';
import {
  renderLatexCached,
  renderTextWithMath,
} from './utils/mathParser';
import {
  BUET_LOGO_ASCII_ART,
  DEFAULT_APP_STATE,
  resetToHomeFormulasState,
  safeReadStorage,
  safeWriteStorage,
  validateJsonImportPayload,
  type CourseCode,
  type PersistedAppState,
  type StatusFilter,
  type TabMode,
} from './utils/storageSafety';

const STORAGE_KEY = 'buet_eee_l1t1_v2_state';

interface ErrorBoundaryProps {
  fallbackLabel?: string;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class WorkspaceErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error',
    };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Error isolated to boundary; prevent application crash
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="workspace-error-fallback" role="alert">
          <span>
            [:: RENDER SAFEGUARD ::] {this.props.fallbackLabel || 'Workspace section'} encountered an error:{' '}
            {this.state.errorMessage}
          </span>
          <button
            type="button"
            className="sb-btn"
            onClick={this.handleReset}
            aria-label="Retry rendering workspace"
          >
            [RETRY]
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export class KatexErrorBoundary extends Component<{ rawLatex: string; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { rawLatex: string; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Isolated per-formula math boundary
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fmm math-error-fallback" role="note" aria-label="Raw LaTeX fallback">
          <code>{this.props.rawLatex}</code>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface KatexMathBlockProps {
  latex: string;
  displayMode?: boolean;
}

export const KatexMathBlock = memo(function KatexMathBlock({
  latex,
  displayMode = true,
}: KatexMathBlockProps) {
  const renderedHtml = useMemo(
    () => renderLatexCached(latex, displayMode),
    [latex, displayMode]
  );

  return (
    <KatexErrorBoundary rawLatex={latex}>
      {renderedHtml ? (
        <div
          className="fmm"
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <div className="fmm">
          <code>{latex}</code>
        </div>
      )}
    </KatexErrorBoundary>
  );
});

export interface SecondaryMathTextProps {
  className: string;
  content: string;
  as?: 'div' | 'li' | 'span';
}

export const SecondaryMathText = memo(function SecondaryMathText({
  className,
  content,
  as: Tag = 'div',
}: SecondaryMathTextProps) {
  const parsedHtml = useMemo(() => renderTextWithMath(content), [content]);
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: parsedHtml }}
    />
  );
});

function formatDoomsdayParts(examDate: string, nowMs: number) {
  if (!examDate) return null;
  const target = new Date(`${examDate}T09:00:00`);
  const diff = target.getTime() - nowMs;
  if (Number.isNaN(diff)) return null;
  const absDiff = Math.abs(diff);
  const totalSec = Math.floor(absDiff / 1000);
  const days = String(Math.floor(totalSec / 86400)).padStart(2, '0');
  const hrs = String(Math.floor((totalSec % 86400) / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  const prefix = diff >= 0 ? 'DOOMSDAY // T-MINUS' : 'DOOMSDAY // T-PLUS';
  return { days, hrs, mins, secs, prefix };
}

/**
 * Optimization D: Isolated Doomsday Countdown Button & Drawer Clock
 * Houses its own 1-second setInterval so every-second ticks never re-render the search bar,
 * sidebar, or formula/theorem card grids.
 */
export interface DoomsdayToggleButtonProps {
  examDate: string;
  goalOpen: boolean;
  onToggle: () => void;
}

export const DoomsdayToggleButton = memo(function DoomsdayToggleButton({
  examDate,
  goalOpen,
  onToggle,
}: DoomsdayToggleButtonProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) {
        setNowMs(Date.now());
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const parts = formatDoomsdayParts(examDate, nowMs);
  const label = parts
    ? `DOOMSDAY // ${parts.days}D : ${parts.hrs}H : ${parts.mins}M : ${parts.secs}S`
    : 'GOAL // TIMER';

  return (
    <button
      type="button"
      className={`goal-toggle-btn${goalOpen ? ' active' : ''}`}
      id="goalToggleBtn"
      aria-label="Toggle Study Progress and Exam Countdown Drawer"
      aria-expanded={goalOpen}
      onClick={onToggle}
    >
      <span className="ntype-badge">{label}</span>
    </button>
  );
});

export const DoomsdayDrawerClock = memo(function DoomsdayDrawerClock({
  examDate,
}: {
  examDate: string;
}) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!document.hidden) {
        setNowMs(Date.now());
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const parts = formatDoomsdayParts(examDate, nowMs);
  if (!parts) {
    return (
      <span id="cdt">
        <span className="doomsday-tag">STANDBY</span>
        <span>SET EXAM DATE TO ARM DOOMSDAY CLOCK</span>
      </span>
    );
  }

  return (
    <span id="cdt">
      <span className="doomsday-tag">{parts.prefix}</span>
      <span className="doomsday-segments">
        <span className="dd-seg">
          <span className="dd-val">{parts.days}</span>
          <span className="dd-unit">D</span>
        </span>
        <span className="dd-sep">:</span>
        <span className="dd-seg">
          <span className="dd-val">{parts.hrs}</span>
          <span className="dd-unit">H</span>
        </span>
        <span className="dd-sep">:</span>
        <span className="dd-seg">
          <span className="dd-val">{parts.mins}</span>
          <span className="dd-unit">M</span>
        </span>
        <span className="dd-sep">:</span>
        <span className="dd-seg">
          <span className="dd-val">{parts.secs}</span>
          <span className="dd-unit">S</span>
        </span>
      </span>
    </span>
  );
});

export interface FormulaCardViewProps {
  card: FormulaCardRecord;
  isLearned: boolean;
  isStarred: boolean;
  isHidden?: boolean;
  onToggleStar: (id: string) => void;
  onToggleLearned: (id: string, checked: boolean) => void;
  onCopyLatex: (latex: string) => void;
}

/**
 * Optimization A & B: Kept mounted in DOM and toggles `.hidden` class instead of unmounting/remounting.
 * Applies `renderTextWithMath` across `.fmw`, `.fmu`, `.fmsteps li`, `.fmnote`, and `.thsee`.
 */
export const FormulaCardView = memo(function FormulaCardView({
  card,
  isLearned,
  isStarred,
  isHidden = false,
  onToggleStar,
  onToggleLearned,
  onCopyLatex,
}: FormulaCardViewProps) {
  return (
    <div
      className={`fmi tex${isStarred ? ' starred' : ''}${isLearned ? ' learned' : ''}${isHidden ? ' hidden' : ''}`}
      data-k={card.id}
      hidden={isHidden}
    >
      <div className="fmh">
        <span className="fmn">{card.title}</span>
        <span className="fmb">
          <button
            type="button"
            className={`fmst${isStarred ? ' on' : ''}`}
            aria-label={isStarred ? `Remove star from ${card.title}` : `Star ${card.title}`}
            aria-pressed={isStarred}
            onClick={() => onToggleStar(card.id)}
          >
            {isStarred ? 'STARRED' : 'Star'}
          </button>
          <button
            type="button"
            className="fmcp"
            aria-label={`Copy LaTeX for ${card.title}`}
            data-t={card.rawLatex}
            onClick={() => onCopyLatex(card.rawLatex)}
          >
            Copy
          </button>
          <label className="fml" aria-label={`Mark ${card.title} as learned`}>
            <input
              type="checkbox"
              className="fmck"
              checked={isLearned}
              aria-label={`Learned status for ${card.title}`}
              onChange={(e) => onToggleLearned(card.id, e.target.checked)}
            />{' '}
            learned
          </label>
        </span>
      </div>
      <div className="fmbody">
        <KatexMathBlock latex={card.rawLatex} displayMode />
        <div className="fmdet">
          <SecondaryMathText className="fmw" content={card.bodyText} />
          {card.useText ? (
            <SecondaryMathText className="fmu" content={card.useText} />
          ) : null}
        </div>
        {card.note ? (
          <SecondaryMathText className="fmnote" content={card.note} />
        ) : null}
        {card.seeAlso ? (
          <SecondaryMathText className="thsee" content={card.seeAlso} />
        ) : null}
        {card.steps && card.steps.length > 0 ? (
          <details className="fmd">
            <summary>Proof &amp; derivation steps</summary>
            <ol className="fmsteps">
              {card.steps.map((step, idx) => (
                <SecondaryMathText
                  key={idx}
                  as="li"
                  className=""
                  content={step}
                />
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </div>
  );
});

const COURSE_OPTIONS: ReadonlyArray<{ code: CourseCode; badge: string; label: string }> = [
  { code: 'ALL', badge: 'ALL', label: 'All Courses' },
  { code: 'EEE', badge: 'EEE 101', label: 'Circuits I' },
  { code: 'M157', badge: 'MATH 157', label: 'Calculus I & II' },
  { code: 'M159', badge: 'MATH 159', label: 'Complex & Vectors' },
  { code: 'PHY', badge: 'PHY 121', label: 'Waves, Optics & Thermo' },
  { code: 'CSE', badge: 'CSE 109', label: 'C / C++ Prog.' },
  { code: 'GEN', badge: 'GEN', label: 'Math & Constants' },
];

export default function App() {
  const [persisted, setPersisted] = useState<PersistedAppState>(() =>
    safeReadStorage(STORAGE_KEY, DEFAULT_APP_STATE)
  );
  // Optimization C: Immediate local state for 60fps search input + useDeferredValue for non-blocking filter calculation
  const [searchInput, setSearchInput] = useState<string>('');
  const deferredQuery = useDeferredValue(searchInput);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [thmFilter, setThmFilter] = useState<TheoremCategoryFilter>('all');
  const [toolsOpen, setToolsOpen] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [flashcardHtml, setFlashcardHtml] = useState<string>('');
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');

  const topChromeRef = useRef<HTMLElement | null>(null);
  const fmbarRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const toolsWrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
    }, 2200);
  }, []);

  useEffect(() => {
    safeWriteStorage(STORAGE_KEY, persisted);
  }, [persisted]);

  const updateChromeHeight = useCallback(() => {
    try {
      const chromeEl = topChromeRef.current || document.querySelector<HTMLElement>('.top-chrome');
      const barEl = fmbarRef.current || document.querySelector<HTMLElement>('#fmbar');
      if (chromeEl) {
        const h = Math.ceil(chromeEl.getBoundingClientRect().height);
        if (h > 0) {
          document.documentElement.style.setProperty('--chrome-h', `${h}px`);
        }
      }
      if (barEl) {
        const bh = Math.ceil(barEl.getBoundingClientRect().height);
        if (bh > 0) {
          document.documentElement.style.setProperty('--fmbar-h', `${bh}px`);
        }
      }
    } catch {
      // Ignore layout measurement errors in non-DOM environments
    }
  }, []);

  useEffect(() => {
    updateChromeHeight();
    window.addEventListener('resize', updateChromeHeight, { passive: true });
    return () => window.removeEventListener('resize', updateChromeHeight);
  }, [updateChromeHeight, persisted.goalOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName || '';
      const isInputFocused =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;

      if (
        (e.key === '/' && !isInputFocused) ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === 'Escape') {
        if (document.activeElement === searchInputRef.current && searchInput) {
          setSearchInput('');
        }
        setToolsOpen(false);
        setModalOpen(false);
      }
    };

    const handleDocumentClick = (e: MouseEvent) => {
      if (
        toolsWrapRef.current &&
        e.target instanceof Node &&
        !toolsWrapRef.current.contains(e.target)
      ) {
        setToolsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [searchInput]);

  const sampleCards = useMemo<FormulaCardRecord[]>(() => [], []);

  const preindexedCards = useMemo(
    () =>
      sampleCards.map((c) => ({
        card: c,
        searchIndex: buildFormulaSearchIndex(c),
      })),
    [sampleCards]
  );

  const deferredTokens = useMemo(
    () => tokenizeSearchQuery(deferredQuery),
    [deferredQuery]
  );

  const filterSummary = useMemo(
    () =>
      filterFormulaCards(sampleCards, {
        course: persisted.course,
        status: persisted.status,
        query: deferredQuery,
        thmFilter: persisted.tab === 'thm' ? thmFilter : 'all',
      }),
    [sampleCards, persisted.course, persisted.status, deferredQuery, persisted.tab, thmFilter]
  );

  const handleTabChange = useCallback((tab: TabMode) => {
    setPersisted((prev) => ({ ...prev, tab }));
  }, []);

  const handleCourseChange = useCallback((course: CourseCode) => {
    setPersisted((prev) => ({ ...prev, course }));
  }, []);

  const handleStatusChange = useCallback((status: StatusFilter) => {
    setPersisted((prev) => ({ ...prev, status }));
  }, []);

  const handleToggleGoal = useCallback(() => {
    setPersisted((prev) => ({ ...prev, goalOpen: !prev.goalOpen }));
  }, []);

  const handleBrandReset = useCallback(() => {
    setPersisted((prev) => resetToHomeFormulasState(prev));
    setThmFilter('all');
    setSearchInput('');
    setToolsOpen(false);
    setModalOpen(false);
    if (typeof document !== 'undefined') {
      document.querySelectorAll<HTMLDetailsElement>('details.fmt, details.fmd').forEach((d) => {
        d.open = false;
      });
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    showToast('RESET TO FORMULAS // ALL RETRACTED');
  }, [showToast]);

  const handleToggleStar = useCallback((id: string) => {
    setPersisted((prev) => {
      const nextStarred = { ...prev.starred };
      if (nextStarred[id]) delete nextStarred[id];
      else nextStarred[id] = true;
      return { ...prev, starred: nextStarred };
    });
  }, []);

  const handleToggleLearned = useCallback((id: string, checked: boolean) => {
    setPersisted((prev) => {
      const nextLearned = { ...prev.learned };
      if (checked) nextLearned[id] = true;
      else delete nextLearned[id];
      return { ...prev, learned: nextLearned };
    });
  }, []);

  const handleCopyLatex = useCallback(
    (latex: string) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(latex).catch(() => {});
      }
      showToast('COPIED TO CLIPBOARD');
    },
    [showToast]
  );

  const handleImportSubmit = useCallback(() => {
    const validation = validateJsonImportPayload(importJsonText);
    if (!validation.ok || !validation.data) {
      showToast(validation.error || 'INVALID JSON FORMAT');
      return;
    }
    setPersisted((prev) => ({
      ...prev,
      learned: validation.data!.learned,
      starred: validation.data!.starred,
      examDate: validation.data!.examDate ?? prev.examDate,
    }));
    setModalOpen(false);
    showToast('PROGRESS RESTORED');
  }, [importJsonText, showToast]);

  const parsedFlashcardHtml = useMemo(
    () => renderTextWithMath(flashcardHtml),
    [flashcardHtml]
  );

  return (
    <WorkspaceErrorBoundary fallbackLabel="BUET L-1/T-1 EEE Sheet">
      <header className="top-chrome" ref={topChromeRef}>
        <div className="hd">
          <div className="hd-left">
            <button
              type="button"
              className={`sb-btn${sidebarOpen ? ' active' : ''}`}
              id="sbBtn"
              aria-label="Toggle Topic Index Sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              [INDEX]
            </button>
            <div className="brand-wrap">
              <div className="ntype-emblem" aria-hidden="true">
                {':: BUET.EEE ::\nL-1 // T-1 SYS'}
              </div>
              <pre
                className="buet-ascii-art"
                id="buetAsciiArt"
                aria-hidden="true"
                title="BUET Seal ASCII Art"
              >
                {BUET_LOGO_ASCII_ART}
              </pre>
              <div
                className="brand-titles"
                id="brandResetBtn"
                role="button"
                tabIndex={0}
                title="Return to Formulas (All Courses) and retract all sections"
                aria-label="BUET L-1/T-1 EEE — Formula & Theorem Sheet: Return to Formulas for all courses and retract all sections"
                onClick={handleBrandReset}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBrandReset();
                  }
                }}
              >
                <h1 className="brand-title">BUET L-1/T-1 EEE — Formula &amp; Theorem Sheet</h1>
                <p className="brand-sub">EEE 101 · MATH 157 · MATH 159 · PHY 121/165 · CSE 109</p>
              </div>
            </div>
          </div>
          <div className="hd-right">
            <div className="tabs" role="tablist" aria-label="Reference Sheet Mode">
              <button
                type="button"
                className={`tab${persisted.tab === 'fm' ? ' active' : ''}`}
                role="tab"
                aria-selected={persisted.tab === 'fm'}
                aria-label="View Formulas Sheet"
                onClick={() => handleTabChange('fm')}
              >
                <span>Formulas</span>
              </button>
              <button
                type="button"
                className={`tab${persisted.tab === 'thm' ? ' active' : ''}`}
                role="tab"
                aria-selected={persisted.tab === 'thm'}
                aria-label="View Theorems and Definitions Sheet"
                onClick={() => handleTabChange('thm')}
              >
                <span>Theorems &amp; Definitions</span>
              </button>
            </div>
            <DoomsdayToggleButton
              examDate={persisted.examDate}
              goalOpen={persisted.goalOpen}
              onToggle={handleToggleGoal}
            />
          </div>
        </div>
        <div className="goal" hidden={!persisted.goalOpen}>
          <div className="goal-progress-wrap">
            <span className="ntype-badge">MASTERY</span>
            <div id="pb" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
              <div id="pf" />
            </div>
          </div>
          <div className="cdrow">
            <DoomsdayDrawerClock examDate={persisted.examDate} />
          </div>
        </div>
      </header>

      <section id="fmbar" ref={fmbarRef} aria-label="Course Selector and Study Controls">
        <div className="fmbar-inner">
          <div className="course-selector-row course-bar">
            <span className="course-selector-label">COURSE SELECT</span>
            <div id="fmchips" className="chip-group" role="toolbar" aria-label="Filter by Course">
              {COURSE_OPTIONS.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  className={`course-pill${persisted.course === c.code ? ' active' : ''}`}
                  data-course={c.code}
                  data-c={c.code}
                  aria-pressed={persisted.course === c.code}
                  aria-label={`Filter by ${c.badge} ${c.label}`}
                  onClick={() => handleCourseChange(c.code)}
                >
                  <span className="course-code">{c.badge}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="controls-utility-row">
            <div className="search-wrap" role="search">
              <label htmlFor="fmq" className="search-prefix">
                [/]
              </label>
              <input
                ref={searchInputRef}
                type="search"
                id="fmq"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search formulas, theorems, symbols, C/C++ syntax, or exam use..."
                aria-label="Search formulas and theorems (Press / or Ctrl+K to focus)"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="fmstat" role="status" aria-live="polite">
                {filterSummary.visibleCards} / {filterSummary.totalCardsInScope}
              </span>
            </div>

            <div className="utility-pods">
              <div className="chip-group" role="group" aria-label="Filter by learning status">
                {(['all', 'starred', 'unlearned'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`chip-btn${persisted.status === st ? ' active' : ''}`}
                    data-status={st}
                    aria-pressed={persisted.status === st}
                    aria-label={`Filter status: ${st}`}
                    onClick={() => handleStatusChange(st)}
                  >
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </button>
                ))}
              </div>

              <div
                className="chip-group"
                id="thmTypeGroup"
                role="group"
                aria-label="Filter Theorems and Definitions by category"
                hidden={persisted.tab !== 'thm'}
              >
                <button
                  type="button"
                  className={`chip-btn${thmFilter === 'theorems' ? ' active' : ''}`}
                  id="btnFilterTheorems"
                  data-thm-type="theorems"
                  aria-pressed={thmFilter === 'theorems'}
                  aria-label="Keep Theorems, Laws, Principles and everything else"
                  onClick={() =>
                    setThmFilter((prev) => (prev === 'theorems' ? 'all' : 'theorems'))
                  }
                >
                  Theorems &amp; Laws
                </button>
                <button
                  type="button"
                  className={`chip-btn${thmFilter === 'definitions' ? ' active' : ''}`}
                  id="btnFilterDefinitions"
                  data-thm-type="definitions"
                  aria-pressed={thmFilter === 'definitions'}
                  aria-label="Keep Definitions only"
                  onClick={() =>
                    setThmFilter((prev) => (prev === 'definitions' ? 'all' : 'definitions'))
                  }
                >
                  Definitions
                </button>
              </div>

              <div
                ref={toolsWrapRef}
                className={`tools-menu-wrap${toolsOpen ? ' open' : ''}`}
              >
                <button
                  type="button"
                  className="tools-trigger"
                  aria-label="Open Study Tools and View Options Menu"
                  aria-expanded={toolsOpen}
                  onClick={() => setToolsOpen((o) => !o)}
                >
                  <span>Study Tools &amp; View Options</span>
                  <span className="tools-trigger-ind">[+]</span>
                </button>
                <div className={`tools-dropdown${toolsOpen ? ' open' : ''}`} role="menu">
                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    aria-label="Export or Import Progress JSON"
                    onClick={() => {
                      setFlashcardHtml('');
                      setImportJsonText(
                        JSON.stringify(
                          {
                            learned: persisted.learned,
                            starred: persisted.starred,
                            examDate: persisted.examDate,
                          },
                          null,
                          2
                        )
                      );
                      setToolsOpen(false);
                      setModalOpen(true);
                    }}
                  >
                    <span>Export / Import JSON</span>
                    <span className="ntype-badge">IO</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`app-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}
        id="appLayout"
      >
        <aside
          className={`sidebar${sidebarOpen ? ' mobile-open' : ''}`}
          id="sidebar"
          aria-label="Topic Navigation"
          hidden={!sidebarOpen}
        />
        <div className="content-col">
          <WorkspaceErrorBoundary fallbackLabel="Formula Workspace (#fmroot)">
            <main id="fmroot" hidden={persisted.tab !== 'fm'}>
              {preindexedCards.map(({ card, searchIndex }) => {
                const isLearned = Boolean(persisted.learned[card.id]);
                const isStarred = Boolean(persisted.starred[card.id]);
                const courseMatch =
                  persisted.course === 'ALL' || card.course === persisted.course;
                const statusMatch =
                  persisted.status === 'all'
                    ? true
                    : persisted.status === 'starred'
                    ? isStarred
                    : !isLearned;
                const queryMatch = matchesSearchTokens(
                  searchIndex,
                  deferredTokens
                );
                const isHidden = !(courseMatch && statusMatch && queryMatch);
                return (
                  <FormulaCardView
                    key={card.id}
                    card={card}
                    isLearned={isLearned}
                    isStarred={isStarred}
                    isHidden={isHidden}
                    onToggleStar={handleToggleStar}
                    onToggleLearned={handleToggleLearned}
                    onCopyLatex={handleCopyLatex}
                  />
                );
              })}
            </main>
          </WorkspaceErrorBoundary>
          <WorkspaceErrorBoundary fallbackLabel="Theorem Workspace (#thmroot)">
            <main id="thmroot" hidden={persisted.tab !== 'thm'} />
          </WorkspaceErrorBoundary>
        </div>
      </div>

      <div
        className={`fcm${modalOpen ? ' open' : ''}`}
        id="appModal"
        role="dialog"
        aria-modal="true"
        aria-label="Study Tool Modal"
        hidden={!modalOpen}
      >
        <div className="fcb">
          {parsedFlashcardHtml ? (
            <div
              className="fcbody"
              dangerouslySetInnerHTML={{ __html: parsedFlashcardHtml }}
            />
          ) : (
            <>
              <textarea
                aria-label="Backup JSON state"
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
              />
              <button
                type="button"
                className="course-pill active"
                aria-label="Import JSON state"
                onClick={handleImportSubmit}
              >
                IMPORT STATE
              </button>
            </>
          )}
        </div>
      </div>

      <div id="toast" className={toastMsg ? 'show' : ''} role="status" aria-live="polite">
        {toastMsg || 'READY'}
      </div>
    </WorkspaceErrorBoundary>
  );
}
