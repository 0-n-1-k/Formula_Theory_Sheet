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
  syncDocumentMetaForTerm,
} from './termConfig';
import {
  buildFormulaSearchIndex,
  matchesSearchTokens,
  matchesTheoremCategoryFilter,
  scoreFormulaCardSearch,
  tokenizeSearchQuery,
  type FormulaCardRecord,
  type TheoremCategoryFilter,
} from './utils/formulaSearch';
import { warmUpEmbeddingModel } from './utils/embeddingModel';
import {
  computeHybridCardScore,
  computeLexicalConfidence,
  getSearchDebugMode,
  MIN_SEMANTIC_SIMILARITY,
  rankBySemanticSimilarity,
  shouldUseSemanticRanking,
} from './utils/semanticSearch';
import {
  highlightCppCodeToHtml,
  highlightHtmlContent,
  prewarmCardsMathCache,
  renderLatexCached,
  renderTextWithMath,
} from './utils/mathParser';
import { extractValidExamTag } from './utils/titleCleaner';
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
  highlightTokens?: readonly string[];
}

export const KatexMathBlock = memo(function KatexMathBlock({
  latex,
  displayMode = true,
  highlightTokens,
}: KatexMathBlockProps) {
  const renderedHtml = useMemo(() => {
    const base = renderLatexCached(latex, displayMode);
    if (highlightTokens && highlightTokens.length > 0) {
      return highlightHtmlContent(base, highlightTokens);
    }
    return base;
  }, [latex, displayMode, highlightTokens]);

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
  highlightTokens?: readonly string[];
}

export const SecondaryMathText = memo(function SecondaryMathText({
  className,
  content,
  as: Tag = 'div',
  highlightTokens,
}: SecondaryMathTextProps) {
  const parsedHtml = useMemo(
    () => renderTextWithMath(content, highlightTokens),
    [content, highlightTokens]
  );
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

  return (
    <button
      type="button"
      className={`goal-toggle-btn${goalOpen ? ' active' : ' is-closed-live'}`}
      id="goalToggleBtn"
      aria-label="Toggle Study Progress and Exam Countdown Drawer"
      aria-expanded={goalOpen}
      onClick={onToggle}
    >
      {!goalOpen && parts ? (
        <span className="doomsday-btn-live">
          <span className="doomsday-tag">T-MINUS</span>
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
      ) : (
        <span className="ntype-badge">
          {goalOpen
            ? 'Adjust exam date'
            : parts
            ? `DOOMSDAY // ${parts.days}D ${parts.hrs}H`
            : 'Adjust exam date'}
        </span>
      )}
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
      <span id="cdt" className="is-static">
        <span className="doomsday-tag">STANDBY</span>
        <span>SET EXAM DATE TO ARM DOOMSDAY CLOCK</span>
      </span>
    );
  }

  return (
    <span id="cdt" className="is-static">
      <span className="doomsday-tag">{parts.prefix}</span>
      <span className="ntype-badge">
        {parts.days}D : {parts.hrs}H : {parts.mins}M : {parts.secs}S
      </span>
    </span>
  );
});

/**
 * Estimates vertical content length of a card for ascending layout sorting.
 */
function computeCardLengthScore(card: FormulaCardRecord): number {
  let score = 0;
  if (card.rawLatex) {
    score += card.rawLatex.length * 1.4;
    const envLines = (card.rawLatex.match(/\\\\/g) || []).length;
    score += envLines * 65;
  }
  if (card.htmlContent) {
    score += card.htmlContent.length * 1.1;
    const tableRows = (card.htmlContent.match(/<tr[\s>]/gi) || []).length;
    const listItems = (card.htmlContent.match(/<li[\s>]/gi) || []).length;
    score += tableRows * 80 + listItems * 45;
  }
  if (card.codeContent) {
    const codeLines = card.codeContent.split('\n').length;
    score += codeLines * 42 + card.codeContent.length * 0.5;
  }
  if (card.bodyText) score += card.bodyText.length * 0.65;
  if (card.useText) score += card.useText.length * 0.65;
  if (card.note) score += card.note.length * 0.75;
  if (card.steps && card.steps.length > 0) {
    score += 45 + card.steps.length * 18;
  }
  return Math.round(score);
}

/**
 * Determines whether a card spans the full two-column grid width.
 */
export function shouldCardSpanFullWidth(card: FormulaCardRecord): boolean {
  if (card.htmlContent) {
    if (/<table[\s>]/i.test(card.htmlContent)) {
      const rows = (card.htmlContent.match(/<tr[\s>]/gi) || []).length;
      const cols = (card.htmlContent.match(/<th[\s>]/gi) || []).length;
      if (rows >= 4 || cols >= 4 || card.htmlContent.length > 620) return true;
    }
    const listItems = (card.htmlContent.match(/<li[\s>]/gi) || []).length;
    const paragraphs = (card.htmlContent.match(/<p[\s>]/gi) || []).length;
    const breaks = (card.htmlContent.match(/<br[\s/>]/gi) || []).length;
    if (listItems >= 6 || paragraphs >= 4 || breaks >= 6 || card.htmlContent.length >= 600) {
      return true;
    }
  }
  if (card.codeContent) {
    const lines = card.codeContent.split('\n');
    const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
    if (lines.length >= 12 || maxLineLen >= 68) return true;
  }
  if (card.rawLatex && card.rawLatex.length > 290) {
    return true;
  }
  if (card.steps && card.steps.length >= 10) {
    return true;
  }
  return false;
}

/**
 * Extracts trailing parenthetical exam year / reference metadata from a card title
 * so the main card title stays crisp and scannable while the year appears as a badge.
 */
function splitCardTitleAndMeta(rawTitle: string): {
  mainTitle: string;
  metaTag: string | null;
} {
  const match = rawTitle.match(
    /^(.*?)\s*\(((?:19|20)\d{2}[^)]*)\)\s*$/i
  );
  if (match && match[1].trim().length > 0) {
    const validTag = extractValidExamTag(match[2].trim());
    if (validTag) {
      return {
        mainTitle: match[1].trim(),
        metaTag: validTag,
      };
    }
  }
  return { mainTitle: rawTitle, metaTag: null };
}

/**
 * Parses `Freq: 5/5` into a numeric 1..5 score for visual dot meters.
 */
function parseFreqScore(freqBadge?: string): number {
  if (!freqBadge) return 0;
  const m = freqBadge.match(/(\d)\s*\/\s*5/);
  return m ? Math.min(5, Math.max(0, Number(m[1]))) : 0;
}

export interface FormulaCardViewProps {
  card: FormulaCardRecord;
  cardIndex?: number;
  staggerIndex?: number;
  isWide?: boolean;
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
  highlightTokens?: readonly string[];
}

export const FormulaCardView = memo(function FormulaCardView({
  card,
  cardIndex,
  staggerIndex,
  isWide = false,
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
  highlightTokens,
}: FormulaCardViewProps) {
  const [isRevealed, setIsRevealed] = useState<boolean>(false);
  const [stepsOpen, setStepsOpen] = useState<boolean>(false);
  const copyPayload = card.copyText ?? (card.rawLatex || card.codeContent || card.title);
  const typeCls = card.cardTypeClass || 'tex';
  const hasHighlight = Boolean(highlightTokens && highlightTokens.length > 0);
  const activeHighlightTokens = hasHighlight ? highlightTokens : undefined;

  const { mainTitle, metaTag } = useMemo(() => {
    if (card.examTag) {
      return { mainTitle: card.title, metaTag: card.examTag };
    }
    return splitCardTitleAndMeta(card.title);
  }, [card.title, card.examTag]);

  useEffect(() => {
    if (!selfTest) {
      setIsRevealed(false);
    }
  }, [selfTest]);

  const htmlMultiColClass = useMemo(() => {
    if (!isWide || !card.htmlContent) {
      return 'fmhtml';
    }
    const len = card.htmlContent.length;
    const liCount = (card.htmlContent.match(/<li[\s>]/gi) || []).length;
    const pCount = (card.htmlContent.match(/<p[\s>]/gi) || []).length;
    const tblCount = (card.htmlContent.match(/<table[\s>]/gi) || []).length;
    const trCount = (card.htmlContent.match(/<tr[\s>]/gi) || []).length;
    const brCount = (card.htmlContent.match(/<br\s*\/?>/gi) || []).length;

    const shouldMultiCol =
      liCount >= 6 ||
      tblCount >= 2 ||
      (tblCount >= 1 && trCount >= 12) ||
      pCount >= 3 ||
      (len >= 1800 && brCount >= 5);

    if (!shouldMultiCol) {
      return 'fmhtml';
    }
    if (liCount >= 14 || (tblCount === 0 && len >= 2200)) {
      return 'fmhtml fmhtml-cols fmhtml-cols-3';
    }
    return 'fmhtml fmhtml-cols';
  }, [isWide, card.htmlContent]);

  const handleCardClick = useCallback(() => {
    if (selfTest || (typeof document !== 'undefined' && document.body.classList.contains('self-test'))) {
      setIsRevealed((prev) => !prev);
    }
  }, [selfTest]);

  return (
    <div
      className={`fmi ${typeCls}${isWide ? ' is-wide' : ''}${isStarred ? ' starred' : ''}${isLearned ? ' learned' : ''}${isRevealed ? ' revealed' : ''}${isHidden ? ' hidden' : ''}`}
      data-k={card.id}
      data-s={card.keywords}
      hidden={isHidden}
      style={
        staggerIndex !== undefined
          ? ({ '--card-stagger': staggerIndex } as React.CSSProperties)
          : undefined
      }
      onClick={handleCardClick}
    >
      <div className="fmh">
        <span className="fmn" title={card.fullTitle || card.title}>
          {cardIndex !== undefined ? (
            <span className="fm-idx-badge">
              #{String(cardIndex).padStart(2, '0')}
            </span>
          ) : null}
          <SecondaryMathText
            className="fmn-title-text"
            as="span"
            content={mainTitle}
            highlightTokens={activeHighlightTokens}
          />
          {metaTag ? (
            <span className="fm-year-tag" title={metaTag}>
              {metaTag}
            </span>
          ) : null}
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
          <SecondaryMathText
            className={htmlMultiColClass}
            content={card.htmlContent}
            highlightTokens={activeHighlightTokens}
          />
        ) : null}
        {card.rawLatex ? (
          <KatexMathBlock
            latex={card.rawLatex}
            displayMode={card.fmmDisplayMode ?? true}
            highlightTokens={activeHighlightTokens}
          />
        ) : null}
        {card.codeContent ? (
          <pre className="fmcode">
            <code
              dangerouslySetInnerHTML={{
                __html: highlightCppCodeToHtml(card.codeContent, activeHighlightTokens),
              }}
            />
          </pre>
        ) : null}
        {card.note ? (
          <SecondaryMathText
            className="fmnote"
            content={card.note}
            highlightTokens={activeHighlightTokens}
          />
        ) : null}
        {card.seeAlso ? (
          <SecondaryMathText
            className="thsee"
            content={card.seeAlso}
            highlightTokens={activeHighlightTokens}
          />
        ) : null}
        {card.steps && card.steps.length > 0 ? (
          <details className={`fmd${stepsOpen ? ' is-open' : ''}`} open>
            <summary
              aria-expanded={stepsOpen}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStepsOpen((prev) => !prev);
              }}
            >
              <SecondaryMathText
                as="span"
                className=""
                content={card.stepsSummary || 'Proof & derivation steps'}
                highlightTokens={activeHighlightTokens}
              />
            </summary>
            <div className={`fmd-collapse${stepsOpen ? ' is-open' : ''}`} aria-hidden={!stepsOpen}>
              <div className="fmd-collapse-inner">
                <ol className="fmsteps">
                  {card.steps.map((step, idx) => (
                    <SecondaryMathText
                      key={idx}
                      as="li"
                      className=""
                      content={step}
                      highlightTokens={activeHighlightTokens}
                    />
                  ))}
                </ol>
              </div>
            </div>
          </details>
        ) : null}
        {card.bodyText || card.useText ? (
          <div className="fmdet">
            {card.bodyText ? (
              <div className="fm-spec-pod fmw-pod">
                <span className="fm-spec-label">PARAMETERS // CONTEXT</span>
                <SecondaryMathText
                  className="fmw"
                  content={card.bodyText}
                  highlightTokens={activeHighlightTokens}
                />
              </div>
            ) : null}
            {card.useText ? (
              <div className="fm-spec-pod fmu-pod">
                <span className="fm-spec-label">APPLICATION // STRATEGY</span>
                <SecondaryMathText
                  className="fmu"
                  content={card.useText}
                  highlightTokens={activeHighlightTokens}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export function computeGridRowLayout(
  items: ReadonlyArray<{ card: FormulaCardRecord; isWide: boolean }>
): {
  promotedWideIds: Set<string>;
} {
  const promotedWideIds = new Set<string>();

  let pendingLeftId: string | null = null;
  for (const item of items) {
    if (item.isWide) {
      if (pendingLeftId !== null) {
        promotedWideIds.add(pendingLeftId);
        pendingLeftId = null;
      }
    } else {
      if (pendingLeftId === null) {
        pendingLeftId = item.card.id;
      } else {
        pendingLeftId = null;
      }
    }
  }
  if (pendingLeftId !== null && items.length > 1) {
    promotedWideIds.add(pendingLeftId);
  }

  return { promotedWideIds };
}

export interface VisibleSectionCardItem {
  card: FormulaCardRecord;
  isLearned: boolean;
  isStarred: boolean;
  isVisible: boolean;
  score: number;
  cardOrder: number;
  lengthScore: number;
  isWide: boolean;
}

export interface TopicSectionAccordionProps {
  section: TopicSectionRecord;
  visibleCards: VisibleSectionCardItem[];
  learnedInTopic: number;
  sectionHidden: boolean;
  isOpen: boolean;
  isIndexSelected: boolean;
  domId: string;
  keyPrefix: string;
  selfTest: boolean;
  highlightTokens?: readonly string[];
  onToggleTopic: (topicId: string) => void;
  onToggleStar: (id: string) => void;
  onToggleLearned: (id: string, checked: boolean) => void;
  onCopyLatex: (latex: string) => void;
}

export const TopicSectionAccordion = memo(function TopicSectionAccordion({
  section,
  visibleCards,
  learnedInTopic,
  sectionHidden,
  isOpen,
  isIndexSelected,
  domId,
  keyPrefix,
  selfTest,
  highlightTokens,
  onToggleTopic,
  onToggleStar,
  onToggleLearned,
  onCopyLatex,
}: TopicSectionAccordionProps) {
  const freqScore = useMemo(() => parseFreqScore(section.freqBadge), [section.freqBadge]);
  const totalCards = section.cards.length;
  const topicPct = totalCards > 0 ? Math.round((learnedInTopic / totalCards) * 100) : 0;

  const rowLayout = useMemo(() => computeGridRowLayout(visibleCards), [visibleCards]);

  return (
    <details
      id={domId}
      data-c={section.course}
      style={{ '--topic-pct': `${topicPct}%` } as React.CSSProperties}
      className={`fmt${isIndexSelected ? ' index-selected' : ''}${sectionHidden ? ' hidden' : ''}${freqScore === 5 ? ' is-high-yield' : ''}${topicPct === 100 ? ' is-mastered' : ''}`}
      open={isOpen}
      hidden={sectionHidden}
    >
      <summary
        onClick={(e) => {
          e.preventDefault();
          onToggleTopic(section.id);
        }}
      >
        <span className="fmtt">
          <span className="fmt-course-tag">{section.course}</span>
          <span className="fmt-title-text">{section.title}</span>
        </span>
        <span className="fmmeta">
          {section.freqBadge ? (
            <span
              className={`fmfreq freq-${freqScore}`}
              title="How often this topic appeared in the 2010–2025 papers"
            >
              {freqScore > 0 ? (
                <span className="freq-dots" aria-hidden="true">
                  {'●'.repeat(freqScore)}
                  {'○'.repeat(Math.max(0, 5 - freqScore))}
                </span>
              ) : null}
              <span className="freq-label">
                {section.freqBadge.replace(/^Freq:\s*/i, '')}
              </span>
            </span>
          ) : null}
          {section.course !== 'GEN' ? (
            <span className="fmcnt">
              <span className="fmcnt-bar" aria-hidden="true">
                <span
                  className="fmcnt-fill"
                  style={{ width: `${topicPct}%` }}
                />
              </span>
              <span className="fmcnt-text">
                {learnedInTopic}/{totalCards}
                {learnedInTopic > 0 ? ` (${topicPct}%)` : ''}
              </span>
            </span>
          ) : null}
        </span>
      </summary>
      {isOpen && !sectionHidden ? (
        <div className="fmgrid">
          {visibleCards.map(({ card, isLearned, isStarred, isWide }, idx) => {
            const effectiveIsWide = isWide || rowLayout.promotedWideIds.has(card.id);

            return (
              <FormulaCardView
                key={`${keyPrefix}${card.id}`}
                card={card}
                cardIndex={idx + 1}
                staggerIndex={idx < 8 ? idx : undefined}
                isWide={effectiveIsWide}
                isLearned={isLearned}
                isStarred={isStarred}
                isHidden={false}
                selfTest={selfTest}
                onToggleStar={onToggleStar}
                onToggleLearned={onToggleLearned}
                onCopyLatex={onCopyLatex}
                highlightTokens={highlightTokens}
              />
            );
          })}
        </div>
      ) : null}
    </details>
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
  const [searchInput, setSearchInput] = useState<string>('');
  const deferredQuery = useDeferredValue(searchInput);
  const [semanticResult, setSemanticResult] = useState<{
    query: string;
    scores: Map<string, number>;
  } | null>(null);
  const searchDebugMode = useMemo(() => getSearchDebugMode(), []);

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [thmFilter, setThmFilter] = useState<TheoremCategoryFilter>('all');
  const [toolsOpen, setToolsOpen] = useState<boolean>(false);
  const [termMenuOpen, setTermMenuOpen] = useState<boolean>(false);
  const [phoneTermOpen, setPhoneTermOpen] = useState<boolean>(false);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'flashcard' | 'io'>('io');
  const [activeFlashcard, setActiveFlashcard] = useState<FormulaCardRecord | null>(null);
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [toastMsg, setToastMsg] = useState<string>('');
  const [showTopBtn, setShowTopBtn] = useState<boolean>(false);
  const [indexDetached, setIndexDetached] = useState<boolean>(false);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [bentoOpen, setBentoOpen] = useState<boolean>(true);
  const [highYieldOnly, setHighYieldOnly] = useState<boolean>(false);

  const [searchFocused, setSearchFocused] = useState<boolean>(false);
  const [selectedPracticeModuleId, setSelectedPracticeModuleId] = useState<string>('m159-complex');
  const [isPdfFullscreen, setIsPdfFullscreen] = useState<boolean>(false);
  const [fsHudPointerTop, setFsHudPointerTop] = useState<boolean>(false);
  const [fsHudHovered, setFsHudHovered] = useState<boolean>(false);
  const [fsSearchFocused, setFsSearchFocused] = useState<boolean>(false);

  // Decoupled Fullscreen HUD state (never exits fullscreen or changes persisted.tab)
  const [hudQuery, setHudQuery] = useState<string>('');
  const deferredHudQuery = useDeferredValue(hudQuery);
  const [hudSemanticResult, setHudSemanticResult] = useState<{
    query: string;
    scores: Map<string, number>;
  } | null>(null);
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
      initial[sec.id] = sec.course === 'GEN' ? false : sec.isOpenByDefault;
    }
    return initial;
  });
  const [searchToggledTopics, setSearchToggledTopics] = useState<Record<string, boolean>>({});

  const topChromeRef = useRef<HTMLElement | null>(null);
  const fmbarRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const fsSearchInputRef = useRef<HTMLInputElement | null>(null);
  const fsSearchHudRef = useRef<HTMLDivElement | null>(null);
  const hudHeightRef = useRef<number | null>(null);
  const pinnedCardDomRefs = useRef<Record<string, HTMLDivElement | null>>({});
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
    const timer = window.setTimeout(() => {
      safeWriteStorage(
        STORAGE_KEY,
        persisted,
        undefined,
        courseOptions.map((c) => c.code)
      );
    }, 250);
    return () => window.clearTimeout(timer);
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
    document.body.classList.toggle('hide-details', Boolean(persisted.hideDetails));
  }, [persisted.hideDetails]);

  useEffect(() => {
    syncDocumentMetaForTerm(CURRENT_TERM_CONFIG);
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
      const y = window.scrollY;
      setShowTopBtn(y > 400);
      setIndexDetached(y > 200);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleNavDrawer = useCallback(() => {
    setSidebarOpen((open) => !open);
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

  // Handle dragging the bottom vertical edge of the Fullscreen HUD with rAF batching and single mouseup state commit
  useEffect(() => {
    if (!isResizingHud || typeof window === 'undefined') return;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    let rafId: number | null = null;
    let latestClientY: number | null = null;

    const applyHudHeightFrame = () => {
      rafId = null;
      if (latestClientY === null) return;
      const nextHeight = clampHudHeightPx(latestClientY, window.innerHeight);
      hudHeightRef.current = nextHeight;
      const hudEl = fsSearchHudRef.current;
      if (hudEl) {
        hudEl.style.height = `${nextHeight}px`;
        hudEl.style.maxHeight = `${nextHeight}px`;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      latestClientY = e.clientY;
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyHudHeightFrame);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      const finalHeight =
        latestClientY !== null
          ? clampHudHeightPx(latestClientY, window.innerHeight)
          : hudHeightRef.current ?? Math.round(window.innerHeight * 0.5);
      hudHeightRef.current = finalHeight;
      setHudHeightPx(finalHeight);
      const neededCards = Math.max(12, Math.ceil(finalHeight / 95) * 3);
      setHudRenderLimit((prev) => (prev < neededCards ? neededCards : prev));
      setIsResizingHud(false);
      const withinHud = e.clientY <= finalHeight + 16;
      setFsHudHovered(withinHud);
      setFsHudPointerTop(withinHud);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingHud]);

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

  // Pre-warm KaTeX cache across all cards in non-blocking idle slices so opening any topic is instantaneous
  useEffect(() => {
    const allCards = [
      ...fmCardsWithIndex.map((x) => x.card),
      ...thmCardsWithIndex.map((x) => x.card),
      ...genCardsWithIndex.map((x) => x.card),
    ];
    return prewarmCardsMathCache(allCards);
  }, [fmCardsWithIndex, thmCardsWithIndex, genCardsWithIndex]);

  // Pre-compute visual length score and full-width (`isWide`) flag once per card ID
  const cardLayoutMetaById = useMemo(() => {
    const map = new Map<string, { lengthScore: number; isWide: boolean }>();
    for (const item of [...fmCardsWithIndex, ...thmCardsWithIndex, ...genCardsWithIndex]) {
      map.set(item.card.id, {
        lengthScore: computeCardLengthScore(item.card),
        isWide: shouldCardSpanFullWidth(item.card),
      });
    }
    return map;
  }, [fmCardsWithIndex, thmCardsWithIndex, genCardsWithIndex]);

  // Pre-compute set of High-Yield (Freq: 5/5) topic section IDs
  const highYieldTopicIds = useMemo(() => {
    const set = new Set<string>();
    for (const sec of allSections) {
      if (parseFreqScore(sec.freqBadge) === 5) {
        set.add(sec.id);
      }
    }
    return set;
  }, [allSections]);

  // Per-course breakdown for the Bento Overview Command Deck
  const courseMasteryBreakdown = useMemo(() => {
    const allCourseCards = [...fmCardsWithIndex, ...thmCardsWithIndex].map((x) => x.card);
    return courseOptions
      .filter((c) => c.code !== 'ALL' && c.code !== 'GEN')
      .map((c) => {
        const cards = allCourseCards.filter((card) => card.course === c.code);
        const total = cards.length;
        let learned = 0;
        for (const card of cards) {
          if (persisted.learned[card.id]) learned++;
        }
        const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
        return {
          code: c.code,
          badge: c.badge,
          total,
          learned,
          pct,
        };
      });
  }, [courseOptions, fmCardsWithIndex, thmCardsWithIndex, persisted.learned]);

  const deferredTokens = useMemo(
    () => tokenizeSearchQuery(deferredQuery),
    [deferredQuery]
  );

  // Debounced semantic similarity scoring (180ms) with cancellation flag
  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed || searchDebugMode === 'lexical') {
      setSemanticResult(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      rankBySemanticSimilarity(trimmed)
        .then((scores) => {
          if (!cancelled) {
            setSemanticResult({ query: trimmed, scores });
          }
        })
        .catch(() => {});
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredQuery, searchDebugMode]);

  useEffect(() => {
    const trimmed = deferredHudQuery.trim();
    if (!trimmed || searchDebugMode === 'lexical') {
      setHudSemanticResult(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      rankBySemanticSimilarity(trimmed)
        .then((scores) => {
          if (!cancelled) {
            setHudSemanticResult({ query: trimmed, scores });
          }
        })
        .catch(() => {});
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferredHudQuery, searchDebugMode]);

  const semanticScores = useMemo(
    () =>
      semanticResult && semanticResult.query === deferredQuery.trim()
        ? semanticResult.scores
        : null,
    [semanticResult, deferredQuery]
  );

  const hudSemanticScores = useMemo(
    () =>
      hudSemanticResult && hudSemanticResult.query === deferredHudQuery.trim()
        ? hudSemanticResult.scores
        : null,
    [hudSemanticResult, deferredHudQuery]
  );

  const activeIndexedPool = useMemo(() => {
    if (isGenSelected) return genCardsWithIndex;
    if (persisted.tab === 'fm') return fmCardsWithIndex;
    if (persisted.tab === 'thm') return thmCardsWithIndex;
    return [...fmCardsWithIndex, ...thmCardsWithIndex];
  }, [isGenSelected, persisted.tab, fmCardsWithIndex, thmCardsWithIndex, genCardsWithIndex]);

  const bestTabLexicalConfidence = useMemo(() => {
    if (deferredTokens.length === 0) return 0;
    const isThmTab = persisted.tab === 'thm' && !isGenSelected;
    const combinedPool =
      !isGenSelected && persisted.course === 'ALL'
        ? [...activeIndexedPool, ...genCardsWithIndex]
        : activeIndexedPool;
    let bestRawScore = 0;
    for (const { card, searchIndex } of combinedPool) {
      const courseMatch =
        persisted.course === 'ALL' || card.course === persisted.course;
      const thmMatch =
        isThmTab && (card.course !== 'GEN' || thmFilter !== 'all')
          ? matchesTheoremCategoryFilter(card.badge, thmFilter)
          : true;
      if (!courseMatch || !thmMatch) continue;
      if (highYieldOnly && !highYieldTopicIds.has(card.topicId)) continue;
      const isLearned = Boolean(persisted.learned[card.id]);
      const isStarred = Boolean(persisted.starred[card.id]);
      const statusMatch =
        persisted.status === 'all'
          ? true
          : persisted.status === 'starred'
          ? isStarred
          : card.course !== 'GEN' && !isLearned;
      if (!statusMatch) continue;
      const lexScore = scoreFormulaCardSearch(
        card,
        deferredTokens,
        deferredQuery,
        searchIndex
      );
      if (lexScore > bestRawScore) {
        bestRawScore = lexScore;
      }
    }
    return computeLexicalConfidence(bestRawScore, deferredTokens);
  }, [
    deferredTokens,
    deferredQuery,
    persisted.tab,
    persisted.course,
    persisted.status,
    persisted.learned,
    persisted.starred,
    isGenSelected,
    thmFilter,
    highYieldOnly,
    highYieldTopicIds,
    activeIndexedPool,
    genCardsWithIndex,
  ]);

  const useTabSemantic = useMemo(
    () =>
      deferredTokens.length > 0 &&
      shouldUseSemanticRanking(
        bestTabLexicalConfidence,
        semanticScores,
        searchDebugMode
      ),
    [deferredTokens.length, bestTabLexicalConfidence, semanticScores, searchDebugMode]
  );

  const filterSummary = useMemo(() => {
    const isThmTab = persisted.tab === 'thm' && !isGenSelected;
    let totalCardsInScope = 0;
    let visibleCards = 0;
    let highYieldCountInScope = 0;
    let starredCountInScope = 0;
    const visibleIds: string[] = [];

    for (const { card, searchIndex } of activeIndexedPool) {
      const courseMatch = persisted.course === 'ALL' || card.course === persisted.course;
      const thmMatch = isThmTab ? matchesTheoremCategoryFilter(card.badge, thmFilter) : true;
      if (!courseMatch || !thmMatch) continue;

      const isHighYield = highYieldTopicIds.has(card.topicId);
      if (isHighYield) highYieldCountInScope++;

      const isLearned = Boolean(persisted.learned[card.id]);
      const isStarred = Boolean(persisted.starred[card.id]);
      if (isStarred) starredCountInScope++;

      if (highYieldOnly && !isHighYield) continue;

      totalCardsInScope++;
      const statusMatch =
        persisted.status === 'all'
          ? true
          : persisted.status === 'starred'
          ? isStarred
          : card.course !== 'GEN' && !isLearned;

      const queryMatch =
        deferredTokens.length === 0
          ? true
          : computeHybridCardScore(
              card.id,
              scoreFormulaCardSearch(card, deferredTokens, deferredQuery, searchIndex),
              semanticScores,
              useTabSemantic,
              MIN_SEMANTIC_SIMILARITY,
              searchIndex,
              deferredTokens
            ) > 0;

      if (statusMatch && queryMatch) {
        visibleCards++;
        visibleIds.push(card.id);
      }
    }

    return {
      totalCardsInScope,
      visibleCards,
      visibleIds,
      highYieldCountInScope,
      starredCountInScope,
    };
  }, [
    activeIndexedPool,
    persisted.course,
    persisted.status,
    persisted.learned,
    persisted.starred,
    persisted.tab,
    isGenSelected,
    thmFilter,
    deferredTokens,
    deferredQuery,
    useTabSemantic,
    semanticScores,
    highYieldOnly,
    highYieldTopicIds,
  ]);

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
      const queryMatch =
        deferredTokens.length === 0
          ? true
          : computeHybridCardScore(
              card.id,
              scoreFormulaCardSearch(card, deferredTokens, deferredQuery, searchIndex),
              semanticScores,
              useTabSemantic,
              MIN_SEMANTIC_SIMILARITY,
              searchIndex,
              deferredTokens
            ) > 0;
      if (statusMatch && queryMatch) {
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
    deferredQuery,
    useTabSemantic,
    semanticScores,
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

  const handleCourseChange = useCallback(
    (course: CourseCode) => {
      setPersisted((prev) => ({ ...prev, course }));
      if (course === 'GEN') {
        setOpenTopics((prev) => {
          const next = { ...prev };
          for (const sec of genSections) {
            next[sec.id] = true;
          }
          return next;
        });
      }
    },
    [genSections]
  );

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

  // Auto-hide dashboard upon searching
  useEffect(() => {
    if (searchInput.trim().length > 0) {
      setBentoOpen(false);
    }
  }, [searchInput]);

  // Clear temporary search accordion overrides when search query is cleared
  useEffect(() => {
    if (deferredTokens.length === 0) {
      setSearchToggledTopics((prev) =>
        Object.keys(prev).length > 0 ? {} : prev
      );
    }
  }, [deferredTokens.length]);

  const handleToggleTopic = useCallback(
    (topicId: string) => {
      if (deferredTokens.length > 0) {
        setSearchToggledTopics((prev) => ({
          ...prev,
          [topicId]: prev[topicId] !== undefined ? !prev[topicId] : false,
        }));
        return;
      }
      setOpenTopics((prev) => ({
        ...prev,
        [topicId]: !prev[topicId],
      }));
    },
    [deferredTokens.length]
  );

  const handleSelectTopicFromNav = useCallback((targetId: string, href: string) => {
    setSelectedTopicId(targetId);
    setOpenTopics((prev) => ({ ...prev, [targetId]: true }));
    setSidebarOpen(false);
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
    setBentoOpen(false);
    setThmFilter('all');
    setHighYieldOnly(false);
    setSearchInput('');
    setSearchToggledTopics({});
    setSelectedTopicId('');
    setToolsOpen(false);
    setTermMenuOpen(false);
    setModalOpen(false);
    exitPdfFullscreen();
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
    setPersisted((prev) => {
      const next = !prev.hideDetails;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('hide-details', next);
      }
      showToast(next ? 'DETAILS HIDDEN' : 'DETAILS VISIBLE');
      return { ...prev, hideDetails: next };
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
    const visibleSet = new Set(filterSummary.visibleIds);
    const pool = activeIndexedPool
      .map((item) => item.card)
      .filter((c) => visibleSet.has(c.id));
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
  }, [filterSummary.visibleIds, activeIndexedPool, activeFlashcard, showToast]);

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
      if (deferredTokens.length > 0) {
        setSearchToggledTopics(() => {
          const next: Record<string, boolean> = {};
          for (const sec of targetSections) {
            next[sec.id] = expand;
          }
          return next;
        });
      }
      setToolsOpen(false);
      showToast(expand ? 'ALL TOPICS EXPANDED' : 'ALL TOPICS COLLAPSED');
    },
    [isGenSelected, persisted.tab, fmSections, thmSections, genSections, deferredTokens.length, showToast]
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

  const computeSectionDescriptor = useCallback(
    (
      section: TopicSectionRecord,
      sectionOrder: number,
      isThmTab: boolean
    ) => {
      const courseMatch =
        persisted.course === 'ALL' || section.course === persisted.course;
      const highYieldMatch =
        !highYieldOnly || highYieldTopicIds.has(section.id);
      const hasActiveSearch = deferredTokens.length > 0;
      let learnedInTopic = 0;
      let visibleInTopic = 0;
      let maxSectionScore = 0;

      const cardVisibility: VisibleSectionCardItem[] = section.cards.map(
        (card, cardOrder) => {
          const isLearned = Boolean(persisted.learned[card.id]);
          const isStarred = Boolean(persisted.starred[card.id]);
          if (isLearned) learnedInTopic++;

          const layoutMeta = cardLayoutMetaById.get(card.id) || {
            lengthScore: 100,
            isWide: false,
          };

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
          const lexicalScore = hasActiveSearch
            ? scoreFormulaCardSearch(card, deferredTokens, deferredQuery, sIdx)
            : matchesSearchTokens(sIdx, deferredTokens, card.title)
            ? 1
            : 0;
          const score = hasActiveSearch
            ? computeHybridCardScore(
                card.id,
                lexicalScore,
                semanticScores,
                useTabSemantic,
                MIN_SEMANTIC_SIMILARITY,
                sIdx,
                deferredTokens
              )
            : lexicalScore;
          const queryMatch = score > 0;
          const isVisible =
            courseMatch && highYieldMatch && statusMatch && thmMatch && queryMatch;
          if (isVisible) {
            visibleInTopic++;
            if (score > maxSectionScore) {
              maxSectionScore = score;
            }
          }
          return {
            card,
            isLearned,
            isStarred,
            isVisible,
            score,
            cardOrder,
            lengthScore: layoutMeta.lengthScore,
            isWide: layoutMeta.isWide,
          };
        }
      );

      // Sort cards by search relevance when searching, or by ascending length in browse view
      if (visibleInTopic > 1) {
        if (hasActiveSearch) {
          cardVisibility.sort((a, b) => {
            if (a.isVisible !== b.isVisible) return a.isVisible ? -1 : 1;
            return (
              b.score - a.score ||
              a.lengthScore - b.lengthScore ||
              a.cardOrder - b.cardOrder
            );
          });
        } else {
          cardVisibility.sort((a, b) => {
            if (a.isVisible !== b.isVisible) return a.isVisible ? -1 : 1;
            const wideDiff = (a.isWide ? 1 : 0) - (b.isWide ? 1 : 0);
            if (wideDiff !== 0) return wideDiff;
            return (
              a.lengthScore - b.lengthScore || a.cardOrder - b.cardOrder
            );
          });
        }
      }

      const visibleCards = cardVisibility.filter((item) => item.isVisible);
      const sectionHidden = visibleInTopic === 0;

      return {
        section,
        visibleCards,
        learnedInTopic,
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
      thmFilter,
      searchIndexById,
      deferredTokens,
      deferredQuery,
      semanticScores,
      useTabSemantic,
      highYieldOnly,
      highYieldTopicIds,
      cardLayoutMetaById,
    ]
  );

  const computedFmSections = useMemo(() => {
    const isTabActive = persisted.tab === 'fm' || isGenSelected;
    if (!isTabActive) return [];
    const combinedSections = [...fmSections, ...genSections];
    const items = combinedSections.map((section, idx) =>
      computeSectionDescriptor(section, idx, false)
    );
    if (deferredTokens.length > 0) {
      items.sort((a, b) => {
        if (a.sectionHidden !== b.sectionHidden) return a.sectionHidden ? 1 : -1;
        return b.maxSectionScore - a.maxSectionScore || a.sectionOrder - b.sectionOrder;
      });
    }
    return items;
  }, [
    fmSections,
    genSections,
    computeSectionDescriptor,
    persisted.tab,
    isGenSelected,
    deferredTokens,
  ]);

  const computedThmSections = useMemo(() => {
    const isTabActive = persisted.tab === 'thm' && !isGenSelected;
    if (!isTabActive) return [];
    const combinedSections =
      persisted.course === 'ALL' ? [...thmSections, ...genSections] : thmSections;
    const items = combinedSections.map((section, idx) =>
      computeSectionDescriptor(section, idx, true)
    );
    if (deferredTokens.length > 0) {
      items.sort((a, b) => {
        if (a.sectionHidden !== b.sectionHidden) return a.sectionHidden ? 1 : -1;
        return b.maxSectionScore - a.maxSectionScore || a.sectionOrder - b.sectionOrder;
      });
    }
    return items;
  }, [
    thmSections,
    genSections,
    computeSectionDescriptor,
    persisted.tab,
    persisted.course,
    isGenSelected,
    deferredTokens,
  ]);

  const activeHighlightTokensForTab =
    deferredTokens.length > 0 ? deferredTokens : undefined;

  const totalMatchedCardsForSearch =
    filterSummary.visibleCards + genMatchedCardsCount;

  const renderedFmSections = useMemo(() => {
    if (computedFmSections.length === 0) return [];
    const hasActiveSearch = deferredTokens.length > 0;
    return computedFmSections.map((item, idx) => {
      const defaultSearchOpen =
        !item.sectionHidden && (totalMatchedCardsForSearch <= 60 || idx < 6);
      const isSectionOpen = hasActiveSearch
        ? !item.sectionHidden &&
          (searchToggledTopics[item.section.id] ?? defaultSearchOpen)
        : Boolean(openTopics[item.section.id]);

      return (
        <TopicSectionAccordion
          key={`fm-${item.section.id}`}
          section={item.section}
          visibleCards={item.visibleCards}
          learnedInTopic={item.learnedInTopic}
          sectionHidden={item.sectionHidden}
          isOpen={isSectionOpen}
          isIndexSelected={selectedTopicId === item.section.id}
          domId={item.section.id}
          keyPrefix="fm-"
          selfTest={Boolean(persisted.selfTest)}
          highlightTokens={activeHighlightTokensForTab}
          onToggleTopic={handleToggleTopic}
          onToggleStar={handleToggleStar}
          onToggleLearned={handleToggleLearned}
          onCopyLatex={handleCopyLatex}
        />
      );
    });
  }, [
    computedFmSections,
    deferredTokens.length,
    totalMatchedCardsForSearch,
    searchToggledTopics,
    openTopics,
    selectedTopicId,
    persisted.selfTest,
    activeHighlightTokensForTab,
    handleToggleTopic,
    handleToggleStar,
    handleToggleLearned,
    handleCopyLatex,
  ]);

  const renderedThmSections = useMemo(() => {
    if (computedThmSections.length === 0) return [];
    const hasActiveSearch = deferredTokens.length > 0;
    return computedThmSections.map((item, idx) => {
      const defaultSearchOpen =
        !item.sectionHidden && (totalMatchedCardsForSearch <= 60 || idx < 6);
      const isSectionOpen = hasActiveSearch
        ? !item.sectionHidden &&
          (searchToggledTopics[item.section.id] ?? defaultSearchOpen)
        : Boolean(openTopics[item.section.id]);

      return (
        <TopicSectionAccordion
          key={`thm-${item.section.id}`}
          section={item.section}
          visibleCards={item.visibleCards}
          learnedInTopic={item.learnedInTopic}
          sectionHidden={item.sectionHidden}
          isOpen={isSectionOpen}
          isIndexSelected={selectedTopicId === item.section.id}
          domId={item.section.id}
          keyPrefix="thm-"
          selfTest={Boolean(persisted.selfTest)}
          highlightTokens={activeHighlightTokensForTab}
          onToggleTopic={handleToggleTopic}
          onToggleStar={handleToggleStar}
          onToggleLearned={handleToggleLearned}
          onCopyLatex={handleCopyLatex}
        />
      );
    });
  }, [
    computedThmSections,
    deferredTokens.length,
    totalMatchedCardsForSearch,
    searchToggledTopics,
    openTopics,
    selectedTopicId,
    persisted.selfTest,
    activeHighlightTokensForTab,
    handleToggleTopic,
    handleToggleStar,
    handleToggleLearned,
    handleCopyLatex,
  ]);

  const hudTokens = useMemo(
    () => tokenizeSearchQuery(deferredHudQuery),
    [deferredHudQuery]
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
    const sortCardsShortToLong = (cards: FormulaCardRecord[]) =>
      cards
        .map((card, order) => {
          const meta = cardLayoutMetaById.get(card.id) || {
            lengthScore: 100,
            isWide: false,
          };
          return { card, order, lengthScore: meta.lengthScore, isWide: meta.isWide };
        })
        .sort((a, b) => {
          const wideDiff = (a.isWide ? 1 : 0) - (b.isWide ? 1 : 0);
          if (wideDiff !== 0) return wideDiff;
          return a.lengthScore - b.lengthScore || a.order - b.order;
        })
        .map((item) => item.card);

    const pool =
      hudScope === 'FM'
        ? [...fmCardsWithIndex, ...genCardsWithIndex]
        : hudScope === 'THM'
        ? thmCardsWithIndex
        : [...fmCardsWithIndex, ...thmCardsWithIndex, ...genCardsWithIndex];

    // If the user explicitly clicked [PEEK TOPIC] on a search result card or selected a topic pill, show that topic
    if (peekedSection) {
      return sortCardsShortToLong(peekedSection.cards);
    }

    // When a search query is entered, always search across all cards in the pool
    if (hudTokens.length > 0) {
      const targetCourse = activePracticeModule?.course || 'M159';
      let bestHudRawLexicalScore = 0;
      const lexByIndex = new Array<number>(pool.length);
      for (let i = 0; i < pool.length; i++) {
        const { card, searchIndex } = pool[i];
        const lex = scoreFormulaCardSearch(card, hudTokens, deferredHudQuery, searchIndex);
        lexByIndex[i] = lex;
        if (lex > bestHudRawLexicalScore) {
          bestHudRawLexicalScore = lex;
        }
      }
      const bestHudConfidence = computeLexicalConfidence(bestHudRawLexicalScore, hudTokens);
      const useHudSemantic = shouldUseSemanticRanking(
        bestHudConfidence,
        hudSemanticScores,
        searchDebugMode
      );

      const scoredMatches: Array<{
        card: FormulaCardRecord;
        score: number;
        inTargetCourse: number;
        lengthScore: number;
        order: number;
      }> = [];
      for (let i = 0; i < pool.length; i++) {
        const { card, searchIndex } = pool[i];
        const score = computeHybridCardScore(
          card.id,
          lexByIndex[i],
          hudSemanticScores,
          useHudSemantic,
          MIN_SEMANTIC_SIMILARITY,
          searchIndex,
          hudTokens
        );
        if (score > 0) {
          const meta = cardLayoutMetaById.get(card.id) || {
            lengthScore: 100,
            isWide: false,
          };
          scoredMatches.push({
            card,
            score,
            inTargetCourse: card.course === targetCourse ? 1 : 0,
            lengthScore: meta.lengthScore,
            order: i,
          });
        }
      }
      scoredMatches.sort(
        (a, b) =>
          b.score - a.score ||
          b.inTargetCourse - a.inTargetCourse ||
          a.lengthScore - b.lengthScore ||
          a.order - b.order
      );
      return scoredMatches.map((item) => item.card);
    }

    return hudCourseSections.flatMap((sec) => sortCardsShortToLong(sec.cards));
  }, [
    peekedSection,
    hudScope,
    hudCourseSections,
    fmCardsWithIndex,
    thmCardsWithIndex,
    genCardsWithIndex,
    hudTokens,
    deferredHudQuery,
    hudSemanticScores,
    searchDebugMode,
    activePracticeModule,
    cardLayoutMetaById,
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

  const hudRowLayout = useMemo(
    () =>
      computeGridRowLayout(
        hudVisibleCards.map((card) => ({
          card,
          isWide: Boolean(cardLayoutMetaById.get(card.id)?.isWide),
        }))
      ),
    [hudVisibleCards, cardLayoutMetaById]
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

  // Compositor-only rAF drag (translate3d) & corner resize (translate3d + scale) with single state commit on mouseup
  useEffect(() => {
    if (!pinInteraction || typeof window === 'undefined') return;
    const cardEl = pinnedCardDomRefs.current[pinInteraction.cardId] ?? null;
    let rafId: number | null = null;
    let latestClientX = pinInteraction.startX;
    let latestClientY = pinInteraction.startY;
    let latestLayout: PinnedCardLayout = pinInteraction.startLayout;

    const applyPinFrame = () => {
      rafId = null;
      const dx = latestClientX - pinInteraction.startX;
      const dy = latestClientY - pinInteraction.startY;

      if (pinInteraction.type === 'drag') {
        const clamped = clampPinnedCardPosition(
          pinInteraction.startLayout.x + dx,
          pinInteraction.startLayout.y + dy,
          pinInteraction.startLayout.width,
          pinInteraction.startLayout.height,
          window.innerWidth,
          window.innerHeight
        );
        latestLayout = {
          ...pinInteraction.startLayout,
          x: clamped.x,
          y: clamped.y,
        };
        if (cardEl) {
          cardEl.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0)`;
        }
        return;
      }

      const resized = computeCornerResizedLayout(
        pinInteraction.startLayout,
        pinInteraction.corner ?? 'se',
        dx,
        dy,
        window.innerWidth,
        window.innerHeight
      );
      latestLayout = resized;
      if (cardEl) {
        const scaleX =
          pinInteraction.startLayout.width > 0
            ? resized.width / pinInteraction.startLayout.width
            : 1;
        const scaleY =
          pinInteraction.startLayout.height > 0
            ? resized.height / pinInteraction.startLayout.height
            : 1;
        cardEl.style.transform = `translate3d(${resized.x}px, ${resized.y}px, 0) scale(${scaleX}, ${scaleY})`;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      latestClientX = e.clientX;
      latestClientY = e.clientY;
      if (rafId === null) {
        rafId = window.requestAnimationFrame(applyPinFrame);
      }
    };

    const handleMouseUp = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
        applyPinFrame();
      }
      if (cardEl) {
        cardEl.style.transform = `translate3d(${latestLayout.x}px, ${latestLayout.y}px, 0)`;
      }
      const committedLayout = latestLayout;
      setPinnedLayouts((prev) => ({
        ...prev,
        [pinInteraction.cardId]: committedLayout,
      }));
      setPinInteraction(null);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
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
              id="sbBtn"
              className={`sb-btn fm-index-trigger${sidebarOpen ? ' is-hidden' : ''}`}
              aria-label="Toggle Quick Index"
              aria-expanded={sidebarOpen}
              aria-hidden={sidebarOpen}
              tabIndex={sidebarOpen ? -1 : 0}
              onClick={toggleNavDrawer}
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
                <div
                  className={`term-archive-dropdown${termMenuOpen ? ' open' : ''}`}
                  id="termArchiveDropdown"
                  role="menu"
                  aria-label="BUET EEE Term Archive"
                  aria-hidden={!termMenuOpen}
                >
                  <div className="term-archive-header">
                    <span className="sh-label">BUET EEE TERM ARCHIVE</span>
                    <span className="ntype-badge" style={{ color: 'var(--accent)', fontSize: 'var(--fs-2xs)' }}>
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
            <div
              ref={toolsWrapRef}
              className={`tools-menu-wrap${toolsOpen ? ' open' : ''}`}
            >
              <button
                type="button"
                id="settingsBtn"
                className={`settings-icon-btn${toolsOpen ? ' active' : ''}`}
                aria-label="Open Settings Menu"
                aria-expanded={toolsOpen}
                title="Workspace Settings & Data"
                onClick={() => setToolsOpen((o) => !o)}
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              <div className={`tools-dropdown${toolsOpen ? ' open' : ''}`} role="menu">
                <div className="dropdown-sec-label">TOPIC ACCORDIONS</div>
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
                <div className="dropdown-sec-label">DISPLAY &amp; WORKSPACE</div>
                <button
                  type="button"
                  className={`dropdown-item${persisted.singleCol ? ' active' : ''}`}
                  role="menuitem"
                  onClick={handleToggleSingleCol}
                >
                  <span>Single-Column Wide Cards</span>
                  <span className="ntype-badge">{persisted.singleCol ? '1-COL' : '2-COL'}</span>
                </button>
                <button
                  type="button"
                  className={`dropdown-item${persisted.hideDetails ? ' active' : ''}`}
                  role="menuitem"
                  onClick={handleToggleHideDetails}
                >
                  <span>Hide Context &amp; Strategy Pods</span>
                  <span className="ntype-badge">{persisted.hideDetails ? 'ON' : 'OFF'}</span>
                </button>
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
                  className={`dropdown-item${persisted.courseBarCollapsed ? ' active' : ''}`}
                  role="menuitem"
                  onClick={handleToggleCourseBar}
                >
                  <span>Compact Course Header</span>
                  <span className="ntype-badge">{persisted.courseBarCollapsed ? 'ON' : 'OFF'}</span>
                </button>
                <div className="dropdown-divider" />
                <div className="dropdown-sec-label">DATA &amp; BACKUP</div>
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
                  <span>Reset All Progress</span>
                  <span className="ntype-badge">CLR</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div
          className={`goal-collapse-shell${persisted.goalOpen ? ' is-open' : ''}`}
          aria-hidden={!persisted.goalOpen}
        >
          <div className="goal-collapse-inner">
            <div className="goal">
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
          </div>
        </div>
      </header>

      <button
        type="button"
        id="sbDetachedTab"
        className={`sb-detached-tab${indexDetached && !isPdfFullscreen && !sidebarOpen ? ' visible' : ''}${sidebarOpen ? ' active' : ''}`}
        aria-label="Toggle Topic Index Sidebar"
        aria-expanded={sidebarOpen}
        title={sidebarOpen ? 'Hide Topic Index' : 'Pull out Topic Index'}
        onClick={toggleNavDrawer}
      >
        <span className="sb-detached-shape" aria-hidden="true">
          <svg viewBox="0 0 30 148" preserveAspectRatio="none" className="sb-detached-svg">
            <path
              d="M 0,0 L 24,18 Q 29,22 29,29 L 29,119 Q 29,126 24,130 L 0,148 Z"
              className="sb-detached-fill"
            />
            <path
              d="M 0.5,0 L 24,18 Q 28.5,22 28.5,29 L 28.5,119 Q 28.5,126 24,130 L 0.5,148"
              className="sb-detached-stroke"
            />
          </svg>
        </span>
        <span className="sb-detached-letters" aria-hidden="true">
          <span>I</span>
          <span>N</span>
          <span>D</span>
          <span>E</span>
          <span>X</span>
        </span>
        <span className="sb-detached-grip" aria-hidden="true" />
      </button>

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
              className={`chip-group${persisted.courseBarCollapsed ? ' is-collapsed' : ''}`}
              role="toolbar"
              aria-label="Filter by Course"
              aria-hidden={Boolean(persisted.courseBarCollapsed)}
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
                onFocus={() => {
                  setSearchFocused(true);
                  warmUpEmbeddingModel();
                }}
                onBlur={() => setSearchFocused(false)}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  setSearchInput(nextVal);
                  if (nextVal.trim().length > 0) {
                    setBentoOpen(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchInput.trim().length >= 2) {
                    recordSearchHistory(searchInput);
                    setSearchFocused(false);
                    setBentoOpen(false);
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

              <div
                className={`search-history-dropdown${showSearchDropdown ? ' open' : ''}`}
                role="listbox"
                aria-label="Recent searches and quick shortcuts"
                aria-hidden={!showSearchDropdown}
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
                              setBentoOpen(false);
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
                        setBentoOpen(false);
                      }}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="utility-pods">
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

          <div className="sidebar-phone-controls" aria-label="Mobile Term and Course Controls">
            <div className="sb-phone-brand-row">
              <a
                href="https://www.buet.ac.bd/web/#/"
                target="_blank"
                rel="noopener noreferrer"
                className="buet-ascii-link sb-phone-logo"
                aria-label="Official BUET Website (buet.ac.bd)"
                title="Official BUET Website — https://www.buet.ac.bd/web/#/"
              >
                <pre className="buet-ascii-art" aria-hidden="true">
                  {BUET_LOGO_ASCII_ART}
                </pre>
              </a>
              <button
                type="button"
                className={`ntype-emblem sb-phone-term-btn${phoneTermOpen ? ' active' : ''}`}
                aria-label="Toggle BUET EEE Term Archive in Index Menu"
                aria-expanded={phoneTermOpen}
                onClick={() => setPhoneTermOpen((prev) => !prev)}
              >
                <span>{CURRENT_TERM_CONFIG.emblemText}</span>
                <span className="sb-phone-term-caret">{phoneTermOpen ? '[-]' : '[+]'}</span>
              </button>
            </div>

            {phoneTermOpen ? (
              <div className="sb-phone-term-list" role="menu" aria-label="BUET EEE Term Archive">
                <div className="term-archive-header">
                  <span className="sh-label">BUET EEE TERM ARCHIVE</span>
                  <span className="ntype-badge" style={{ color: 'var(--accent)', fontSize: 'var(--fs-2xs)' }}>
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
                      className={`term-archive-item${isCurrentTerm ? ' active' : ''}`}
                      onClick={() => {
                        setPhoneTermOpen(false);
                        if (isCurrentTerm) {
                          showToast(`${termItem.shortCode} // ACTIVE WORKSPACE`);
                        } else if (termItem.deployedUrl) {
                          window.location.href = termItem.deployedUrl;
                        } else {
                          showToast(`${termItem.shortCode} CONFIG PRE-LOADED IN termConfig.ts`);
                        }
                      }}
                    >
                      <div className="term-archive-meta">
                        <span className="term-archive-code">{termItem.shortCode}</span>
                        <span className="term-archive-desc">{termItem.archiveLabel}</span>
                      </div>
                      <span className={`term-status-badge ${statusCls}`}>{statusLabel}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="sb-phone-courses" role="group" aria-label="Course Select Menu">
              <div className="sb-phone-sec-head">
                <span className="sh-label">COURSE SELECT</span>
                <span className="sb-phone-sec-val">{activeCourseBadge}</span>
              </div>
              <div className="sb-phone-course-grid">
                {courseOptions.map((c) => {
                  const isActive = persisted.course === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      className={`sb-phone-course-btn${isActive ? ' active' : ''}${c.code === 'ALL' ? ' is-all' : ''}`}
                      aria-pressed={isActive}
                      onClick={() => handleCourseChange(c.code)}
                    >
                      <span className="sb-phone-course-code">{c.badge}</span>
                      <span className="sb-phone-course-name">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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
                            fontSize: 'var(--fs-2xs)',
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
          {persisted.tab !== 'prac' ? (
            <section
              id="commandDeck"
              className={`command-deck${bentoOpen ? ' is-open' : ' is-collapsed'}`}
              data-course={persisted.course}
              aria-label="Study Overview Command Deck"
            >
              <div
                className="command-deck-header"
                role="button"
                tabIndex={0}
                aria-expanded={bentoOpen}
                onClick={() => setBentoOpen((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setBentoOpen((prev) => !prev);
                  }
                }}
              >
                <div className="command-deck-title-group">
                  <span className="command-deck-led" aria-hidden="true" />
                  <span className="command-deck-eyebrow">DASHBOARD</span>
                  <span className="command-deck-scope">
                    {persisted.course === 'ALL' ? 'ALL COURSES' : activeCourseBadge}
                  </span>
                </div>

                <div className="command-deck-Telemetry-right">
                  {highYieldOnly ? (
                    <button
                      type="button"
                      className="deck-active-pill high-yield"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHighYieldOnly(false);
                      }}
                      title="Clear 5/5 High-Yield filter"
                    >
                      5/5 HIGH-YIELD ×
                    </button>
                  ) : null}
                  {persisted.status !== 'all' ? (
                    <button
                      type="button"
                      className="deck-active-pill status-pill"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusChange('all');
                      }}
                      title="Reset status filter to All"
                    >
                      {persisted.status.toUpperCase()} ×
                    </button>
                  ) : null}

                  <div className="command-deck-inline-progress" aria-hidden="true">
                    <div className="command-deck-inline-bar">
                      <div
                        className="command-deck-inline-fill"
                        style={{ width: `${masteryStats.pct}%` }}
                      />
                    </div>
                    <span className="command-deck-inline-Label">
                      {masteryStats.learnedCount}/{masteryStats.totalCount} ({masteryStats.pct}%)
                    </span>
                  </div>

                  <span className="command-deck-chevron" aria-hidden="true" />
                </div>
              </div>

              <div
                className={`command-deck-collapse${bentoOpen ? ' is-open' : ''}`}
                aria-hidden={!bentoOpen}
              >
                <div className="command-deck-collapse-inner">
                  <div className="command-deck-grid">
                    <div className="deck-tile bento-mastery-pod">
                      <div className="bento-kpi-row">
                        <div className="bento-kpi-main">
                          <span className="bento-kpi-num">{masteryStats.pct}%</span>
                          <span className="bento-kpi-sub">
                            {masteryStats.learnedCount} of {masteryStats.totalCount} mastered
                          </span>
                        </div>
                        <div className="bento-kpi-meter" aria-hidden="true">
                          <div
                            className="bento-kpi-fill"
                            style={{ width: `${masteryStats.pct}%` }}
                          />
                        </div>
                        <span className="bento-scope-chip">
                          {filterSummary.visibleCards} CARDS IN VIEW
                        </span>
                      </div>
                      <div
                        className="bento-course-matrix"
                        role="group"
                        aria-label="Quick Course Filter Matrix"
                      >
                        {courseMasteryBreakdown.map((item) => {
                          const isSelected = persisted.course === item.code;
                          return (
                            <button
                              key={item.code}
                              type="button"
                              data-c={item.code}
                              className={`bento-course-cell${isSelected ? ' active' : ''}`}
                              title={`Filter by ${item.badge} (${item.learned}/${item.total} learned)`}
                              onClick={() =>
                                handleCourseChange(
                                  isSelected ? 'ALL' : (item.code as CourseCode)
                                )
                              }
                            >
                              <div className="bento-course-top">
                                <span className="bento-course-code">{item.code}</span>
                                <span className="bento-course-pct">{item.pct}%</span>
                              </div>
                              <div className="bento-course-bar">
                                <div
                                  className="bento-course-bar-fill"
                                  style={{ width: `${item.pct}%` }}
                                />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="deck-tile bento-radar-pod">
                      <div
                        className="bento-status-strip"
                        role="group"
                        aria-label="Filter by learning status"
                      >
                        {(['all', 'starred', 'unlearned'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            className={`bento-status-btn${persisted.status === st ? ' active' : ''}`}
                            data-status={st}
                            aria-pressed={persisted.status === st}
                            aria-label={`Filter status: ${st}`}
                            onClick={() => handleStatusChange(st)}
                          >
                            <span>{st.charAt(0).toUpperCase() + st.slice(1)}</span>
                            {st === 'starred' ? (
                              <span className="bento-chip-count">
                                {filterSummary.starredCountInScope}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                      <div className="bento-radar-actions">
                        <button
                          type="button"
                          className={`bento-action-chip high-yield${highYieldOnly ? ' active' : ''}`}
                          onClick={() => {
                            setHighYieldOnly((prev) => {
                              const next = !prev;
                              showToast(
                                next
                                  ? 'SHOWING 5/5 HIGH-YIELD EXAM TOPICS ONLY'
                                  : 'SHOWING ALL SYLLABUS TOPICS'
                              );
                              return next;
                            });
                          }}
                        >
                          <span className="bento-chip-label">
                            {highYieldOnly
                              ? '● 5/5 HIGH-YIELD TOPICS ACTIVE'
                              : '○ ISOLATE 5/5 HIGH-YIELD TOPICS'}
                          </span>
                          <span className="bento-chip-count">
                            {filterSummary.highYieldCountInScope}
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="deck-tile bento-launchpad-pod">
                      <div className="bento-launch-grid">
                        <button
                          type="button"
                          className={`bento-launch-btn${persisted.selfTest ? ' active' : ''}`}
                          onClick={handleToggleSelfTest}
                        >
                          <span className="bento-launch-title">Self-Test Blur</span>
                          <span className="bento-launch-meta">
                            {persisted.selfTest ? 'CLICK CARD TO REVEAL' : 'BLUR FORMULAS'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="bento-launch-btn"
                          onClick={pickRandomFlashcard}
                        >
                          <span className="bento-launch-title">Random Flashcard</span>
                          <span className="bento-launch-meta">TEST RECALL</span>
                        </button>
                        <button
                          type="button"
                          className={`bento-launch-btn${persisted.hideDetails ? ' active' : ''}`}
                          onClick={handleToggleHideDetails}
                        >
                          <span className="bento-launch-title">Formula-Only View</span>
                          <span className="bento-launch-meta">
                            {persisted.hideDetails ? 'CONTEXT HIDDEN' : 'COMPACT CARDS'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="bento-launch-btn"
                          onClick={() => handleExpandCollapseAll(false)}
                        >
                          <span className="bento-launch-title">Fold All Topics</span>
                          <span className="bento-launch-meta">CLEAN OVERVIEW</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {isZeroMatch ? (
            <div className="search-empty-state" role="status">
              <div className="ntype-badge">[:: 0 CARDS MATCH CURRENT FILTER ::]</div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--fs-base)' }}>
                No formulas or theorems matched your active search query or filter criteria.
              </p>
              <button
                type="button"
                className="sb-btn"
                onClick={() => {
                  setSearchInput('');
                  setHighYieldOnly(false);
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
                            fontSize: 'var(--fs-2xs)',
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
                      <h2 style={{ margin: '0 0 4px', fontSize: 'var(--fs-lg)' }}>
                        {activePracticeModule.title}
                      </h2>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 'var(--fs-base)' }}>
                        {activePracticeModule.subtitle}
                      </p>
                    </div>
                  </div>

                  <div
                    ref={fullscreenWrapperRef}
                    id="practiceViewerShell"
                    className={`practice-viewer-shell${isPdfFullscreen ? ' is-fullscreen' : ''}`}
                    onMouseMove={(e) => {
                      if (isPdfFullscreen && !fsHudPointerTop && e.clientY <= 22) {
                        setFsHudPointerTop(true);
                      }
                    }}
                  >
                    {isPdfFullscreen ? (
                      <div
                        className="fs-top-hover-sensor"
                        id="fsTopHoverSensor"
                        aria-hidden="true"
                        onMouseEnter={() => {
                          if (!fsHudPointerTop) setFsHudPointerTop(true);
                        }}
                      />
                    ) : null}

                    <div
                      ref={fsSearchHudRef}
                      className={`fs-search-hud${fsHudOpen ? ' open' : ''}${isResizingHud ? ' is-resizing' : ''}`}
                      id="fsSearchHud"
                      role="region"
                      aria-label="Fullscreen Quick-Glance Formula and Theorem Search HUD"
                      style={
                        hudHeightPx !== null
                          ? { height: `${hudHeightPx}px`, maxHeight: `${hudHeightPx}px` }
                          : undefined
                      }
                      onMouseEnter={() => {
                        if (!fsHudHovered) setFsHudHovered(true);
                      }}
                      onMouseMove={() => {
                        if (!fsHudHovered) setFsHudHovered(true);
                      }}
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
                          onFocus={() => {
                            setFsSearchFocused(true);
                            warmUpEmbeddingModel();
                          }}
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
                            fontSize: 'var(--fs-base)',
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
                          {hudVisibleCards.map((card, idx) => {
                            const rawWide = Boolean(cardLayoutMetaById.get(card.id)?.isWide);
                            const effectiveIsWide =
                              rawWide || hudRowLayout.promotedWideIds.has(card.id);

                            return (
                              <FormulaCardView
                                key={`hud-${card.id}`}
                                card={card}
                                cardIndex={idx + 1}
                                isWide={effectiveIsWide}
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
                                highlightTokens={hudTokens.length > 0 ? hudTokens : undefined}
                              />
                            );
                          })}
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
                          hudHeightRef.current = null;
                          if (fsSearchHudRef.current) {
                            fsSearchHudRef.current.style.height = '';
                            fsSearchHudRef.current.style.maxHeight = '';
                          }
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
                              ref={(el) => {
                                pinnedCardDomRefs.current[pCard.id] = el;
                              }}
                              className={`fs-pinned-card mode-${sizeMode}${isInteractingThis ? ' is-interacting' : ''}`}
                              data-pinned-id={pCard.id}
                              data-size-mode={sizeMode}
                              onMouseDown={() => bringPinnedCardToFront(pCard.id)}
                              style={{
                                left: 0,
                                top: 0,
                                width: `${layout.width}px`,
                                height: `${layout.height}px`,
                                transform: `translate3d(${layout.x}px, ${layout.y}px, 0)`,
                                transformOrigin: '0 0',
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
                                      highlightTokens={
                                        hudTokens.length > 0 ? hudTokens : undefined
                                      }
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
                                    highlightTokens={
                                      hudTokens.length > 0 ? hudTokens : undefined
                                    }
                                  />
                                ) : null}
                                {pCard.rawLatex ? (
                                  <KatexMathBlock
                                    latex={pCard.rawLatex}
                                    displayMode={pCard.fmmDisplayMode ?? true}
                                    highlightTokens={
                                      hudTokens.length > 0 ? hudTokens : undefined
                                    }
                                  />
                                ) : null}
                                {pCard.codeContent ? (
                                  <pre className="fmcode">
                                    <code
                                      dangerouslySetInnerHTML={{
                                        __html: highlightCppCodeToHtml(
                                          pCard.codeContent,
                                          hudTokens.length > 0 ? hudTokens : undefined
                                        ),
                                      }}
                                    />
                                  </pre>
                                ) : null}

                                {sizeMode === 'full' ? (
                                  <>
                                    {pCard.bodyText ? (
                                      <SecondaryMathText
                                        className="fmw"
                                        content={pCard.bodyText}
                                        highlightTokens={
                                          hudTokens.length > 0 ? hudTokens : undefined
                                        }
                                      />
                                    ) : null}
                                    {pCard.useText ? (
                                      <SecondaryMathText
                                        className="fmu"
                                        content={pCard.useText}
                                        highlightTokens={
                                          hudTokens.length > 0 ? hudTokens : undefined
                                        }
                                      />
                                    ) : null}
                                    {pCard.note ? (
                                      <SecondaryMathText
                                        className="fmnote"
                                        content={pCard.note}
                                        highlightTokens={
                                          hudTokens.length > 0 ? hudTokens : undefined
                                        }
                                      />
                                    ) : null}
                                    {pCard.seeAlso ? (
                                      <SecondaryMathText
                                        className="thsee"
                                        content={pCard.seeAlso}
                                        highlightTokens={
                                          hudTokens.length > 0 ? hudTokens : undefined
                                        }
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
                                            highlightTokens={
                                              hudTokens.length > 0 ? hudTokens : undefined
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
                                              highlightTokens={
                                                hudTokens.length > 0 ? hudTokens : undefined
                                              }
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
                              fontSize: 'var(--fs-base)',
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
        aria-hidden={!modalOpen}
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
                  fontSize: 'var(--fs-md)',
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
                  <code
                    dangerouslySetInnerHTML={{
                      __html: highlightCppCodeToHtml(activeFlashcard.codeContent),
                    }}
                  />
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
                  fontSize: 'var(--fs-sm)',
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
