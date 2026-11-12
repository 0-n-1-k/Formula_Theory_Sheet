import type { FormulaCardRecord } from './formulaSearch';
import { decodeHtmlEntities } from './mathParser';
import type { CourseCode } from './storageSafety';
import { cleanCardTitle } from './titleCleaner';

export interface TopicSectionRecord {
  id: string;
  course: CourseCode;
  title: string;
  freqBadge?: string;
  isOpenByDefault: boolean;
  cards: FormulaCardRecord[];
}

export interface NavLinkRecord {
  href: string;
  targetId: string;
  label: string;
}

export interface NavCourseGroupRecord {
  course: CourseCode;
  badgeText: string;
  links: NavLinkRecord[];
}

export interface ParsedNavContent {
  navF: NavCourseGroupRecord[];
  navT: NavCourseGroupRecord[];
}

/**
 * Extracts the inner HTML of `<div class="${className}">...</div>` while properly
 * balancing any nested `<div...>` / `</div>` pairs inside it.
 */
function extractBalancedDivContent(html: string, className: string): string | undefined {
  const startToken = `<div class="${className}">`;
  const startIdx = html.indexOf(startToken);
  if (startIdx === -1) return undefined;
  const contentStart = startIdx + startToken.length;
  let depth = 1;
  let i = contentStart;
  while (i < html.length && depth > 0) {
    const nextOpen = html.indexOf('<div', i);
    const nextClose = html.indexOf('</div>', i);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      const charAfter = html[nextOpen + 4];
      if (charAfter === ' ' || charAfter === '>' || charAfter === '\t' || charAfter === '\n') {
        depth++;
      }
      i = nextOpen + 4;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(contentStart, nextClose).trim();
      }
      i = nextClose + 6;
    }
  }
  return undefined;
}

/**
 * Parses `<details class="fmt" ...>` topic accordions and `.fmi` cards from
 * `content-fmroot.html` or `content-thmroot.html` without losing any academic content.
 */
export function parseTopicSections(html: string): TopicSectionRecord[] {
  if (!html) return [];
  const rawSections = html.split('<details class="fmt"').slice(1);
  const sections: TopicSectionRecord[] = [];

  for (const rawSec of rawSections) {
    const openTagEnd = rawSec.indexOf('>');
    if (openTagEnd === -1) continue;
    const openTagAttrs = rawSec.slice(0, openTagEnd);
    const id = (openTagAttrs.match(/id="([^"]+)"/) || [])[1] || '';
    const course = ((openTagAttrs.match(/data-c="([^"]+)"/) || [])[1] || 'ALL') as CourseCode;
    const isOpenByDefault = /\bopen\b/.test(openTagAttrs);

    const summaryMatch = rawSec.match(/<summary>([\s\S]*?)<\/summary>/);
    const summaryHtml = summaryMatch ? summaryMatch[1] : '';
    const titleRaw = (summaryHtml.match(/<span class="fmtt">([\s\S]*?)<\/span>/) || [])[1] || '';
    const title = decodeHtmlEntities(titleRaw).trim();
    const freqRaw = (summaryHtml.match(/<span class="fmfreq"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
    const freqBadge = freqRaw ? decodeHtmlEntities(freqRaw).trim() : undefined;

    const rawCards = rawSec.split('<div class="fmi ').slice(1);
    const cards: FormulaCardRecord[] = [];

    for (const rawCard of rawCards) {
      const cardTagEnd = rawCard.indexOf('>');
      if (cardTagEnd === -1) continue;
      const cardAttrs = rawCard.slice(0, cardTagEnd);
      const cardTypeClass = (cardAttrs.match(/^([a-zA-Z0-9_-]+)/) || [])[1] || 'tex';
      const cardId = (cardAttrs.match(/data-k="([^"]+)"/) || [])[1] || '';
      const keywordsRaw = (cardAttrs.match(/data-s="([^"]*)"/) || [])[1] || '';
      const keywords = decodeHtmlEntities(keywordsRaw);

      const fmnRaw =
        (rawCard.match(/<span class="fmn">([\s\S]*?)<\/span>\s*<span class="fmb">/) || [])[1] || '';
      const badgeMatch = fmnRaw.match(/<span class="thty">([\s\S]*?)<\/span>/);
      const badge = badgeMatch ? decodeHtmlEntities(badgeMatch[1]).trim() : undefined;
      const rawCardTitle = decodeHtmlEntities(
        fmnRaw.replace(/<span class="thty">[\s\S]*?<\/span>/g, '')
      ).trim();
      const cleanedTitle = cleanCardTitle(rawCardTitle, cardId);

      const copyAttrMatch = rawCard.match(/data-t="([^"]*)"/);
      const copyText = copyAttrMatch
        ? decodeHtmlEntities(decodeHtmlEntities(copyAttrMatch[1]))
        : undefined;

      const bodyStartIdx = rawCard.indexOf('<div class="fmbody">');
      const bodyHtml = bodyStartIdx !== -1 ? rawCard.slice(bodyStartIdx) : '';

      const fmmInner = extractBalancedDivContent(bodyHtml, 'fmm');
      let rawLatex = '';
      let fmmDisplayMode = true;
      if (fmmInner !== undefined) {
        if (fmmInner.startsWith('$$') && fmmInner.endsWith('$$')) {
          rawLatex = decodeHtmlEntities(decodeHtmlEntities(fmmInner.slice(2, -2).trim()));
          fmmDisplayMode = true;
        } else if (fmmInner.startsWith('$') && fmmInner.endsWith('$')) {
          rawLatex = decodeHtmlEntities(decodeHtmlEntities(fmmInner.slice(1, -1).trim()));
          fmmDisplayMode = false;
        } else {
          rawLatex = decodeHtmlEntities(decodeHtmlEntities(fmmInner));
          fmmDisplayMode = true;
        }
      }

      const htmlContent = extractBalancedDivContent(bodyHtml, 'fmhtml');

      const codeMatch = bodyHtml.match(/<pre class="fmcode"><code>([\s\S]*?)<\/code><\/pre>/);
      const codeContent = codeMatch ? decodeHtmlEntities(codeMatch[1]) : undefined;

      const bodyText = extractBalancedDivContent(bodyHtml, 'fmw') ?? '';
      const useText = extractBalancedDivContent(bodyHtml, 'fmu');
      const note = extractBalancedDivContent(bodyHtml, 'fmnote');
      const seeAlso = extractBalancedDivContent(bodyHtml, 'thsee');

      const fmdMatch = bodyHtml.match(
        /<details class="fmd">\s*<summary>([\s\S]*?)<\/summary>\s*<ol class="fmsteps">([\s\S]*?)<\/ol>\s*<\/details>/
      );
      let stepsSummary: string | undefined;
      let steps: string[] | undefined;
      if (fmdMatch) {
        stepsSummary = decodeHtmlEntities(fmdMatch[1]).trim();
        const stepsListHtml = fmdMatch[2];
        const liMatches = [...stepsListHtml.matchAll(/<li>([\s\S]*?)<\/li>/g)];
        steps = liMatches.map((m) => m[1].trim());
      }

      cards.push({
        id: cardId,
        course,
        topicId: id,
        topicTitle: title,
        title: cleanedTitle.title,
        fullTitle: rawCardTitle,
        examTag: cleanedTitle.examTag,
        badge,
        cardTypeClass,
        copyText,
        keywords,
        rawLatex,
        fmmDisplayMode,
        htmlContent,
        codeContent,
        bodyText,
        useText,
        stepsSummary,
        steps,
        note,
        seeAlso,
      });
    }

    sections.push({
      id,
      course,
      title,
      freqBadge,
      isOpenByDefault,
      cards,
    });
  }

  return sections;
}

function parseSingleNavBlock(navBlockHtml: string): NavCourseGroupRecord[] {
  if (!navBlockHtml) return [];
  const rowMatches = [
    ...navBlockHtml.matchAll(/<div class="fmnavrow" data-c="([^"]+)">([\s\S]*?)<\/div>/g),
  ];
  return rowMatches.map((m) => {
    const course = m[1] as CourseCode;
    const inner = m[2];
    const badgeRaw = (inner.match(/<b>([\s\S]*?)<\/b>/) || [])[1] || course;
    const badgeText = decodeHtmlEntities(badgeRaw).trim();
    const linkMatches = [
      ...inner.matchAll(/<a href="([^"]+)" class="fmlink">([\s\S]*?)<\/a>/g),
    ];
    const links: NavLinkRecord[] = linkMatches.map((lm) => {
      const href = lm[1];
      const targetId = href.startsWith('#') ? href.slice(1) : href;
      const label = decodeHtmlEntities(lm[2]).trim();
      return { href, targetId, label };
    });
    return { course, badgeText, links };
  });
}

/**
 * Parses `content-nav.html` into structured navigation groups for `#navF` and `#navT`.
 */
export function parseNavContent(navHtml: string): ParsedNavContent {
  const navFMatch = navHtml.match(/<nav class="fmnav" id="navF"[^>]*>([\s\S]*?)<\/nav>/);
  const navTMatch = navHtml.match(/<nav class="fmnav" id="navT"[^>]*>([\s\S]*?)<\/nav>/);
  return {
    navF: parseSingleNavBlock(navFMatch ? navFMatch[1] : ''),
    navT: parseSingleNavBlock(navTMatch ? navTMatch[1] : ''),
  };
}
