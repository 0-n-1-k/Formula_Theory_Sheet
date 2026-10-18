/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, {
  Component,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import katex from 'katex';
import {
  filterFormulaCards,
  type FormulaCardRecord,
} from './utils/formulaSearch';
import {
  DEFAULT_APP_STATE,
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
  const renderedHtml = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
      });
    } catch {
      return '';
    }
  }, [latex, displayMode]);

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

export interface FormulaCardViewProps {
  card: FormulaCardRecord;
  isLearned: boolean;
  isStarred: boolean;
  onToggleStar: (id: string) => void;
  onToggleLearned: (id: string, checked: boolean) => void;
  onCopyLatex: (latex: string) => void;
}

export const FormulaCardView = memo(function FormulaCardView({
  card,
  isLearned,
  isStarred,
  onToggleStar,
  onToggleLearned,
  onCopyLatex,
}: FormulaCardViewProps) {
  return (
    <div
      className={`fmi tex${isStarred ? ' starred' : ''}${isLearned ? ' learned' : ''}`}
      data-k={card.id}
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
          <div className="fmw">{card.bodyText}</div>
        </div>
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
  const [query, setQuery] = useState<string>('');
  const [toolsOpen, setToolsOpen] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
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
        if (document.activeElement === searchInputRef.current && query) {
          setQuery('');
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
  }, [query]);

  const sampleCards = useMemo<FormulaCardRecord[]>(() => [], []);

  const filterSummary = useMemo(
    () =>
      filterFormulaCards(sampleCards, {
        course: persisted.course,
        status: persisted.status,
        query,
      }),
    [sampleCards, persisted.course, persisted.status, query]
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

  return (
    <WorkspaceErrorBoundary fallbackLabel="BUET L-1/T-1 EEE Sheet">
      <header className="top-chrome" ref={topChromeRef}>
        <div className="hd">
          <div className="hd-left">
            <button
              type="button"
              className="sb-btn"
              id="sbBtn"
              aria-label="Toggle Topic Index Sidebar"
            >
              [INDEX]
            </button>
            <div className="brand-wrap">
              <div className="brand-titles">
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
            <button
              type="button"
              className="goal-toggle-btn"
              aria-label="Toggle Study Progress and Exam Countdown Drawer"
              aria-expanded={persisted.goalOpen}
              onClick={() =>
                setPersisted((prev) => ({ ...prev, goalOpen: !prev.goalOpen }))
              }
            >
              <span className="ntype-badge">GOAL // TIMER</span>
            </button>
          </div>
        </div>
        <div className="goal" hidden={!persisted.goalOpen}>
          <div className="goal-progress-wrap">
            <span className="ntype-badge">MASTERY</span>
            <div id="pb" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
              <div id="pf" />
            </div>
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
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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

      <div className="app-layout" id="appLayout">
        <div className="content-col">
          <WorkspaceErrorBoundary fallbackLabel="Formula Workspace (#fmroot)">
            <main id="fmroot" hidden={persisted.tab !== 'fm'} />
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
        </div>
      </div>

      <div id="toast" className={toastMsg ? 'show' : ''} role="status" aria-live="polite">
        {toastMsg || 'READY'}
      </div>
    </WorkspaceErrorBoundary>
  );
}
