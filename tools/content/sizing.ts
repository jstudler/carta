/**
 * Pure card-sizing helpers. Given global baselines and per-item multipliers,
 * compute the rendered pixel size of media sidecars and text cards. Aspect ratio
 * is always preserved for media; text card area grows with its content.
 *
 * Kept pure (no I/O) so it is unit tested and reused identically in build + docs.
 */

import type { AppConfig } from '../../app.config';
import type { Dimensions } from './mediaDimensions';

/**
 * Scale an intrinsic media size so its rendered AREA equals
 * `baselineArea * sizeMultiplier`, preserving aspect ratio.
 */
export function mediaRenderSize(
  intrinsic: Dimensions,
  baselineArea: number,
  sizeMultiplier: number,
): Dimensions {
  const aspect = intrinsic.width / Math.max(1, intrinsic.height);
  const targetArea = baselineArea * sizeMultiplier;
  const height = Math.sqrt(targetArea / aspect);
  const width = height * aspect;
  return { width: Math.round(width), height: Math.round(height) };
}

/** Rendered size of an audio player card (fixed-ratio bar scaled by `size`). */
export function audioRenderSize(
  baseHeight: number,
  baseWidth: number,
  sizeMultiplier: number,
): Dimensions {
  return {
    width: Math.round(baseWidth * sizeMultiplier),
    height: Math.round(baseHeight * sizeMultiplier),
  };
}

/**
 * Split an HTML (or plain-text) body into block-level text segments. Each
 * paragraph / list item / heading / line-break becomes one segment so the height
 * estimate can account for the ragged last line of every block (which a single
 * char-count division would systematically under-count, causing overlaps).
 *
 * Tables are extracted separately so their height can be measured with
 * column-aware logic (see `measureTableHeight`).
 */

/** Strip HTML tags and decode entities from a fragment. */
function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A parsed table: array of rows, each row an array of cell texts.
 * Header rows are included (they render the same height as body rows).
 */
interface ParsedTable {
  rows: string[][];
  colCount: number;
}

/** Extract all `<table>…</table>` blocks and return the remaining HTML plus parsed tables. */
function extractTables(html: string): { remaining: string; tables: ParsedTable[] } {
  const tables: ParsedTable[] = [];
  const remaining = html.replace(/<table[\s>][\s\S]*?<\/table\s*>/gi, (tableHtml) => {
    const rows: string[][] = [];
    const rowRe = /<tr[\s>][\s\S]*?<\/tr\s*>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const cellRe = /<(?:td|th)[\s>][\s\S]*?<\/(?:td|th)\s*>/gi;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRe.exec(rowMatch[0])) !== null) {
        cells.push(stripTags(cellMatch[0]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    const colCount = rows.reduce((max, r) => Math.max(max, r.length), 0);
    if (rows.length > 0) tables.push({ rows, colCount });
    // Replace table with a newline so surrounding blocks stay separated.
    return '\n';
  });
  return { remaining, tables };
}

/**
 * Measure the pixel height a table occupies, accounting for:
 * - column layout: each column gets an equal share of the card width
 * - cell padding: 0.3em top + 0.3em bottom per cell (CSS rule)
 * - border collapse: 1px per row
 * - font-size: tables render at 0.9em
 * - the tallest cell in a row dictates the row height
 */
function measureTableHeight(
  table: ParsedTable,
  contentWidthEm: number,
  fontSize: number,
): number {
  const tableFontSize = fontSize * 0.9;
  const lineHeight = tableFontSize * 1.55;
  // Cell horizontal padding is 0.5em each side — total 1em per cell in table-font ems.
  const cellHPadEm = 1.0;
  // Vertical padding: 0.3em top + 0.3em bottom in table-font ems.
  const cellVPad = tableFontSize * 0.6;
  // The content width at table font size, in table-font em units.
  const tableWidthEm = contentWidthEm * (fontSize / tableFontSize);
  // Total padding consumed by all columns.
  const totalPadEm = cellHPadEm * table.colCount;
  const availableEm = Math.max(1, tableWidthEm - totalPadEm);

  // Estimate column widths proportionally: measure the longest cell in each
  // column (in em), then distribute the available width by those proportions.
  // This mimics the browser's auto table layout where narrow number columns
  // shrink and wide text columns expand.
  const colMaxEm: number[] = new Array(table.colCount).fill(0);
  for (const row of table.rows) {
    for (let c = 0; c < row.length && c < table.colCount; c++) {
      const w = tokenEm(row[c].replace(/\s+/g, '')) || 1;
      // Use the longest single word as the minimum, but also consider total
      // text length — the browser balances between these.
      const words = row[c].split(/\s+/).filter(Boolean);
      const longestWord = words.reduce((mx, wd) => Math.max(mx, tokenEm(wd)), 0);
      // Weight: average of longest-word and total-text-length, biased toward
      // total length (which is what drives browser column sizing).
      const weight = Math.max(longestWord, w * 0.4);
      if (weight > colMaxEm[c]) colMaxEm[c] = weight;
    }
  }
  const totalWeight = colMaxEm.reduce((s, v) => s + v, 0) || 1;
  const colContentEms = colMaxEm.map((w) =>
    Math.max(1, (w / totalWeight) * availableEm),
  );

  let totalHeight = 0;
  for (const row of table.rows) {
    let maxCellLines = 1;
    for (let c = 0; c < row.length && c < table.colCount; c++) {
      if (row[c].length === 0) continue;
      const lines = wrappedLines(row[c], colContentEms[c]);
      if (lines > maxCellLines) maxCellLines = lines;
    }
    // Row height = tallest cell's wrapped lines * line height + vertical padding + 1px border.
    totalHeight += maxCellLines * lineHeight + cellVPad + 1;
  }
  // Table bottom margin (0.6em at base font size, matching the CSS margin).
  totalHeight += fontSize * 0.6;
  return totalHeight;
}

function htmlToBlocks(html: string): string[] {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|ul|ol|h[1-6]|blockquote|pre|tr|table|figure|figcaption)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Approximate per-glyph advance widths in `em` units for a humanist sans-serif
 * (Noto Sans). Measuring real glyph widths — rather than assuming every
 * character is the same width — is what makes the wrapped line count match the
 * browser closely and deterministically, eliminating the inconsistent extra
 * space the old fixed `chars-per-line` heuristic produced.
 */
const GLYPH_EM: Record<string, number> = {
  ' ': 0.26,
  i: 0.24, j: 0.24, l: 0.24, I: 0.3, '.': 0.27, ',': 0.27, ';': 0.27, ':': 0.27,
  "'": 0.2, '!': 0.27, '|': 0.23, '`': 0.3, '(': 0.32, ')': 0.32, '[': 0.32, ']': 0.32,
  f: 0.32, t: 0.33, r: 0.36, '-': 0.36, '/': 0.3,
  m: 0.82, w: 0.72, M: 0.84, W: 0.86,
};
const UPPER_EM = 0.64;
const DIGIT_EM = 0.56;
const DEFAULT_EM = 0.5;

/** Width of one character in em units. */
function charEm(ch: string): number {
  const known = GLYPH_EM[ch];
  if (known !== undefined) return known;
  if (ch >= '0' && ch <= '9') return DIGIT_EM;
  if (ch >= 'A' && ch <= 'Z') return UPPER_EM;
  return DEFAULT_EM;
}

/** Width of a whole token (word) in em units. */
function tokenEm(token: string): number {
  let w = 0;
  for (const ch of token) w += charEm(ch);
  return w;
}

/**
 * Count the wrapped lines a block of text occupies in a column `contentWidthEm`
 * wide (in em units), using a greedy word-wrap that mirrors the browser: words
 * never split (long unbroken tokens still occupy at least one line each).
 */
function wrappedLines(block: string, contentWidthEm: number): number {
  const spaceEm = GLYPH_EM[' '];
  const words = block.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 1;
  let cursor = 0;
  for (const word of words) {
    const w = tokenEm(word);
    if (cursor === 0) {
      cursor = w;
    } else if (cursor + spaceEm + w <= contentWidthEm) {
      cursor += spaceEm + w;
    } else {
      lines += 1;
      cursor = w;
    }
    // A single word wider than the column wraps onto extra lines on its own.
    if (w > contentWidthEm) {
      lines += Math.floor(w / contentWidthEm);
      cursor = w % contentWidthEm;
    }
  }
  return lines;
}

/**
 * Estimate the rendered size of a text/HTML card from its content.
 *
 * `width` controls the content column width (and therefore line breaks) without
 * changing the font size; `fontSize` scales the type AND the padding so dense
 * cards keep their margins. The height is derived per block (paragraph / list
 * item / heading) from a proportional-width word-wrap so the reserved box tracks
 * the real rendered height tightly — the build relies on this to lay cards out
 * without overlaps and without leaving large empty gaps below the text.
 *
 * Accepts either the raw HTML body (preferred, so block structure is honoured)
 * or a plain-text string (treated as a single block).
 */
export function textCardSize(
  htmlOrText: string,
  config: AppConfig,
  fontSizeMultiplier: number,
  widthMultiplier: number,
  hasTitle: boolean,
  title?: string,
): Dimensions {
  const { baseline } = config;
  const fontSize = baseline.fontSize * fontSizeMultiplier;
  // Padding grows with the font size so the visual margin stays proportional.
  const pad = baseline.cardPadding * fontSizeMultiplier;
  const contentWidth = baseline.textWidth * widthMultiplier;
  const lineHeight = fontSize * 1.55;
  // Column width expressed in em units (matches the glyph table's units).
  const contentWidthEm = contentWidth / fontSize;

  // Extract tables before block-splitting so they get column-aware measurement.
  const { remaining, tables } = extractTables(htmlOrText);

  const blocks = htmlToBlocks(remaining);
  let lines = 0;
  for (const block of blocks) {
    lines += wrappedLines(block, contentWidthEm);
  }
  if (blocks.length === 0 && tables.length === 0) lines = 1;
  const blockCount = Math.max(1, blocks.length);

  // Measure table heights with column-aware logic.
  let tableHeight = 0;
  for (const table of tables) {
    tableHeight += measureTableHeight(table, contentWidthEm, fontSize);
  }

  // The title is a serif h2 at 1.2em (line-height 1.2) plus its bottom margin.
  // Measure how many lines it actually wraps to (serif runs ~6% wider, so the
  // column holds proportionally fewer ems); fall back to one line when the
  // title text is not supplied. This prevents a wrapped title from pushing the
  // body down past the reserved box.
  let titleLines = 0;
  if (hasTitle) {
    const titleEm = (contentWidth / (fontSize * 1.2)) * 0.94;
    titleLines = title ? wrappedLines(title, titleEm) : 1;
  }
  const titleHeight = hasTitle ? titleLines * fontSize * 1.2 * 1.2 + fontSize * 0.4 : 0;
  // The meta line (timestamp · topic · category) at 0.72em plus its bottom
  // margin. It never wraps — overlong segments truncate with an ellipsis.
  const metaHeight = fontSize * 0.72 * 1.3 + fontSize * 0.5;
  // Block elements carry ~0.6em bottom margins between them (none after last).
  const blockSpacing = Math.max(0, blockCount - 1) * fontSize * 0.6;

  const contentHeight = titleHeight + metaHeight + lines * lineHeight + blockSpacing + tableHeight;
  // Small 2% safety margin so proportional-font rendering never quite exceeds
  // the reservation, without leaving a visibly large empty strip below.
  const height = pad * 2 + Math.ceil(contentHeight * 1.02);
  const width = contentWidth + pad * 2;
  return { width: Math.round(width), height: Math.round(height) };
}
