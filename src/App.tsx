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
import genRawHtml from './content-gen.html?raw';
import {
  parseTopicSections,
  type TopicSectionRecord,
} from './utils/contentParser';
import {
  CURRENT_TERM_CONFIG,
  TERM_REGISTRY,
  buildEffectiveCoursePills,
} from './termConfig';
import {
  buildFormulaSearchIndex,
  filterFormulaCards,
  matchesSearchTokens,
  matchesTheoremCategoryFilter,
  scoreFormulaCardSearch,
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
  updateSearchHistoryList,
  validateJsonImportPayload,
  clampHudHeightPx,
  clampPinnedCardPosition,
  computeCornerResizedLayout,
  createInitialPinnedLayout,
  getPinnedCardSizeMode,
  PINNED_DEFAULT_HEIGHT,
  PINNED_DEFAULT_WIDTH,
  PINNED_MIN_HEIGHT,
  PINNED_MIN_WIDTH,
  type CourseCode,
  type PersistedAppState,
  type PinnedCardLayout,
  type ResizeCorner,
  type StatusFilter,
  type TabMode,
} from './utils/storageSafety';
import {
  PRACTICE_CATALOG,
  getPracticeModulesForCourse,
} from './utils/practiceCatalog';
import { PdfCanvasReader } from './components/PdfCanvasReader';

const STORAGE_KEY = 'buet_eee_' + CURRENT_TERM_CONFIG.termId + '_v2_state';
const QUICK_SHORTCUTS = ['cif', 'divergence theorem', 'thevenin', 'mvt', 'shm', 'leibnitz'] as const;
const TOTAL_PRACTICE_MODULES = PRACTICE_CATALOG.reduce((acc, g) => acc + g.modules.length, 0);

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
  selfTest?: boolean;
  onToggleStar: (id: string) => void;
  onToggleLearned: (id: string, checked: boolean) => void;
  onCopyLatex: (latex: string) => void;
  onPeekTopic?: (topicId: string) => void;
  onPinCard?: (card: FormulaCardRecord) => void;
  isPinned?: boolean;
  topicTitle?: string;
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
  selfTest = false,
  onToggleStar,
  onToggleLearned,
  onCopyLatex,
  onPeekTopic,
  onPinCard,
  isPinned = false,
  topicTitle,
}: FormulaCardViewProps) {
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const copyPayload = card.copyText ?? (card.rawLatex || card.codeContent || card.title);
  const typeCls = card.cardTypeClass || 'tex';

  useEffect(() => {
    if (!selfTest) {
      setIsRevealed(false);
    }
  }, [selfTest]);

  const handleCardClick = useCallback(() => {
    if (selfTest || (typeof document !== 'undefined' && document.body.classList.contains('self-test'))) {
      setIsRevealed((prev) => !prev);
    }
  }, [selfTest]);

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
          <SecondaryMathText className="" as="span" content={card.title} />
          {card.badge ? <span className="thty">{card.badge}</span> : null}
          {topicTitle ? (
            <span className="fm-card-topic-tag" title={`Topic: ${topicTitle}`}>
              {topicTitle}
            </span>
          ) : null}
        </span>
        <span className="fmb">
          {onPeekTopic ? (
            <button
              type="button"
              className="fm-hud-btn fm-peek-btn"
              aria-label={`Peek full topic for ${card.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onPeekTopic(card.topicId);
              }}
            >
              [PEEK TOPIC]
            </button>
          ) : null}
          {onPinCard ? (
            <button
              type="button"
              className={`fm-hud-btn fm-pin-btn${isPinned ? ' on' : ''}`}
              aria-label={`Pin ${card.title} to fullscreen corner dock`}
              onClick={(e) => {
                e.stopPropagation();
                onPinCard(card);
              }}
            >
              {isPinned ? '[PINNED]' : '[PIN]'}
            </button>
          ) : null}
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
          {card.course !== 'GEN' ? (
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
          ) : null}
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
            <summary>
              <SecondaryMathText
                as="span"
                className=""
                content={card.stepsSummary || 'Proof & derivation steps'}
              />
            </summary>
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

export default function App() {
  const fmSections = useMemo(() => parseTopicSections(fmrootRawHtml), []);
  const thmSections = useMemo(() => parseTopicSections(thmrootRawHtml), []);
  const genSections = useMemo(() => parseTopicSections(genRawHtml), []);
  const allSections = useMemo(
    () => [...fmSections, ...thmSections, ...genSections],
    [fmSections, thmSections, genSections]
  );

  // Auto-detect course pills: combine CURRENT_TERM_CONFIG.courses with any data-c codes found in fmSections/thmSections
  const courseOptions = useMemo(() => {
    const discovered = new Set<string>();
    for (const sec of [...fmSections, ...thmSections]) {
      if (sec.course) discovered.add(sec.course);
    }
    return buildEffectiveCoursePills(CURRENT_TERM_CONFIG, discovered);
  }, [fmSections, thmSections]);

  // Auto-generate sidebar navigation groups (navF and navT) directly from parsed sections
  const navContent = useMemo(() => {
    const orderedCourses = courseOptions.filter((c) => c.code !== 'ALL');
    const buildGroups = (sections: ReadonlyArray<TopicSectionRecord>) =>
      orderedCourses
        .map((courseCfg) => {
          const matching = sections.filter((sec) => sec.course === courseCfg.code);
          return {
            course: courseCfg.code,
            badgeText: courseCfg.badge,
            links: matching.map((sec) => ({
              href: `#${sec.id}`,
              targetId: sec.id,
              label: sec.title,
            })),
          };
        })
        .filter((g) => g.links.length > 0);

    return {
      navF: buildGroups([...fmSections, ...genSections]),
      navT: buildGroups([...thmSections, ...genSections]),
    };
  }, [courseOptions, fmSections, thmSections, genSections]);

  const [persisted, setPersisted] = useState<PersistedAppState>(() =>
    safeReadStorage(
      STORAGE_KEY,
      DEFAULT_APP_STATE,
      undefined,
      courseOptions.map((c) => c.code)
    )
  );
  // Optimization C: Immediate local state for 60fps search input + useDeferredValue for non-blocking filter calculation
  const [searchInput, setSearchInput] = useState<string>('');
  const deferredQuery = useDeferredValue(searchInput);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [thmFilter, setThmFilter] = useState<TheoremCategoryFilter>('all');
  const [toolsOpen, setToolsOpen] = useState<boolean>(false);
  const [termMenuOpen, setTermMenuOpen] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'flashcard' | 'io'>('io');
  const [activeFlashcard, setActiveFlashcard] = useState<FormulaCardRecord | null>(null);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');
  const [showTopBtn, setShowTopBtn] = useState<boolean>(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [hideDetails, setHideDetails] = useState<boolean>(false);

  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [selectedPracticeModuleId, setSelectedPracticeModuleId] = useState<string>('m159-complex');
  const [isPdfFullscreen, setIsPdfFullscreen] = useState<boolean>(false);
  const [fsHudPointerTop, setFsHudPointerTop] = useState<boolean>(false);
  const [fsHudHovered, setFsHudHovered] = useState<boolean>(false);
  const [fsSearchFocused, setFsSearchFocused] = useState<boolean>(false);

  // Decoupled Fullscreen HUD state (never exits fullscreen or changes persisted.tab)
  const [hudQuery, setHudQuery] = useState<string>('');
  const [hudScope, setHudScope] = useState<'ALL' | 'FM' | 'THM'>('ALL');
  const [hudCourseScope, setHudCourseScope] = useState<'COURSE' | 'ALL'>('COURSE');
  const [hudRenderLimit, setHudRenderLimit] = useState<number>(12);
  const [hudHeightPx, setHudHeightPx] = useState<number | null>(null);
  const [isResizingHud, setIsResizingHud] = useState<boolean>(false);
  const [peekTopicId, setPeekTopicId] = useState<string | null>(null);
  const [pinnedCards, setPinnedCards] = useState<FormulaCardRecord[]>([]);
  const [minimizedPinnedIds, setMinimizedPinnedIds] = useState<Record<string, boolean>>({});
  const [pinnedLayouts, setPinnedLayouts] = useState<Record<string, PinnedCardLayout>>({});
  const [pinInteraction, setPinInteraction] = useState<{
    type: 'drag' | 'resize';
    cardId: string;
    corner?: ResizeCorner;
    startX: number;
    startY: number;
    startLayout: PinnedCardLayout;
  } | null>(null);
  const topPinZIndexRef = useRef<number>(10010);

  const [openTopics, setOpenTopics] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const sec of [...fmSections, ...thmSections, ...genSections]) {
      initial[sec.id] = sec.isOpenByDefault;
    }
    return initial;
  });

  const topChromeRef = useRef<HTMLElement | null>(null);
  const fmbarRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fsSearchInputRef = useRef<HTMLInputElement | null>(null);
  const fsTopicStripRef = useRef<HTMLDivElement | null>(null);
  const fsHudResultsRef = useRef<HTMLDivElement | null>(null);
  const fullscreenWrapperRef = useRef<HTMLDivElement | null>(null);
  const toolsWrapRef = useRef<HTMLDivElement | null>(null);
  const termSwitcherWrapRef = useRef<HTMLDivElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const isGenSelected = persisted.course === 'GEN';
  const activeCourseBadge = useMemo(
    () =>
      courseOptions.find((c) => c.code === persisted.course)?.badge || persisted.course,
    [courseOptions, persisted.course]
  );

  const practiceModules = useMemo(
    () => getPracticeModulesForCourse(persisted.course),
    [persisted.course]
  );

  const activePracticeModule = useMemo(
    () =>
      practiceModules.find((m) => m.id === selectedPracticeModuleId) ||
      practiceModules[0],
    [practiceModules, selectedPracticeModuleId]
  );

  useEffect(() => {
    if (
      practiceModules.length > 0 &&
      !practiceModules.some((m) => m.id === selectedPracticeModuleId)
    ) {
      setSelectedPracticeModuleId(practiceModules[0].id);
    }
  }, [practiceModules, selectedPracticeModuleId]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg('');
    }, 2200);
  }, []);

  const recordSearchHistory = useCallback((rawQuery: string) => {
    const trimmed = (rawQuery || '').trim();
    if (trimmed.length < 2) return;
    setPersisted((prev) => {
      const nextHistory = updateSearchHistoryList(prev.searchHistory, trimmed);
      return { ...prev, searchHistory: nextHistory };
    });
  }, []);

  const handleClearAllHistory = useCallback(() => {
    setPersisted((prev) => ({ ...prev, searchHistory: [] }));
  }, []);

  const handleDeleteHistoryItem = useCallback((itemToRemove: string) => {
    setPersisted((prev) => ({
      ...prev,
      searchHistory: (prev.searchHistory || []).filter(
        (item) => item.toLowerCase() !== itemToRemove.toLowerCase()
      ),
    }));
  }, []);

  useEffect(() => {
    safeWriteStorage(
      STORAGE_KEY,
      persisted,
      undefined,
      courseOptions.map((c) => c.code)
    );
  }, [persisted, courseOptions]);

  // Sync body classes for Self-Test, Hide Details, and Single-Column Layout
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('self-test', Boolean(persisted.selfTest));
  }, [persisted.selfTest]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('single-col', Boolean(persisted.singleCol));
  }, [persisted.singleCol]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('hide-details', hideDetails);
  }, [hideDetails]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = CURRENT_TERM_CONFIG.brandTitle;
    }
  }, []);

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

  const prevIsMobileTabletRef = useRef<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 1024 : false
  );

  useEffect(() => {
    updateChromeHeight();
    const handleResize = () => {
      updateChromeHeight();
      const isNowMobileTablet = window.innerWidth <= 1024;
      if (isNowMobileTablet !== prevIsMobileTabletRef.current) {
        prevIsMobileTabletRef.current = isNowMobileTablet;
        setSidebarOpen(!isNowMobileTablet);
      }
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [updateChromeHeight, persisted.goalOpen, persisted.tab, persisted.courseBarCollapsed]);

  useEffect(() => {
    const handleScroll = () => {
      setShowTopBtn(window.scrollY > 400);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const retractHud = useCallback(() => {
    setIsResizingHud(false);
    setFsHudPointerTop(false);
    setFsHudHovered(false);
    setFsSearchFocused(false);
    fsSearchInputRef.current?.blur();
  }, []);

  const enterPdfFullscreen = useCallback(() => {
    setIsPdfFullscreen(true);
    try {
      fullscreenWrapperRef.current?.requestFullscreen?.().catch(() => {});
    } catch {
      // Ignore if native fullscreen is blocked by iframe policy
    }
  }, []);

  const exitPdfFullscreen = useCallback(() => {
    setIsPdfFullscreen(false);
    setIsResizingHud(false);
    setFsHudPointerTop(false);
    setFsHudHovered(false);
    setFsSearchFocused(false);
    try {
      if (typeof document !== 'undefined' && document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    } catch {
      // Ignore
    }
  }, []);

  // Handle dragging the bottom vertical edge of the Fullscreen HUD to increase or decrease HUD height
  useEffect(() => {
    if (!isResizingHud || typeof window === 'undefined') return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      const nextHeight = clampHudHeightPx(e.clientY, window.innerHeight);
      setHudHeightPx(nextHeight);
      const neededCards = Math.max(12, Math.ceil(nextHeight / 95) * 3);
      setHudRenderLimit((prev) => (prev < neededCards ? neededCards : prev));
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsResizingHud(false);
      const currentLimit = hudHeightPx ?? Math.round(window.innerHeight * 0.5);
      const withinHud = e.clientY <= currentLimit + 16;
      setFsHudHovered(withinHud);
      setFsHudPointerTop(withinHud);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingHud, hudHeightPx]);

  // Sync native OS fullscreen exit (Escape key in native fullscreen) with isPdfFullscreen
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsPdfFullscreen(false);
        setFsHudPointerTop(false);
        setFsHudHovered(false);
        setFsSearchFocused(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Lock document.body overflow while in PDF fullscreen so only the single PDF scrollbar exists
  useEffect(() => {
    if (typeof document === 'undefined' || !isPdfFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isPdfFullscreen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F5' && (isPdfFullscreen || persisted.tab === 'prac')) {
        e.preventDefault();
        e.stopPropagation();
        if (isPdfFullscreen) {
          exitPdfFullscreen();
        } else {
          enterPdfFullscreen();
        }
        return;
      }

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
        if (isPdfFullscreen) {
          setFsHudPointerTop(true);
          window.requestAnimationFrame(() => {
            fsSearchInputRef.current?.focus();
            fsSearchInputRef.current?.select();
          });
        } else {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }
      } else if (e.key === 'Escape') {
        if (isPdfFullscreen) {
          const hudCurrentlyOpen = fsHudPointerTop || fsHudHovered || fsSearchFocused;
          if (hudCurrentlyOpen) {
            retractHud();
          } else {
            exitPdfFullscreen();
          }
          return;
        }
        if (document.activeElement === searchInputRef.current && searchInput) {
          setSearchInput('');
        }
        setSearchFocused(false);
        setToolsOpen(false);
        setTermMenuOpen(false);
        setModalOpen(false);
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
          setSidebarOpen(false);
        }
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
      if (
        termSwitcherWrapRef.current &&
        e.target instanceof Node &&
        !termSwitcherWrapRef.current.contains(e.target)
      ) {
        setTermMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('click', handleDocumentClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [
    searchInput,
    isPdfFullscreen,
    persisted.tab,
    fsHudPointerTop,
    fsHudHovered,
    fsSearchFocused,
    retractHud,
    enterPdfFullscreen,
    exitPdfFullscreen,
  ]);

  // Pre-index all formula, theorem, and GEN cards once per session
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

  const genCardsWithIndex = useMemo(
    () =>
      genSections.flatMap((s) =>
        s.cards.map((card) => ({
          card,
          searchIndex: buildFormulaSearchIndex(card),
        }))
      ),
    [genSections]
  );

  const searchIndexById = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of fmCardsWithIndex) {
      map.set(item.card.id, item.searchIndex);
    }
    for (const item of thmCardsWithIndex) {
      map.set(item.card.id, item.searchIndex);
    }
    for (const item of genCardsWithIndex) {
      map.set(item.card.id, item.searchIndex);
    }
    return map;
  }, [fmCardsWithIndex, thmCardsWithIndex, genCardsWithIndex]);

  const activeTabCards = useMemo<FormulaCardRecord[]>(() => {
    // GEN is excluded from overall formula/theorem counts unless GEN is explicitly selected
    const base = isGenSelected
      ? genCardsWithIndex
      : persisted.tab === 'fm'
      ? fmCardsWithIndex
      : persisted.tab === 'thm'
      ? thmCardsWithIndex
      : [...fmCardsWithIndex, ...thmCardsWithIndex];
    return base.map(({ card }) => ({
      ...card,
      isLearned: Boolean(persisted.learned[card.id]),
      isStarred: Boolean(persisted.starred[card.id]),
    }));
  }, [
    isGenSelected,
    persisted.tab,
    fmCardsWithIndex,
    thmCardsWithIndex,
    genCardsWithIndex,
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
        thmFilter: persisted.tab === 'thm' && !isGenSelected ? thmFilter : 'all',
      }),
    [
      activeTabCards,
      persisted.course,
      persisted.status,
      deferredQuery,
      persisted.tab,
      isGenSelected,
      thmFilter,
    ]
  );

  const genMatchedCardsCount = useMemo(() => {
    if (
      isGenSelected ||
      persisted.course !== 'ALL' ||
      (deferredTokens.length === 0 && persisted.status !== 'starred')
    ) {
      return 0;
    }
    let count = 0;
    for (const { card, searchIndex } of genCardsWithIndex) {
      const isStarred = Boolean(persisted.starred[card.id]);
      const statusMatch =
        persisted.status === 'all'
          ? true
          : persisted.status === 'starred'
          ? isStarred
          : false;
      if (
        statusMatch &&
        (deferredTokens.length === 0 ||
          matchesSearchTokens(searchIndex, deferredTokens, card.title))
      ) {
        count++;
      }
    }
    return count;
  }, [
    isGenSelected,
    persisted.course,
    persisted.status,
    persisted.starred,
    deferredTokens,
    genCardsWithIndex,
  ]);

  // Debounced search history recording (1200ms) when query >= 2 chars and matches > 0 cards
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length < 2 || (filterSummary.visibleCards === 0 && genMatchedCardsCount === 0)) return;
    const timer = window.setTimeout(() => {
      recordSearchHistory(trimmed);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [searchInput, filterSummary.visibleCards, genMatchedCardsCount, recordSearchHistory]);

  // Mastery progress calculation across active course scope (GEN excluded from total mastery)
  const masteryStats = useMemo(() => {
    const allCourseCards = [...fmCardsWithIndex, ...thmCardsWithIndex].map(
      (x) => x.card
    );
    const inScope =
      persisted.course === 'ALL' || persisted.course === 'GEN'
        ? allCourseCards
        : allCourseCards.filter((c) => c.course === persisted.course);
    const totalCount = inScope.length;
    let learnedCount = 0;
    for (const c of inScope) {
      if (persisted.learned[c.id]) learnedCount++;
    }
    const pct = totalCount > 0 ? Math.round((learnedCount / totalCount) * 100) : 0;
    return { learnedCount, totalCount, pct };
  }, [
    fmCardsWithIndex,
    thmCardsWithIndex,
    persisted.course,
    persisted.learned,
  ]);

  const handleTabChange = useCallback((tab: TabMode) => {
    setPersisted((prev) => ({
      ...prev,
      tab,
      course: prev.course === 'GEN' && tab !== 'fm' ? 'ALL' : prev.course,
    }));
    setSelectedTopicId('');
  }, []);

  const handleCourseChange = useCallback((course: CourseCode) => {
    setPersisted((prev) => ({ ...prev, course }));
  }, []);

  const handleToggleCourseBar = useCallback(() => {
    setPersisted((prev) => ({
      ...prev,
      courseBarCollapsed: !prev.courseBarCollapsed,
    }));
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
    setTermMenuOpen(false);
    setModalOpen(false);
    exitPdfFullscreen();
    setHideDetails(false);
    setOpenTopics(() => {
      const collapsed: Record<string, boolean> = {};
      for (const sec of [...fmSections, ...thmSections, ...genSections]) {
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
  }, [fmSections, thmSections, genSections, exitPdfFullscreen, showToast]);

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
    const candidates =
      pool.length > 1 && activeFlashcard
        ? pool.filter((c) => c.id !== activeFlashcard.id)
        : pool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setActiveFlashcard(chosen);
    setModalMode('flashcard');
    setToolsOpen(false);
    setModalOpen(true);
  }, [filterSummary.topics, activeTabCards, activeFlashcard, showToast]);

  const handleExpandCollapseAll = useCallback(
    (expand: boolean) => {
      const targetSections = isGenSelected
        ? genSections
        : persisted.tab === 'fm'
        ? [...fmSections, ...genSections]
        : [...thmSections, ...genSections];
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
    [isGenSelected, persisted.tab, fmSections, thmSections, genSections, showToast]
  );

  const handleResetProgress = useCallback(() => {
    if (!window.confirm('Reset all learned and starred progress? This cannot be undone.')) return;
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
  const isZeroMatch =
    (persisted.tab !== 'prac' || isGenSelected) &&
    filterSummary.visibleCards === 0 &&
    genMatchedCardsCount === 0;

  // Automatically mark matching sections open in openTopics when deferred search query is active
  useEffect(() => {
    if (deferredTokens.length === 0) return;
    const activeSections = isGenSelected
      ? genSections
      : persisted.tab === 'fm'
      ? [...fmSections, ...genSections]
      : [...thmSections, ...genSections];
    const isThmTab = persisted.tab === 'thm' && !isGenSelected;
    setOpenTopics((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const section of activeSections) {
        const courseMatch =
          persisted.course === 'ALL' || section.course === persisted.course;
        if (!courseMatch) continue;
        const hasMatch = section.cards.some((card) => {
          const isLearned = Boolean(persisted.learned[card.id]);
          const isStarred = Boolean(persisted.starred[card.id]);
          const statusMatch =
            persisted.status === 'all'
              ? true
              : persisted.status === 'starred'
              ? isStarred
              : !isLearned;
          const thmMatch =
            isThmTab && section.course !== 'GEN'
              ? matchesTheoremCategoryFilter(card.badge, thmFilter)
              : isThmTab && thmFilter !== 'all'
              ? matchesTheoremCategoryFilter(card.badge, thmFilter)
              : true;
          const sIdx = searchIndexById.get(card.id) || '';
          return (
            statusMatch &&
            thmMatch &&
            matchesSearchTokens(sIdx, deferredTokens, card.title)
          );
        });
        if (hasMatch && !next[section.id]) {
          next[section.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    deferredTokens,
    isGenSelected,
    persisted.tab,
    persisted.course,
    persisted.status,
    persisted.learned,
    persisted.starred,
    thmFilter,
    fmSections,
    thmSections,
    genSections,
    searchIndexById,
  ]);

  const renderSectionAccordion = useCallback(
    (
      section: TopicSectionRecord,
      sectionOrder: number,
      isThmTab: boolean,
      isTabActive: boolean,
      keyPrefix = ''
    ) => {
      const courseMatch =
        persisted.course === 'ALL' || section.course === persisted.course;
      const hasActiveSearch = deferredTokens.length > 0;
      let learnedInTopic = 0;
      let visibleInTopic = 0;
      let maxSectionScore = 0;

      const cardVisibility = isTabActive
        ? section.cards.map((card, cardOrder) => {
            const isLearned = Boolean(persisted.learned[card.id]);
            const isStarred = Boolean(persisted.starred[card.id]);
            if (isLearned) learnedInTopic++;

            const statusMatch =
              persisted.status === 'all'
                ? true
                : persisted.status === 'starred'
                ? isStarred
                : section.course !== 'GEN' && !isLearned;
            const thmMatch =
              isThmTab && (section.course !== 'GEN' || thmFilter !== 'all')
                ? matchesTheoremCategoryFilter(card.badge, thmFilter)
                : true;
            const sIdx = searchIndexById.get(card.id) || '';
            const score = hasActiveSearch
              ? scoreFormulaCardSearch(card, deferredTokens, deferredQuery, sIdx)
              : matchesSearchTokens(sIdx, deferredTokens, card.title)
              ? 1
              : 0;
            const queryMatch = score > 0;
            const isVisible = courseMatch && statusMatch && thmMatch && queryMatch;
            if (isVisible) {
              visibleInTopic++;
              if (score > maxSectionScore) {
                maxSectionScore = score;
              }
            }
            return { card, isLearned, isStarred, isVisible, score, cardOrder };
          })
        : section.cards.map((card, cardOrder) => {
            const isLearned = Boolean(persisted.learned[card.id]);
            const isStarred = Boolean(persisted.starred[card.id]);
            if (isLearned) learnedInTopic++;
            return { card, isLearned, isStarred, isVisible: true, score: 1, cardOrder };
          });

      if (isTabActive && hasActiveSearch && visibleInTopic > 1) {
        cardVisibility.sort((a, b) => {
          if (a.isVisible !== b.isVisible) return a.isVisible ? -1 : 1;
          return b.score - a.score || a.cardOrder - b.cardOrder;
        });
      }

      if (!isTabActive) {
        visibleInTopic = section.cards.length;
      }

      const sectionHidden = visibleInTopic === 0;
      const isOpen = Boolean(openTopics[section.id]);
      const isIndexSelected = selectedTopicId === section.id;
      const domId = isTabActive ? section.id : `${keyPrefix}inactive-${section.id}`;

      const element = (
        <details
          key={`${keyPrefix}${section.id}`}
          id={domId}
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
              {section.course !== 'GEN' ? (
                <span className="fmcnt">
                  {learnedInTopic}/{section.cards.length} learned
                </span>
              ) : null}
            </span>
          </summary>
          <div className="fmgrid">
            {cardVisibility.map(({ card, isLearned, isStarred, isVisible }) => (
              <FormulaCardView
                key={`${keyPrefix}${card.id}`}
                card={card}
                isLearned={isLearned}
                isStarred={isStarred}
                isHidden={!isVisible}
                selfTest={Boolean(persisted.selfTest)}
                onToggleStar={handleToggleStar}
                onToggleLearned={handleToggleLearned}
                onCopyLatex={handleCopyLatex}
              />
            ))}
          </div>
        </details>
      );

      return {
        element,
        sectionHidden,
        maxSectionScore,
        sectionOrder,
      };
    },
    [
      persisted.course,
      persisted.status,
      persisted.learned,
      persisted.starred,
      persisted.selfTest,
      thmFilter,
      searchIndexById,
      deferredTokens,
      deferredQuery,
      openTopics,
      selectedTopicId,
      handleToggleTopic,
      handleToggleStar,
      handleToggleLearned,
      handleCopyLatex,
    ]
  );

  // Task 1.3: Append genSections to the bottom of both Formulas view (#fmroot) and Theorems view (#thmroot)
  // when persisted.course === 'ALL', and show genSections when isGenSelected is true regardless of active tab.
  const renderedFmSections = useMemo(() => {
    const isTabActive = persisted.tab === 'fm' || isGenSelected;
    const combinedSections = [...fmSections, ...genSections];
    const items = combinedSections.map((section, idx) =>
      renderSectionAccordion(section, idx, false, isTabActive, 'fm-')
    );
    if (isTabActive && deferredTokens.length > 0) {
      items.sort((a, b) => {
        if (a.sectionHidden !== b.sectionHidden) return a.sectionHidden ? 1 : -1;
        return b.maxSectionScore - a.maxSectionScore || a.sectionOrder - b.sectionOrder;
      });
    }
    return items.map((item) => item.element);
  }, [
    fmSections,
    genSections,
    renderSectionAccordion,
    persisted.tab,
    isGenSelected,
    deferredTokens,
  ]);

  const renderedThmSections = useMemo(() => {
    const isTabActive = persisted.tab === 'thm' && !isGenSelected;
    const combinedSections =
      persisted.course === 'ALL' ? [...thmSections, ...genSections] : thmSections;
    const items = combinedSections.map((section, idx) =>
      renderSectionAccordion(section, idx, true, isTabActive, 'thm-')
    );
    if (isTabActive && deferredTokens.length > 0) {
      items.sort((a, b) => {
        if (a.sectionHidden !== b.sectionHidden) return a.sectionHidden ? 1 : -1;
        return b.maxSectionScore - a.maxSectionScore || a.sectionOrder - b.sectionOrder;
      });
    }
    return items.map((item) => item.element);
  }, [
    thmSections,
    genSections,
    renderSectionAccordion,
    persisted.tab,
    persisted.course,
    isGenSelected,
    deferredTokens,
  ]);

  const hudTokens = useMemo(
    () => tokenizeSearchQuery(hudQuery),
    [hudQuery]
  );

  const topicTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const sec of allSections) {
      map.set(sec.id, sec.title);
    }
    return map;
  }, [allSections]);

  const hudCourseSections = useMemo(() => {
    const targetCourse = activePracticeModule?.course || 'M159';
    const base =
      hudScope === 'FM'
        ? [...fmSections, ...genSections]
        : hudScope === 'THM'
        ? thmSections
        : allSections;
    if (hudCourseScope === 'ALL') {
      return base;
    }
    const courseFiltered = base.filter((sec) => sec.course === targetCourse);
    // If the active practice module is Vector Calculus (m159-vector), order Vector Calculus topics first while keeping all M159 topics present
    if (activePracticeModule?.id === 'm159-vector') {
      const vecIds = new Set([
        'fm-m159-vec',
        'fm-m159-curves',
        'fm-m159-ops',
        'fm-m159-int',
        'fm-m159-thm',
        't-m1593',
      ]);
      const vecSecs = courseFiltered.filter((s) => vecIds.has(s.id));
      const otherSecs = courseFiltered.filter((s) => !vecIds.has(s.id));
      return [...vecSecs, ...otherSecs];
    }
    return courseFiltered;
  }, [activePracticeModule, hudScope, hudCourseScope, fmSections, thmSections, genSections, allSections]);

  const hudTotalCourseCardsCount = useMemo(
    () => hudCourseSections.reduce((acc, sec) => acc + sec.cards.length, 0),
    [hudCourseSections]
  );

  const peekedSection = useMemo(
    () => (peekTopicId ? allSections.find((sec) => sec.id === peekTopicId) || null : null),
    [peekTopicId, allSections]
  );

  // Fullscreen Practice HUD in-place search & topic peek across ALL Formulas, Theorems, and GEN (no artificial slice truncation)
  const hudDisplayedCards = useMemo(() => {
    const pool =
      hudScope === 'FM'
        ? [...fmCardsWithIndex, ...genCardsWithIndex]
        : hudScope === 'THM'
        ? thmCardsWithIndex
        : [...fmCardsWithIndex, ...thmCardsWithIndex, ...genCardsWithIndex];

    // When a search query is entered, always search across all cards in the pool
    if (hudTokens.length > 0) {
      const targetCourse = activePracticeModule?.course || 'M159';
      const scoredMatches: Array<{
        card: FormulaCardRecord;
        score: number;
        inTargetCourse: number;
        order: number;
      }> = [];
      for (let i = 0; i < pool.length; i++) {
        const { card, searchIndex } = pool[i];
        const score = scoreFormulaCardSearch(card, hudTokens, hudQuery, searchIndex);
        if (score > 0) {
          scoredMatches.push({
            card,
            score,
            inTargetCourse: card.course === targetCourse ? 1 : 0,
            order: i,
          });
        }
      }
      scoredMatches.sort(
        (a, b) =>
          b.score - a.score ||
          b.inTargetCourse - a.inTargetCourse ||
          a.order - b.order
      );
      return scoredMatches.map((item) => item.card);
    }

    if (peekedSection) {
      return peekedSection.cards;
    }

    return hudCourseSections.flatMap((sec) => sec.cards);
  }, [
    peekedSection,
    hudScope,
    hudCourseSections,
    fmCardsWithIndex,
    thmCardsWithIndex,
    genCardsWithIndex,
    hudTokens,
    hudQuery,
    activePracticeModule,
  ]);

  // Reset windowed HUD render batch and scroll position when scope, topic, or search query changes
  useEffect(() => {
    setHudRenderLimit(12);
    if (fsHudResultsRef.current) {
      fsHudResultsRef.current.scrollTop = 0;
    }
  }, [hudQuery, hudScope, hudCourseScope, peekTopicId, activePracticeModule]);

  const hudVisibleCards = useMemo(
    () => hudDisplayedCards.slice(0, hudRenderLimit),
    [hudDisplayedCards, hudRenderLimit]
  );

  const bringPinnedCardToFront = useCallback((cardId: string) => {
    topPinZIndexRef.current += 1;
    const nextZ = topPinZIndexRef.current;
    setPinnedLayouts((prev) => {
      const existing = prev[cardId];
      if (!existing) return prev;
      return {
        ...prev,
        [cardId]: {
          ...existing,
          zIndex: nextZ,
        },
      };
    });
  }, []);

  const handlePinCard = useCallback(
    (card: FormulaCardRecord) => {
      setPinnedCards((prev) => {
        const without = prev.filter((c) => c.id !== card.id);
        const nextList = [card, ...without].slice(0, 4);
        setPinnedLayouts((prevLayouts) => {
          if (prevLayouts[card.id]) {
            topPinZIndexRef.current += 1;
            return {
              ...prevLayouts,
              [card.id]: {
                ...prevLayouts[card.id],
                zIndex: topPinZIndexRef.current,
              },
            };
          }
          const idx = Object.keys(prevLayouts).length;
          topPinZIndexRef.current += 1;
          const initial = createInitialPinnedLayout(
            idx,
            window.innerWidth,
            window.innerHeight
          );
          return {
            ...prevLayouts,
            [card.id]: {
              ...initial,
              zIndex: topPinZIndexRef.current,
            },
          };
        });
        return nextList;
      });
      setMinimizedPinnedIds((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });
      retractHud();
    },
    [retractHud]
  );

  const handleUnpinCard = useCallback((cardId: string) => {
    setPinnedCards((prev) => prev.filter((c) => c.id !== cardId));
    setMinimizedPinnedIds((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
    setPinnedLayouts((prev) => {
      const next = { ...prev };
      delete next[cardId];
      return next;
    });
  }, []);

  const handleToggleMinimizePin = useCallback((cardId: string) => {
    setPinnedLayouts((prev) => {
      const cur =
        prev[cardId] ??
        createInitialPinnedLayout(0, window.innerWidth, window.innerHeight);
      const currentMode = getPinnedCardSizeMode(
        cur.width,
        cur.height,
        Boolean(minimizedPinnedIds[cardId])
      );
      const nextIsFormulaOnly = currentMode !== 'formula-only';
      const targetW = nextIsFormulaOnly ? PINNED_MIN_WIDTH : PINNED_DEFAULT_WIDTH;
      const targetH = nextIsFormulaOnly ? PINNED_MIN_HEIGHT : PINNED_DEFAULT_HEIGHT;
      const clampedPos = clampPinnedCardPosition(
        cur.x,
        cur.y,
        targetW,
        targetH,
        window.innerWidth,
        window.innerHeight
      );
      topPinZIndexRef.current += 1;
      setMinimizedPinnedIds((prevMin) => ({
        ...prevMin,
        [cardId]: nextIsFormulaOnly,
      }));
      return {
        ...prev,
        [cardId]: {
          x: clampedPos.x,
          y: clampedPos.y,
          width: targetW,
          height: targetH,
          zIndex: topPinZIndexRef.current,
        },
      };
    });
  }, [minimizedPinnedIds]);

  const startDragPin = useCallback(
    (e: React.MouseEvent, cardId: string, layout: PinnedCardLayout) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();
      topPinZIndexRef.current += 1;
      const nextLayout = { ...layout, zIndex: topPinZIndexRef.current };
      setPinnedLayouts((prev) => ({ ...prev, [cardId]: nextLayout }));
      setPinInteraction({
        type: 'drag',
        cardId,
        startX: e.clientX,
        startY: e.clientY,
        startLayout: nextLayout,
      });
    },
    []
  );

  const startResizePin = useCallback(
    (
      e: React.MouseEvent,
      cardId: string,
      corner: ResizeCorner,
      layout: PinnedCardLayout
    ) => {
      e.preventDefault();
      e.stopPropagation();
      topPinZIndexRef.current += 1;
      const nextLayout = { ...layout, zIndex: topPinZIndexRef.current };
      setPinnedLayouts((prev) => ({ ...prev, [cardId]: nextLayout }));
      setMinimizedPinnedIds((prev) => {
        if (!prev[cardId]) return prev;
        const next = { ...prev };
        delete next[cardId];
        return next;
      });
      setPinInteraction({
        type: 'resize',
        cardId,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        startLayout: nextLayout,
      });
    },
    []
  );

  useEffect(() => {
    if (!pinInteraction) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - pinInteraction.startX;
      const dy = e.clientY - pinInteraction.startY;
      setPinnedLayouts((prev) => {
        const cur = prev[pinInteraction.cardId] ?? pinInteraction.startLayout;
        if (pinInteraction.type === 'drag') {
          const clamped = clampPinnedCardPosition(
            pinInteraction.startLayout.x + dx,
            pinInteraction.startLayout.y + dy,
            cur.width,
            cur.height,
            window.innerWidth,
            window.innerHeight
          );
          return {
            ...prev,
            [pinInteraction.cardId]: {
              ...cur,
              x: clamped.x,
              y: clamped.y,
            },
          };
        }
        const resized = computeCornerResizedLayout(
          pinInteraction.startLayout,
          pinInteraction.corner ?? 'se',
          dx,
          dy,
          window.innerWidth,
          window.innerHeight
        );
        return {
          ...prev,
          [pinInteraction.cardId]: resized,
        };
      });
    };
    const handleMouseUp = () => {
      setPinInteraction(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [pinInteraction]);

  const showSearchDropdown = searchFocused && searchInput.trim() === '';

  const fsHudOpen =
    isPdfFullscreen &&
    (fsHudPointerTop || fsHudHovered || fsSearchFocused || isResizingHud);

  return (
    <WorkspaceErrorBoundary fallbackLabel={CURRENT_TERM_CONFIG.brandTitle}>
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
              <div className="term-switcher-wrap" ref={termSwitcherWrapRef}>
                <button
                  type="button"
                  id="termSwitcherBtn"
                  className={`ntype-emblem${termMenuOpen ? ' active' : ''}`}
                  aria-label="Open BUET EEE Term Archive Switcher"
                  aria-expanded={termMenuOpen}
                  aria-haspopup="menu"
                  title="Switch BUET EEE Term Archive"
                  onClick={() => setTermMenuOpen((open) => !open)}
                >
                  {CURRENT_TERM_CONFIG.emblemText}
                </button>
                {termMenuOpen ? (
                  <div
                    className="term-archive-dropdown"
                    id="termArchiveDropdown"
                    role="menu"
                    aria-label="BUET EEE Term Archive"
                  >
                    <div className="term-archive-header">
                      <span className="sh-label">BUET EEE TERM ARCHIVE</span>
                      <span className="ntype-badge" style={{ color: 'var(--accent)', fontSize: '10px' }}>
                        {CURRENT_TERM_CONFIG.shortCode}
                      </span>
                    </div>
                    {Object.values(TERM_REGISTRY).map((termItem) => {
                      const isCurrentTerm = termItem.termId === CURRENT_TERM_CONFIG.termId;
                      const hasDeployedUrl = Boolean(termItem.deployedUrl);
                      const statusLabel = isCurrentTerm
                        ? '[ACTIVE]'
                        : hasDeployedUrl
                        ? '[OPEN ->]'
                        : '[SOON]';
                      const statusCls = isCurrentTerm
                        ? 'active'
                        : hasDeployedUrl
                        ? 'open'
                        : 'soon';

                      return (
                        <button
                          key={termItem.termId}
                          type="button"
                          role="menuitem"
                          data-term-id={termItem.termId}
                          className={`term-archive-item${isCurrentTerm ? ' active' : ''}`}
                          onClick={() => {
                            setTermMenuOpen(false);
                            if (isCurrentTerm) {
                              showToast(`${termItem.shortCode} // ACTIVE WORKSPACE`);
                            } else if (termItem.deployedUrl) {
                              window.location.href = termItem.deployedUrl;
                            } else {
                              showToast(
                                `${termItem.shortCode} CONFIG PRE-LOADED IN termConfig.ts`
                              );
                            }
                          }}
                        >
                          <div className="term-archive-meta">
                            <span className="term-archive-code">{termItem.shortCode}</span>
                            <span className="term-archive-desc">{termItem.archiveLabel}</span>
                          </div>
                          <span className={`term-status-badge ${statusCls}`}>
                            {statusLabel}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
              <a
                href="https://www.buet.ac.bd/web/#/"
                target="_blank"
                rel="noopener noreferrer"
                className="buet-ascii-link"
                id="buetAsciiLink"
                aria-label="Official BUET Website (buet.ac.bd)"
                title="Official BUET Website — https://www.buet.ac.bd/web/#/"
              >
                <pre
                  className="buet-ascii-art"
                  id="buetAsciiArt"
                  aria-hidden="true"
                >
                  {BUET_LOGO_ASCII_ART}
                </pre>
              </a>
              <div
                className="brand-titles"
                id="brandResetBtn"
                role="button"
                tabIndex={0}
                title="Return to Formulas (All Courses) and retract all sections"
                aria-label={`${CURRENT_TERM_CONFIG.brandTitle}: Return to Formulas for all courses and retract all sections`}
                onClick={handleBrandReset}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBrandReset();
                  }
                }}
              >
                <h1 className="brand-title">{CURRENT_TERM_CONFIG.brandTitle}</h1>
                <p className="brand-sub">{CURRENT_TERM_CONFIG.brandSubtitle}</p>
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
              <button
                type="button"
                className={`tab${persisted.tab === 'prac' ? ' active' : ''}`}
                id="tabPrac"
                role="tab"
                aria-selected={persisted.tab === 'prac'}
                aria-label="View Course Practice Modules and Fullscreen PDF Reader"
                onClick={() => handleTabChange('prac')}
              >
                <span>Practice</span>
                <span className="tn" id="cntPrac">
                  {TOTAL_PRACTICE_MODULES}
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
        <div className={`fmbar-inner${persisted.courseBarCollapsed ? ' merged-single-row' : ''}`}>
          <div className="course-selector-row course-bar">
            <button
              type="button"
              id="courseBarToggleBtn"
              className={`course-selector-toggle${persisted.courseBarCollapsed ? ' collapsed' : ''}`}
              aria-expanded={!persisted.courseBarCollapsed}
              aria-controls="fmchips"
              title={
                persisted.courseBarCollapsed
                  ? 'Expand Course Selector Bar'
                  : 'Collapse Course Selector into Single Bar'
              }
              onClick={handleToggleCourseBar}
            >
              {persisted.courseBarCollapsed
                ? `COURSE // ${activeCourseBadge} [+]`
                : 'COURSE SELECT [-]'}
            </button>
            <div
              id="fmchips"
              className="chip-group"
              role="toolbar"
              aria-label="Filter by Course"
              hidden={Boolean(persisted.courseBarCollapsed)}
            >
              {courseOptions.map((c) => (
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
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchInput.trim().length >= 2) {
                    recordSearchHistory(searchInput);
                    setSearchFocused(false);
                  }
                }}
                placeholder="Search formulas, theories or definitions"
                aria-label="Search formulas, theories or definitions (Press / or Ctrl+K to focus)"
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
                {(deferredTokens.length > 0 || persisted.status === 'starred') &&
                persisted.course === 'ALL'
                  ? `${filterSummary.visibleCards + genMatchedCardsCount} / ${
                      filterSummary.totalCardsInScope +
                      (genMatchedCardsCount > 0 ? genCardsWithIndex.length : 0)
                    }`
                  : `${filterSummary.visibleCards} / ${filterSummary.totalCardsInScope}`}
              </span>

              {showSearchDropdown ? (
                <div
                  className="search-history-dropdown"
                  role="listbox"
                  aria-label="Recent searches and quick shortcuts"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {(persisted.searchHistory?.length ?? 0) > 0 ? (
                    <>
                      <div className="sh-header">
                        <span className="sh-label">RECENT SEARCHES</span>
                        <button
                          type="button"
                          className="sh-clear-all"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={handleClearAllHistory}
                        >
                          [CLEAR ALL]
                        </button>
                      </div>
                      <div className="sh-list">
                        {(persisted.searchHistory || []).map((histItem) => (
                          <div key={histItem} className="sh-item">
                            <button
                              type="button"
                              className="sh-item-query"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSearchInput(histItem);
                                recordSearchHistory(histItem);
                                setSearchFocused(false);
                              }}
                            >
                              {histItem}
                            </button>
                            <button
                              type="button"
                              className="sh-item-del"
                              aria-label={`Remove ${histItem} from search history`}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleDeleteHistoryItem(histItem)}
                            >
                              [×]
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}

                  <div className="sh-shortcuts">
                    <span className="sh-label">QUICK SHORTCUTS:</span>
                    {QUICK_SHORTCUTS.map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        className="sh-shortcut-pill"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSearchInput(sc);
                          recordSearchHistory(sc);
                          setSearchFocused(false);
                        }}
                      >
                        {sc}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
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
                hidden={persisted.tab !== 'thm' || isGenSelected}
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
        className={`sidebar-backdrop${sidebarOpen ? ' open' : ''}`}
        id="sidebarBackdrop"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      <div
        className={`app-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}
        id="appLayout"
      >
        <aside
          className={`sidebar${sidebarOpen ? ' mobile-open' : ''}`}
          id="sidebar"
          aria-label="Topic Navigation"
        >
          <div className="focus-pill">
            <span className="focus-pill-tag">ACTIVE SCOPE</span>
            <strong id="focusPillText">
              {persisted.course === 'ALL' ? 'ALL COURSES' : activeCourseBadge}
            </strong>
            <button
              type="button"
              className="sb-close-btn sidebar-close-btn"
              id="sidebarCloseBtn"
              aria-label="Close Topic Index Sidebar"
              onClick={() => setSidebarOpen(false)}
            >
              [CLOSE]
            </button>
          </div>
          <nav
            className="fmnav"
            id="navF"
            hidden={persisted.tab !== 'fm' && !isGenSelected}
          >
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
          <nav
            className="fmnav"
            id="navT"
            hidden={persisted.tab !== 'thm' || isGenSelected}
          >
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
          <nav
            className="fmnav"
            id="navP"
            aria-label="Practice Modules Index"
            hidden={persisted.tab !== 'prac' || isGenSelected}
          >
            {PRACTICE_CATALOG.map((group) => {
              const rowHidden =
                persisted.course !== 'ALL' && group.course !== persisted.course;
              return (
                <div
                  key={group.course}
                  className={`fmnavrow${rowHidden ? ' hidden' : ''}`}
                  data-c={group.course}
                  hidden={rowHidden}
                >
                  <b>{group.badge}</b>
                  {group.modules.map((mod) => (
                    <a
                      key={mod.id}
                      href={`#prac-${mod.id}`}
                      data-mod-id={mod.id}
                      className={`fmlink${activePracticeModule?.id === mod.id ? ' active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedPracticeModuleId(mod.id);
                        if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
                          setSidebarOpen(false);
                        }
                      }}
                    >
                      <span>{mod.title}</span>
                      {mod.pdfUrl ? (
                        <span
                          className="ntype-badge"
                          style={{
                            marginLeft: '6px',
                            fontSize: '9.5px',
                            color: 'var(--success)',
                          }}
                        >
                          [PDF]
                        </span>
                      ) : null}
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
            <main id="fmroot" hidden={persisted.tab !== 'fm' && !isGenSelected}>
              {renderedFmSections}
            </main>
          </WorkspaceErrorBoundary>
          <WorkspaceErrorBoundary fallbackLabel="Theorem Workspace (#thmroot)">
            <main id="thmroot" hidden={persisted.tab !== 'thm' || isGenSelected}>
              {renderedThmSections}
            </main>
          </WorkspaceErrorBoundary>
          <WorkspaceErrorBoundary fallbackLabel="Practice Workspace (#pracroot)">
            <main
              id="pracroot"
              className="practice-workspace"
              hidden={persisted.tab !== 'prac' || isGenSelected}
            >
              {persisted.course !== 'ALL' && practiceModules.length > 0 ? (
                <div
                  className="practice-module-bar"
                  id="practiceModuleBar"
                  role="tablist"
                  aria-label="Course Practice Modules"
                >
                  {practiceModules.map((mod) => {
                    const isModActive = activePracticeModule?.id === mod.id;
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        role="tab"
                        aria-selected={isModActive}
                        data-mod-id={mod.id}
                        className={`practice-mod-btn${isModActive ? ' active' : ''}`}
                        onClick={() => setSelectedPracticeModuleId(mod.id)}
                      >
                        <span
                          className="ntype-badge"
                          style={{
                            color: isModActive ? '#ffffff' : 'var(--accent)',
                            fontSize: '10.5px',
                          }}
                        >
                          {mod.courseBadge}
                        </span>
                        <span>{mod.title}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {activePracticeModule ? (
                <div className="practice-slot-card" id="practiceSlotCard">
                  <div className="practice-slot-header">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <span className="ntype-badge">{activePracticeModule.courseBadge}</span>
                        <span className="thty">MODULE: {activePracticeModule.id.toUpperCase()}</span>
                      </div>
                      <h2 style={{ margin: '0 0 4px', fontSize: '18px' }}>
                        {activePracticeModule.title}
                      </h2>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {activePracticeModule.subtitle}
                      </p>
                    </div>
                  </div>

                  <div
                    ref={fullscreenWrapperRef}
                    id="practiceViewerShell"
                    className={`practice-viewer-shell${isPdfFullscreen ? ' is-fullscreen' : ''}`}
                    onMouseMove={(e) => {
                      if (isPdfFullscreen && e.clientY <= 22) {
                        setFsHudPointerTop(true);
                      }
                    }}
                  >
                    {isPdfFullscreen ? (
                      <div
                        className="fs-top-hover-sensor"
                        id="fsTopHoverSensor"
                        aria-hidden="true"
                        onMouseEnter={() => setFsHudPointerTop(true)}
                      />
                    ) : null}

                    <div
                      className={`fs-search-hud${fsHudOpen ? ' open' : ''}${isResizingHud ? ' is-resizing' : ''}`}
                      id="fsSearchHud"
                      role="region"
                      aria-label="Fullscreen Quick-Glance Formula and Theorem Search HUD"
                      style={
                        hudHeightPx !== null
                          ? { height: `${hudHeightPx}px`, maxHeight: `${hudHeightPx}px` }
                          : undefined
                      }
                      onMouseEnter={() => setFsHudHovered(true)}
                      onMouseMove={() => setFsHudHovered(true)}
                      onMouseLeave={() => {
                        if (isResizingHud) return;
                        setFsHudHovered(false);
                        if (!fsSearchFocused) {
                          setFsHudPointerTop(false);
                        }
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span className="ntype-badge" style={{ color: 'var(--accent)' }}>
                            [:: QUICK-GLANCE HUD ::]
                          </span>
                          <div className="chip-group" role="group" aria-label="HUD Search Scope">
                            {(['ALL', 'FM', 'THM'] as const).map((scMode) => (
                              <button
                                key={scMode}
                                type="button"
                                className={`chip-btn${hudScope === scMode ? ' active' : ''}`}
                                data-hud-scope={scMode}
                                aria-pressed={hudScope === scMode}
                                onClick={() => setHudScope(scMode)}
                              >
                                {scMode === 'ALL'
                                  ? 'All'
                                  : scMode === 'FM'
                                  ? 'Formulas'
                                  : 'Theorems'}
                              </button>
                            ))}
                          </div>
                          {peekedSection ? (
                            <button
                              type="button"
                              id="btnBackToHudResults"
                              className="sb-btn"
                              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                              onClick={() => setPeekTopicId(null)}
                            >
                              [&lt;- BACK TO SEARCH RESULTS]
                            </button>
                          ) : null}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {QUICK_SHORTCUTS.map((sc) => (
                            <button
                              key={sc}
                              type="button"
                              className="sh-shortcut-pill"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setHudQuery(sc);
                                setPeekTopicId(null);
                                recordSearchHistory(sc);
                              }}
                            >
                              {sc}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="sb-btn"
                            onClick={retractHud}
                          >
                            [HIDE HUD]
                          </button>
                        </div>
                      </div>

                      <div
                        className={`search-wrap${hudQuery.trim().length > 0 ? ' has-query' : ''}`}
                        style={{ flex: '0 0 auto' }}
                      >
                        <label htmlFor="fsFmq" className="search-prefix">
                          [/]
                        </label>
                        <input
                          ref={fsSearchInputRef}
                          type="search"
                          id="fsFmq"
                          value={hudQuery}
                          onFocus={() => setFsSearchFocused(true)}
                          onBlur={() => setFsSearchFocused(false)}
                          onChange={(e) => {
                            setHudQuery(e.target.value);
                            if (peekTopicId) {
                              setPeekTopicId(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && hudQuery.trim().length >= 2) {
                              recordSearchHistory(hudQuery);
                            }
                          }}
                          placeholder="Search formulas, theories or definitions in-place..."
                          aria-label="Search formulas, theories or definitions in-place"
                          autoComplete="off"
                          spellCheck={false}
                          style={{
                            width: '100%',
                            height: '40px',
                            padding: '0 140px 0 46px',
                            borderRadius: '10px',
                            border: '1px solid var(--accent)',
                            background: 'rgba(8, 8, 12, 0.92)',
                            color: 'var(--text-primary)',
                            fontSize: '13.5px',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          className="search-clear-btn"
                          hidden={!hudQuery && !peekTopicId}
                          onClick={() => {
                            setHudQuery('');
                            setPeekTopicId(null);
                          }}
                        >
                          [CLR]
                        </button>
                        <span className="fmstat">
                          {hudDisplayedCards.length} SHOWN
                        </span>
                      </div>

                      <div className="fs-topic-toolbar">
                        <button
                          type="button"
                          className={`fm-hud-btn${hudCourseScope === 'ALL' ? ' on' : ''}`}
                          onClick={() => {
                            setHudCourseScope((prev) => (prev === 'COURSE' ? 'ALL' : 'COURSE'));
                            setPeekTopicId(null);
                          }}
                          title="Switch between current course topics and all courses"
                        >
                          {hudCourseScope === 'COURSE'
                            ? `[SCOPE: ${activePracticeModule.courseBadge} (${hudCourseSections.length} TOPICS)]`
                            : `[SCOPE: ALL COURSES (${hudCourseSections.length} TOPICS)]`}
                        </button>

                        <div className="fs-topic-scroll-btns">
                          <button
                            type="button"
                            className="fm-hud-btn"
                            aria-label="Scroll topic pills left"
                            onClick={() => {
                              fsTopicStripRef.current?.scrollBy({ left: -320, behavior: 'smooth' });
                            }}
                          >
                            [&lt;]
                          </button>
                          <button
                            type="button"
                            className="fm-hud-btn"
                            aria-label="Scroll topic pills right"
                            onClick={() => {
                              fsTopicStripRef.current?.scrollBy({ left: 320, behavior: 'smooth' });
                            }}
                          >
                            [&gt;]
                          </button>
                        </div>

                        <div
                          ref={fsTopicStripRef}
                          className="fs-topic-pills-strip"
                          role="toolbar"
                          aria-label="Course Topic Quick Peek Pills"
                          onWheel={(e) => {
                            if (e.deltaY !== 0) {
                              e.currentTarget.scrollLeft += e.deltaY;
                            }
                          }}
                        >
                          <button
                            type="button"
                            className={`fs-topic-pill${peekTopicId === null ? ' active' : ''}`}
                            data-peek-topic="ALL"
                            onClick={() => setPeekTopicId(null)}
                          >
                            All Topics ({hudTotalCourseCardsCount})
                          </button>
                          {hudCourseSections.map((sec) => (
                            <button
                              key={sec.id}
                              type="button"
                              className={`fs-topic-pill${peekTopicId === sec.id ? ' active' : ''}`}
                              data-peek-topic={sec.id}
                              onClick={() =>
                                setPeekTopicId((prev) => (prev === sec.id ? null : sec.id))
                              }
                            >
                              {hudCourseScope === 'ALL'
                                ? `[${sec.course}] ${sec.title} (${sec.cards.length})`
                                : `${sec.title} (${sec.cards.length})`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div
                        ref={fsHudResultsRef}
                        className="fs-hud-results"
                        onScroll={(e) => {
                          const el = e.currentTarget;
                          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
                            setHudRenderLimit((prev) =>
                              prev < hudDisplayedCards.length
                                ? Math.min(prev + 18, hudDisplayedCards.length)
                                : prev
                            );
                          }
                        }}
                      >
                        <div className="fmgrid">
                          {hudVisibleCards.map((card) => (
                            <FormulaCardView
                              key={`hud-${card.id}`}
                              card={card}
                              topicTitle={topicTitleById.get(card.topicId)}
                              isLearned={Boolean(persisted.learned[card.id])}
                              isStarred={Boolean(persisted.starred[card.id])}
                              isHidden={false}
                              selfTest={Boolean(persisted.selfTest)}
                              onToggleStar={handleToggleStar}
                              onToggleLearned={handleToggleLearned}
                              onCopyLatex={handleCopyLatex}
                              onPeekTopic={(tId) => setPeekTopicId(tId)}
                              onPinCard={handlePinCard}
                              isPinned={pinnedCards.some((p) => p.id === card.id)}
                            />
                          ))}
                        </div>
                        {hudVisibleCards.length < hudDisplayedCards.length ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                            <button
                              type="button"
                              className="fm-hud-btn"
                              onClick={() =>
                                setHudRenderLimit((prev) =>
                                  Math.min(prev + 24, hudDisplayedCards.length)
                                )
                              }
                            >
                              [LOAD MORE CARDS ({hudVisibleCards.length} / {hudDisplayedCards.length})]
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div
                        id="fsHudResizeHandle"
                        className={`fs-hud-resize-handle${isResizingHud ? ' active' : ''}`}
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label="Drag bottom edge to increase or decrease HUD height (double-click to reset)"
                        title="Drag bottom edge up/down to resize HUD · Double-click to reset height"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsResizingHud(true);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setHudHeightPx(null);
                        }}
                      >
                        <span className="fs-hud-resize-grip" aria-hidden="true" />
                      </div>
                    </div>

                    {pinnedCards.length > 0 ? (
                      <aside
                        className="fs-pinned-dock"
                        id="fsPinnedDock"
                        aria-label="Pinned Reference Cards"
                      >
                        {pinnedCards.map((pCard, pIdx) => {
                          const layout =
                            pinnedLayouts[pCard.id] ??
                            createInitialPinnedLayout(
                              pIdx,
                              typeof window !== 'undefined' ? window.innerWidth : 1440,
                              typeof window !== 'undefined' ? window.innerHeight : 900
                            );
                          const isMin = Boolean(minimizedPinnedIds[pCard.id]);
                          const sizeMode = getPinnedCardSizeMode(
                            layout.width,
                            layout.height,
                            isMin
                          );
                          const isInteractingThis =
                            pinInteraction?.cardId === pCard.id;
                          return (
                            <div
                              key={`pin-${pCard.id}`}
                              className={`fs-pinned-card mode-${sizeMode}${isInteractingThis ? ' is-interacting' : ''}`}
                              data-pinned-id={pCard.id}
                              data-size-mode={sizeMode}
                              onMouseDown={() => bringPinnedCardToFront(pCard.id)}
                              style={{
                                left: `${layout.x}px`,
                                top: `${layout.y}px`,
                                width: `${layout.width}px`,
                                height: `${layout.height}px`,
                                zIndex: layout.zIndex,
                              }}
                            >
                              {sizeMode !== 'formula-only' ? (
                                <div
                                  className="fs-pinned-header"
                                  onMouseDown={(e) => startDragPin(e, pCard.id, layout)}
                                  title="Drag to move pinned card"
                                >
                                  <div className="fs-pinned-title">
                                    <span
                                      className="ntype-badge"
                                      style={{ color: 'var(--accent)' }}
                                    >
                                      [{pCard.course}]
                                    </span>
                                    <SecondaryMathText
                                      className=""
                                      as="span"
                                      content={pCard.title}
                                    />
                                  </div>
                                  <div className="fs-pinned-actions">
                                    <button
                                      type="button"
                                      className="fm-hud-btn"
                                      aria-label={`Formula-only mode for ${pCard.title}`}
                                      title="Collapse to formula only"
                                      onClick={() => handleToggleMinimizePin(pCard.id)}
                                    >
                                      [_]
                                    </button>
                                    <button
                                      type="button"
                                      className="fm-hud-btn fm-unpin-btn"
                                      aria-label={`Unpin ${pCard.title}`}
                                      onClick={() => handleUnpinCard(pCard.id)}
                                    >
                                      [X]
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="fs-pinned-formula-only-actions">
                                  <button
                                    type="button"
                                    className="fm-hud-btn"
                                    aria-label={`Expand pinned card ${pCard.title}`}
                                    title="Expand to full card"
                                    onClick={() => handleToggleMinimizePin(pCard.id)}
                                  >
                                    [+]
                                  </button>
                                  <button
                                    type="button"
                                    className="fm-hud-btn fm-unpin-btn"
                                    aria-label={`Unpin ${pCard.title}`}
                                    onClick={() => handleUnpinCard(pCard.id)}
                                  >
                                    [X]
                                  </button>
                                </div>
                              )}

                              <div
                                className="fs-pinned-body"
                                onMouseDown={
                                  sizeMode === 'formula-only'
                                    ? (e) => startDragPin(e, pCard.id, layout)
                                    : undefined
                                }
                                title={
                                  sizeMode === 'formula-only'
                                    ? `${pCard.title} — Drag to move or drag corner to resize`
                                    : undefined
                                }
                              >
                                {pCard.htmlContent ? (
                                  <SecondaryMathText
                                    className="fmhtml"
                                    content={pCard.htmlContent}
                                  />
                                ) : null}
                                {pCard.rawLatex ? (
                                  <KatexMathBlock
                                    latex={pCard.rawLatex}
                                    displayMode={pCard.fmmDisplayMode ?? true}
                                  />
                                ) : null}
                                {pCard.codeContent ? (
                                  <pre className="fmcode">
                                    <code>{pCard.codeContent}</code>
                                  </pre>
                                ) : null}

                                {sizeMode === 'full' ? (
                                  <>
                                    {pCard.bodyText ? (
                                      <SecondaryMathText
                                        className="fmw"
                                        content={pCard.bodyText}
                                      />
                                    ) : null}
                                    {pCard.useText ? (
                                      <SecondaryMathText
                                        className="fmu"
                                        content={pCard.useText}
                                      />
                                    ) : null}
                                    {pCard.note ? (
                                      <SecondaryMathText
                                        className="fmnote"
                                        content={pCard.note}
                                      />
                                    ) : null}
                                    {pCard.seeAlso ? (
                                      <SecondaryMathText
                                        className="thsee"
                                        content={pCard.seeAlso}
                                      />
                                    ) : null}
                                    {pCard.steps && pCard.steps.length > 0 ? (
                                      <details className="fmd" open style={{ marginTop: '4px' }}>
                                        <summary>
                                          <SecondaryMathText
                                            as="span"
                                            className=""
                                            content={
                                              pCard.stepsSummary ||
                                              'Proof & derivation steps'
                                            }
                                          />
                                        </summary>
                                        <ol className="fmsteps">
                                          {pCard.steps.map((stepHtml, sIdx) => (
                                            <SecondaryMathText
                                              key={`${pCard.id}-pin-step-${sIdx}`}
                                              as="li"
                                              className=""
                                              content={stepHtml}
                                            />
                                          ))}
                                        </ol>
                                      </details>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>

                              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                                <div
                                  key={corner}
                                  className={`fs-pin-resize-corner corner-${corner}`}
                                  data-corner={corner}
                                  role="separator"
                                  aria-label={`Resize ${pCard.title} from ${corner.toUpperCase()} corner`}
                                  title="Drag corner to resize card (shrink to formula only or expand to full card)"
                                  onMouseDown={(e) =>
                                    startResizePin(e, pCard.id, corner, layout)
                                  }
                                />
                              ))}
                            </div>
                          );
                        })}
                      </aside>
                    ) : null}

                    {activePracticeModule.pdfUrl ? (
                      <PdfCanvasReader
                        pdfUrl={activePracticeModule.pdfUrl}
                        title={activePracticeModule.title}
                        isFullscreen={isPdfFullscreen}
                        onToggleFullscreen={
                          isPdfFullscreen ? exitPdfFullscreen : enterPdfFullscreen
                        }
                        onStageClick={retractHud}
                        isHudOpen={fsHudOpen}
                        onToggleHud={() => {
                          if (fsHudOpen) {
                            retractHud();
                          } else {
                            setFsHudPointerTop(true);
                          }
                        }}
                      />
                    ) : (
                      <div
                        className="pdf-canvas-reader"
                        onClick={retractHud}
                      >
                        <div
                          className="pdf-canvas-stage"
                          style={{
                            padding: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <div
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '14px',
                              letterSpacing: '0.12em',
                              textTransform: 'uppercase',
                              color: 'var(--text-secondary)',
                              textAlign: 'center',
                            }}
                          >
                            Coming Soon
                          </div>
                        </div>

                        <div
                          className="pdf-floating-controls"
                          role="toolbar"
                          aria-label="Fullscreen Controls"
                        >
                          <span className="pdf-ctrl-label">[STAGE READY]</span>
                          <span className="pdf-ctrl-divider" aria-hidden="true" />
                          <button
                            type="button"
                            className="pdf-ctrl-btn pdf-fs-btn"
                            id="pdfFloatingFsBtn"
                            onClick={
                              isPdfFullscreen ? exitPdfFullscreen : enterPdfFullscreen
                            }
                          >
                            {isPdfFullscreen ? '[EXIT FULLSCREEN]' : '[FULLSCREEN]'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
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
              id="modalClose"
              aria-label="Close modal"
              onClick={() => setModalOpen(false)}
            >
              [X CLOSE]
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
                <SecondaryMathText
                  className=""
                  as="span"
                  content={activeFlashcard.title}
                />
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
