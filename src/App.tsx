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
import fmrootRawHtml from './content-fmroot.html?raw';
import thmrootRawHtml from './content-thmroot.html?raw';
import navRawHtml from './content-nav.html?raw';
import {
  parseNavContent,
  parseTopicSections,
  type TopicSectionRecord,
} from './utils/contentParser';
import {
  buildFormulaSearchIndex,
  filterFormulaCards,
  matchesSearchTokens,
  matchesTheoremCategoryFilter,
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
      className={className || undefined}
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
 * Applies `renderTextWithMath` across `.fmhtml`, `.fmw`, `.fmu`, `.fmsteps li`, `.fmnote`, and `.thsee`.
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
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const copyPayload = card.copyText ?? (card.rawLatex || card.codeContent || card.title);
  const typeCls = card.cardTypeClass || 'tex';

  const handleCardClick = useCallback(() => {
    if (typeof document !== 'undefined' && document.body.classList.contains('self-test')) {
      setIsRevealed((prev) => !prev);
    }
  }, []);

  return (
    <div
      className={`fmi ${typeCls}${isStarred ? ' starred' : ''}${isLearned ? ' learned' : ''}${isRevealed ? ' revealed' : ''}${isHidden ? ' hidden' : ''}`}
      data-k={card.id}
      data-s={card.keywords}
      hidden={isHidden}
      onClick={handleCardClick}
    >
      <div className="fmh">
        <span className="fmn">
          {card.title}
          {card.badge ? <span className="thty">{card.badge}</span> : null}
        </span>
        <span className="fmb">
          <button
            type="button"
            className={`fmst${isStarred ? ' on' : ''}`}
            aria-label={isStarred ? `Remove star from ${card.title}` : `Star ${card.title}`}
            aria-pressed={isStarred}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(card.id);
            }}
          >
            {isStarred ? 'STARRED' : 'Star'}
          </button>
          <button
            type="button"
            className="fmcp"
            aria-label={`Copy LaTeX for ${card.title}`}
            data-t={copyPayload}
            onClick={(e) => {
              e.stopPropagation();
              onCopyLatex(copyPayload);
            }}
          >
            Copy
          </button>
          <label
            className="fml"
            aria-label={`Mark ${card.title} as learned`}
            onClick={(e) => e.stopPropagation()}
          >
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
        {card.htmlContent ? (
          <SecondaryMathText className="fmhtml" content={card.htmlContent} />
        ) : null}
        {card.rawLatex ? (
          <KatexMathBlock
            latex={card.rawLatex}
            displayMode={card.fmmDisplayMode ?? true}
          />
        ) : null}
        {card.codeContent ? (
          <pre className="fmcode">
            <code>{card.codeContent}</code>
          </pre>
        ) : null}
        {card.bodyText || card.useText ? (
          <div className="fmdet">
            {card.bodyText ? (
              <SecondaryMathText className="fmw" content={card.bodyText} />
            ) : null}
            {card.useText ? (
              <SecondaryMathText className="fmu" content={card.useText} />
            ) : null}
          </div>
        ) : null}
        {card.note ? (
          <SecondaryMathText className="fmnote" content={card.note} />
        ) : null}
        {card.seeAlso ? (
          <SecondaryMathText className="thsee" content={card.seeAlso} />
        ) : null}
        {card.steps && card.steps.length > 0 ? (
          <details className="fmd">
            <summary>{card.stepsSummary || 'Proof & derivation steps'}</summary>
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
  const [modalMode, setModalMode] = useState<'flashcard' | 'io'>('io');
  const [activeFlashcard, setActiveFlashcard] = useState<FormulaCardRecord | null>(null);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');
  const [showTopBtn, setShowTopBtn] = useState<boolean>(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [hideDetails, setHideDetails] = useState<boolean>(false);

  // Parse content-fmroot.html, content-thmroot.html, and content-nav.html once per session
  const fmSections = useMemo<TopicSectionRecord[]>(
    () => parseTopicSections(fmrootRawHtml),
    []
  );
  const thmSections = useMemo<TopicSectionRecord[]>(
    () => parseTopicSections(thmrootRawHtml),
    []
  );
  const navContent = useMemo(
    () => parseNavContent(navRawHtml),
    []
  );

  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const sec of [...parseTopicSections(fmrootRawHtml), ...parseTopicSections(thmrootRawHtml)]) {
      initial[sec.id] = sec.isOpenByDefault;
    }
    return initial;
  });

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

  // Sync body classes for Self-Test, Hide Details, and Single-Column Layout
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('self-test', Boolean(persisted.selfTest));
    if (!persisted.selfTest) {
      document.querySelectorAll('.fmi.revealed').forEach((el) => el.classList.remove('revealed'));
    }
  }, [persisted.selfTest]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('single-col', Boolean(persisted.singleCol));
  }, [persisted.singleCol]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('hide-details', hideDetails);
  }, [hideDetails]);

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
  }, [updateChromeHeight, persisted.goalOpen, persisted.tab]);

  useEffect(() => {
    const handleScroll = () => {
      setShowTopBtn(window.scrollY > 400);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  // Pre-index all formula and theorem cards once per session
  const fmCardsWithIndex = useMemo(
    () =>
      fmSections.flatMap((s) =>
        s.cards.map((card) => ({
          card,
          searchIndex: buildFormulaSearchIndex(card),
        }))
      ),
    [fmSections]
  );

  const thmCardsWithIndex = useMemo(
    () =>
      thmSections.flatMap((s) =>
        s.cards.map((card) => ({
          card,
          searchIndex: buildFormulaSearchIndex(card),
        }))
      ),
    [thmSections]
  );

  const searchIndexById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of fmCardsWithIndex) {
      map.set(item.card.id, item.searchIndex);
    }
    for (const item of thmCardsWithIndex) {
      map.set(item.card.id, item.searchIndex);
    }
    return map;
  }, [fmCardsWithIndex, thmCardsWithIndex]);

  const activeTabCards = useMemo<FormulaCardRecord[]>(() => {
    const base = persisted.tab === 'fm' ? fmCardsWithIndex : thmCardsWithIndex;
    return base.map(({ card }) => ({
      ...card,
      isLearned: Boolean(persisted.learned[card.id]),
      isStarred: Boolean(persisted.starred[card.id]),
    }));
  }, [
    persisted.tab,
    fmCardsWithIndex,
    thmCardsWithIndex,
    persisted.learned,
    persisted.starred,
  ]);

  const deferredTokens = useMemo(
    () => tokenizeSearchQuery(deferredQuery),
    [deferredQuery]
  );

  const filterSummary = useMemo(
    () =>
      filterFormulaCards(activeTabCards, {
        course: persisted.course,
        status: persisted.status,
        query: deferredQuery,
        thmFilter: persisted.tab === 'thm' ? thmFilter : 'all',
      }),
    [
      activeTabCards,
      persisted.course,
      persisted.status,
      deferredQuery,
      persisted.tab,
      thmFilter,
    ]
  );

  // Mastery progress calculation across active course scope
  const masteryStats = useMemo(() => {
    const allCards = [...fmCardsWithIndex, ...thmCardsWithIndex].map((x) => x.card);
    const inScope =
      persisted.course === 'ALL'
        ? allCards
        : allCards.filter((c) => c.course === persisted.course);
    const totalCount = inScope.length;
    let learnedCount = 0;
    for (const c of inScope) {
      if (persisted.learned[c.id]) learnedCount++;
    }
    const pct = totalCount > 0 ? Math.round((learnedCount / totalCount) * 100) : 0;
    return { learnedCount, totalCount, pct };
  }, [fmCardsWithIndex, thmCardsWithIndex, persisted.course, persisted.learned]);

  const handleTabChange = useCallback((tab: TabMode) => {
    setPersisted((prev) => ({ ...prev, tab }));
    setSelectedTopicId('');
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

  const handleToggleTopic = useCallback((topicId: string) => {
    setOpenTopics((prev) => ({
      ...prev,
      [topicId]: !prev[topicId],
    }));
  }, []);

  const handleSelectTopicFromNav = useCallback((targetId: string, href: string) => {
    setSelectedTopicId(targetId);
    setOpenTopics((prev) => ({ ...prev, [targetId]: true }));
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      setSidebarOpen(false);
    }
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', href);
      }
    }
  }, []);

  const handleBrandReset = useCallback(() => {
    setPersisted((prev) => resetToHomeFormulasState(prev));
    setThmFilter('all');
    setSearchInput('');
    setSelectedTopicId('');
    setToolsOpen(false);
    setModalOpen(false);
    setHideDetails(false);
    setOpenTopics(() => {
      const collapsed: Record<string, boolean> = {};
      for (const sec of [...fmSections, ...thmSections]) {
        collapsed[sec.id] = false;
      }
      return collapsed;
    });
    if (typeof document !== 'undefined') {
      document.querySelectorAll<HTMLDetailsElement>('details.fmt, details.fmd').forEach((d) => {
        d.open = false;
      });
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    showToast('RESET TO FORMULAS // ALL RETRACTED');
  }, [fmSections, thmSections, showToast]);

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

  // Study Tools Handlers
  const handleToggleSelfTest = useCallback(() => {
    setPersisted((prev) => {
      const next = !prev.selfTest;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('self-test', next);
      }
      showToast(next ? 'SELF-TEST BLUR ENABLED' : 'SELF-TEST BLUR DISABLED');
      return { ...prev, selfTest: next };
    });
  }, [showToast]);

  const handleToggleHideDetails = useCallback(() => {
    setHideDetails((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('hide-details', next);
      }
      showToast(next ? 'DETAILS HIDDEN' : 'DETAILS VISIBLE');
      return next;
    });
  }, [showToast]);

  const handleToggleSingleCol = useCallback(() => {
    setPersisted((prev) => {
      const next = !prev.singleCol;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('single-col', next);
      }
      showToast(next ? 'SINGLE-COLUMN VIEW' : 'MULTI-COLUMN GRID VIEW');
      return { ...prev, singleCol: next };
    });
  }, [showToast]);

  const pickRandomFlashcard = useCallback(() => {
    const visibleIds = new Set(
      filterSummary.topics.flatMap((t) => t.visibleCardIds)
    );
    const pool = activeTabCards.filter((c) => visibleIds.has(c.id));
    if (pool.length === 0) {
      showToast('NO VISIBLE CARDS IN CURRENT FILTER');
      return;
    }
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    setActiveFlashcard(chosen);
    setModalMode('flashcard');
    setToolsOpen(false);
    setModalOpen(true);
  }, [filterSummary.topics, activeTabCards, showToast]);

  const handleExpandCollapseAll = useCallback(
    (expand: boolean) => {
      const targetSections = persisted.tab === 'fm' ? fmSections : thmSections;
      setOpenTopics((prev) => {
        const next = { ...prev };
        for (const sec of targetSections) {
          next[sec.id] = expand;
        }
        return next;
      });
      setToolsOpen(false);
      showToast(expand ? 'ALL TOPICS EXPANDED' : 'ALL TOPICS COLLAPSED');
    },
    [persisted.tab, fmSections, thmSections, showToast]
  );

  const handleResetProgress = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      learned: {},
      starred: {},
    }));
    setToolsOpen(false);
    showToast('PROGRESS RESET COMPLETE');
  }, [showToast]);

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

  const hasQuery = searchInput.trim().length > 0;
  const isZeroMatch = filterSummary.visibleCards === 0;
  const hasActiveSearch = deferredTokens.length > 0;

  const renderSectionAccordion = (
    section: TopicSectionRecord,
    isThmTab: boolean
  ) => {
    const courseMatch =
      persisted.course === 'ALL' || section.course === persisted.course;
    let learnedInTopic = 0;
    let visibleInTopic = 0;

    const cardVisibility = section.cards.map((card) => {
      const isLearned = Boolean(persisted.learned[card.id]);
      const isStarred = Boolean(persisted.starred[card.id]);
      if (isLearned) learnedInTopic++;

      const statusMatch =
        persisted.status === 'all'
          ? true
          : persisted.status === 'starred'
          ? isStarred
          : !isLearned;
      const thmMatch = isThmTab
        ? matchesTheoremCategoryFilter(card.badge, thmFilter)
        : true;
      const sIdx = searchIndexById.get(card.id) || '';
      const queryMatch = matchesSearchTokens(sIdx, deferredTokens);
      const isVisible = courseMatch && statusMatch && thmMatch && queryMatch;
      if (isVisible) visibleInTopic++;
      return { card, isLearned, isStarred, isVisible };
    });

    const sectionHidden = visibleInTopic === 0;
    const isOpen = hasActiveSearch
      ? visibleInTopic > 0
      : Boolean(openTopics[section.id]);
    const isIndexSelected = selectedTopicId === section.id;

    return (
      <details
        key={section.id}
        id={section.id}
        data-c={section.course}
        className={`fmt${isIndexSelected ? ' index-selected' : ''}${sectionHidden ? ' hidden' : ''}`}
        open={isOpen}
        hidden={sectionHidden}
      >
        <summary
          onClick={(e) => {
            e.preventDefault();
            handleToggleTopic(section.id);
          }}
        >
          <span className="fmtt">{section.title}</span>
          <span className="fmmeta">
            {section.freqBadge ? (
              <span
                className="fmfreq"
                title="How often this topic appeared in the 2010–2025 papers"
              >
                {section.freqBadge}
              </span>
            ) : null}
            <span className="fmcnt">
              {learnedInTopic}/{section.cards.length} learned
            </span>
          </span>
        </summary>
        <div className="fmgrid">
          {cardVisibility.map(({ card, isLearned, isStarred, isVisible }) => (
            <FormulaCardView
              key={card.id}
              card={card}
              isLearned={isLearned}
              isStarred={isStarred}
              isHidden={!isVisible}
              onToggleStar={handleToggleStar}
              onToggleLearned={handleToggleLearned}
              onCopyLatex={handleCopyLatex}
            />
          ))}
        </div>
      </details>
    );
  };

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
                id="tabFm"
                role="tab"
                aria-selected={persisted.tab === 'fm'}
                aria-label="View Formulas Sheet"
                onClick={() => handleTabChange('fm')}
              >
                <span>Formulas</span>
                <span className="tn" id="cntFm">
                  {fmCardsWithIndex.length}
                </span>
              </button>
              <button
                type="button"
                className={`tab${persisted.tab === 'thm' ? ' active' : ''}`}
                id="tabThm"
                role="tab"
                aria-selected={persisted.tab === 'thm'}
                aria-label="View Theorems and Definitions Sheet"
                onClick={() => handleTabChange('thm')}
              >
                <span>Theorems &amp; Definitions</span>
                <span className="tn" id="cntThm">
                  {thmCardsWithIndex.length}
                </span>
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
            <div
              id="pb"
              role="progressbar"
              aria-label="Overall Mastery Progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={masteryStats.pct}
            >
              <div id="pf" style={{ width: `${masteryStats.pct}%` }} />
            </div>
            <span id="ptxt">
              {masteryStats.learnedCount} / {masteryStats.totalCount} ({masteryStats.pct}%)
            </span>
          </div>
          <div className="cdrow">
            <label htmlFor="examDateInput">EXAM DATE</label>
            <input
              id="examDateInput"
              type="date"
              value={persisted.examDate || ''}
              aria-label="Term final exam date"
              onChange={(e) =>
                setPersisted((prev) => ({ ...prev, examDate: e.target.value }))
              }
            />
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
            <div
              className={`search-wrap${hasQuery ? ' has-query' : ''}${isZeroMatch ? ' zero-match' : ''}`}
              role="search"
            >
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
              <button
                type="button"
                className="search-clear-btn"
                aria-label="Clear search query"
                hidden={!searchInput}
                onClick={() => setSearchInput('')}
              >
                [CLR]
              </button>
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
                  <div className="dropdown-sec-label">VIEW &amp; STUDY MODES</div>
                  <button
                    type="button"
                    className={`dropdown-item${persisted.selfTest ? ' active' : ''}`}
                    role="menuitem"
                    onClick={handleToggleSelfTest}
                  >
                    <span>Self-Test Blur Mode</span>
                    <span className="ntype-badge">{persisted.selfTest ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    className={`dropdown-item${hideDetails ? ' active' : ''}`}
                    role="menuitem"
                    onClick={handleToggleHideDetails}
                  >
                    <span>Hide Where/Use Details</span>
                    <span className="ntype-badge">{hideDetails ? 'ON' : 'OFF'}</span>
                  </button>
                  <button
                    type="button"
                    className={`dropdown-item${persisted.singleCol ? ' active' : ''}`}
                    role="menuitem"
                    onClick={handleToggleSingleCol}
                  >
                    <span>Single-Column Layout</span>
                    <span className="ntype-badge">{persisted.singleCol ? '1-COL' : 'GRID'}</span>
                  </button>
                  <div className="dropdown-divider" />
                  <div className="dropdown-sec-label">ACTIVE RECALL &amp; ACCORDIONS</div>
                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={pickRandomFlashcard}
                  >
                    <span>Random Flashcard</span>
                    <span className="ntype-badge">DECK</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={() => handleExpandCollapseAll(true)}
                  >
                    <span>Expand All Topics</span>
                    <span className="ntype-badge">[+]</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={() => handleExpandCollapseAll(false)}
                  >
                    <span>Collapse All Topics</span>
                    <span className="ntype-badge">[-]</span>
                  </button>
                  <div className="dropdown-divider" />
                  <div className="dropdown-sec-label">DATA &amp; PROGRESS</div>
                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    aria-label="Export or Import Progress JSON"
                    onClick={() => {
                      setActiveFlashcard(null);
                      setModalMode('io');
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
                  <button
                    type="button"
                    className="dropdown-item danger"
                    role="menuitem"
                    onClick={handleResetProgress}
                  >
                    <span>Reset Progress</span>
                    <span className="ntype-badge">CLR</span>
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
        >
          <div className="focus-pill">
            <span className="focus-pill-tag">TOPIC INDEX</span>
            <span>{persisted.course === 'ALL' ? 'ALL COURSES' : persisted.course}</span>
          </div>
          <nav className="fmnav" id="navF" hidden={persisted.tab !== 'fm'}>
            {navContent.navF.map((group) => {
              const rowHidden =
                persisted.course !== 'ALL' && group.course !== persisted.course;
              return (
                <div
                  key={group.course}
                  className={`fmnavrow${rowHidden ? ' hidden' : ''}`}
                  data-c={group.course}
                  hidden={rowHidden}
                >
                  <b>{group.badgeText}</b>
                  {group.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className={`fmlink${selectedTopicId === link.targetId ? ' active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelectTopicFromNav(link.targetId, link.href);
                      }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              );
            })}
          </nav>
          <nav className="fmnav" id="navT" hidden={persisted.tab !== 'thm'}>
            {navContent.navT.map((group) => {
              const rowHidden =
                persisted.course !== 'ALL' && group.course !== persisted.course;
              return (
                <div
                  key={group.course}
                  className={`fmnavrow${rowHidden ? ' hidden' : ''}`}
                  data-c={group.course}
                  hidden={rowHidden}
                >
                  <b>{group.badgeText}</b>
                  {group.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className={`fmlink${selectedTopicId === link.targetId ? ' active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        handleSelectTopicFromNav(link.targetId, link.href);
                      }}
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="content-col">
          {isZeroMatch ? (
            <div className="search-empty-state" role="status">
              <div className="ntype-badge">[:: 0 CARDS MATCH CURRENT FILTER ::]</div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13.5px' }}>
                No formulas or theorems matched your active search query or filter criteria.
              </p>
              <button
                type="button"
                className="sb-btn"
                onClick={() => {
                  setSearchInput('');
                  setPersisted((prev) => ({ ...prev, course: 'ALL', status: 'all' }));
                  setThmFilter('all');
                }}
              >
                [RESET FILTERS]
              </button>
            </div>
          ) : null}

          <WorkspaceErrorBoundary fallbackLabel="Formula Workspace (#fmroot)">
            <main id="fmroot" hidden={persisted.tab !== 'fm'}>
              {fmSections.map((section) => renderSectionAccordion(section, false))}
            </main>
          </WorkspaceErrorBoundary>
          <WorkspaceErrorBoundary fallbackLabel="Theorem Workspace (#thmroot)">
            <main id="thmroot" hidden={persisted.tab !== 'thm'}>
              {thmSections.map((section) => renderSectionAccordion(section, true))}
            </main>
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
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setModalOpen(false);
          }
        }}
      >
        <div className="fcb">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '14px',
              paddingBottom: '10px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span className="ntype-badge">
              {modalMode === 'flashcard' && activeFlashcard
                ? `RANDOM FLASHCARD // ${activeFlashcard.course}`
                : 'EXPORT / IMPORT PROGRESS JSON'}
            </span>
            <button
              type="button"
              className="sb-btn"
              aria-label="Close modal"
              onClick={() => setModalOpen(false)}
            >
              [CLOSE]
            </button>
          </div>

          {modalMode === 'flashcard' && activeFlashcard ? (
            <div className="fcbody">
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  marginBottom: '10px',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span>{activeFlashcard.title}</span>
                {activeFlashcard.badge ? (
                  <span className="thty">{activeFlashcard.badge}</span>
                ) : null}
              </div>
              {activeFlashcard.htmlContent ? (
                <SecondaryMathText
                  className="fmhtml"
                  content={activeFlashcard.htmlContent}
                />
              ) : null}
              {activeFlashcard.rawLatex ? (
                <KatexMathBlock
                  latex={activeFlashcard.rawLatex}
                  displayMode={activeFlashcard.fmmDisplayMode ?? true}
                />
              ) : null}
              {activeFlashcard.codeContent ? (
                <pre className="fmcode">
                  <code>{activeFlashcard.codeContent}</code>
                </pre>
              ) : null}
              {activeFlashcard.bodyText || activeFlashcard.useText ? (
                <div className="fmdet" style={{ marginTop: '10px' }}>
                  {activeFlashcard.bodyText ? (
                    <SecondaryMathText
                      className="fmw"
                      content={activeFlashcard.bodyText}
                    />
                  ) : null}
                  {activeFlashcard.useText ? (
                    <SecondaryMathText
                      className="fmu"
                      content={activeFlashcard.useText}
                    />
                  ) : null}
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  marginTop: '16px',
                }}
              >
                <button
                  type="button"
                  className="sb-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="course-pill active"
                  onClick={pickRandomFlashcard}
                >
                  Next Random Card
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea
                aria-label="Backup JSON state"
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '160px',
                  background: 'rgba(0,0,0,0.55)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-crisp)',
                  borderRadius: '10px',
                  padding: '10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="sb-btn"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(importJsonText).catch(() => {});
                    }
                    showToast('BACKUP JSON COPIED');
                  }}
                >
                  COPY JSON
                </button>
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
          )}
        </div>
      </div>

      <button
        id="totop"
        type="button"
        className={showTopBtn ? 'vis' : ''}
        aria-label="Scroll back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        [TOP]
      </button>

      <div id="toast" className={toastMsg ? 'show' : ''} role="status" aria-live="polite">
        {toastMsg || 'READY'}
      </div>
    </WorkspaceErrorBoundary>
  );
}
