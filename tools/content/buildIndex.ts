/**
 * Build the pre-computed content index from a folder of content items.
 *
 * Runs entirely in Node at build time (and on demand during dev HMR). It parses
 * frontmatter from HTML or Markdown source files, validates per-item + cross-file
 * constraints, measures media, computes every card's size, runs the timeline +
 * topic layout algorithms, and extracts the search corpus. The browser receives a
 * finished index — no parsing or layout work happens on load.
 *
 * Key pipeline features:
 *   - Accepts both `.html` and `.md` content files (Markdown rendered to HTML via
 *     `marked`). If both exist for the same stem, the build fails.
 *   - Files prefixed with `_draft_` are silently ignored (work-in-progress).
 *   - The content folder may contain any depth of subdirectories; each card's
 *     content file and its sidecar media must share the same directory.
 *   - Web-rendered media (converted images/video/audio) is read from a separate
 *     `renderedDir` (flat), decoupling originals from deployable files.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename, extname, relative } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

// Configure marked for GitHub Flavored Markdown (headings, lists, bold, italic,
// strikethrough, tables, task lists, fenced code blocks, etc.).
marked.setOptions({ gfm: true, breaks: false });
import type { AppConfig } from '../../app.config';
import type {
  ContentIndex,
  ContentItem,
  Sidecar,
  ItemFrontmatter,
  CardType,
  TopicCluster,
} from '../../shared/contentTypes';
import { parseItemDate } from '../../shared/time';
import { probeDimensions } from './mediaDimensions';
import { mediaRenderSize, audioRenderSize, textCardSize } from './sizing';
import { validateFrontmatter, htmlToText, normalizeType, breakLongUrls, externalizeLinks } from './parse';
import { packItemParts, layoutTimeline, layoutTopic } from './layout';
import { WEB_FORMATS, PASSTHROUGH_FORMATS, mimeForFile, stripExt } from '../../shared/mediaFormats';

export class ContentError extends Error {}

/** Convert a string to kebab-case (lowercase, non-alphanumeric → hyphens, no leading/trailing hyphens). */
function toKebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Format a date string (ISO) to a kebab-case date part: yyyy-mm-dd or yyyy-mm-dd-hh-mm. */
function dateToKebab(dateStr: string): string {
  // dateStr is like "2026-04-16" or "2026-04-16T11:06" or "2026-04-16T11:06:00+02:00"
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return toKebab(dateStr);
  const parts = [m[1], m[2], m[3]];
  // Include time if it's not midnight.
  if (m[4] && m[5] && !(m[4] === '00' && m[5] === '00')) {
    parts.push(m[4], m[5]);
  }
  return parts.join('-');
}

/** Filename (no path) of the abstract content file (html or md). */
const ABSTRACT_STEMS = ['_abstract'];

/**
 * Shift all heading levels so the highest used level becomes h3 (since h2 is
 * reserved for the card title). If the doc has h1, h2, h3 they become h3, h4, h5.
 * If only h2, h3 → they become h3, h4. Headings that would exceed h6 are clamped.
 */
function shiftHeadings(html: string): string {
  // Find the minimum heading level present.
  const levels: number[] = [];
  html.replace(/<h([1-6])[\s>]/gi, (_, d) => { levels.push(Number(d)); return ''; });
  if (levels.length === 0) return html;
  const minLevel = Math.min(...levels);
  const offset = 3 - minLevel; // shift so min becomes h3
  if (offset === 0) return html;
  // Replace opening and closing tags.
  return html.replace(/<(\/?)h([1-6])([\s>])/gi, (_, slash, d, rest) => {
    const newLevel = Math.min(6, Number(d) + offset);
    return `<${slash}h${newLevel}${rest}`;
  });
}

/** True for files that should be silently skipped (drafts, hidden files). */
function isIgnored(filename: string): boolean {
  return filename.startsWith('_draft_') || filename.startsWith('.') || filename.toLowerCase() === 'readme.md';
}

/** True for content source files (html or md, not drafts). */
function isContentFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (lower.endsWith('.html') || lower.endsWith('.md')) && !isIgnored(filename);
}

/**
 * Recursively collect content files from the source directory.
 * Returns an array of `{ relDir, filename }` where relDir is the path relative
 * to the content root ('' for top-level files).
 */
function walkContentFiles(
  rootDir: string,
  dir: string = rootDir,
): { relDir: string; filename: string }[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const results: { relDir: string; filename: string }[] = [];
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkContentFiles(rootDir, full));
    } else if (entry.isFile() && isContentFile(entry.name)) {
      results.push({ relDir: relative(rootDir, dir), filename: entry.name });
    }
  }
  return results;
}

function mediaUrl(config: AppConfig, filename: string): string {
  const base = config.mediaBaseUrl.replace(/\/$/, '');
  return base ? `${base}/${filename}` : `/content/${filename}`;
}

/**
 * Read the video LQIP data URI written by `convert:media` into
 * `<renderedDir>/<stem>.lqip.txt`. Returns undefined when the file is missing
 * (pre-conversion) or does not look like an image data URI.
 */
function readLqip(renderedDir: string, stem: string): string | undefined {
  const path = join(renderedDir, `${stem}.lqip.txt`);
  if (!existsSync(path)) return undefined;
  const uri = readFileSync(path, 'utf8').trim();
  return uri.startsWith('data:image/') ? uri : undefined;
}

/**
 * Coerce a frontmatter `date` to a canonical string. Unquoted YAML dates are
 * parsed into JS `Date` objects (stored as UTC) by js-yaml; recover the authored
 * wall-clock components so build-time and runtime parsing agree, and collapse a
 * midnight value to a bare `YYYY-MM-DD` (treated as "no time of day").
 */
function coerceDate(value: unknown): unknown {
  if (!(value instanceof Date)) return value;
  const p = (n: number): string => n.toString().padStart(2, '0');
  const y = value.getUTCFullYear();
  const mo = p(value.getUTCMonth() + 1);
  const d = p(value.getUTCDate());
  const h = value.getUTCHours();
  const mi = value.getUTCMinutes();
  const s = value.getUTCSeconds();
  if (h === 0 && mi === 0 && s === 0) return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d}T${p(h)}:${p(mi)}:${p(s)}`;
}

/**
 * Read + parse every content item (`.html` or `.md`) in the content folder
 * (recursively) into intermediate form.
 *
 * Sidecars are resolved in two places, in order:
 *   1. The rendered/cache directory (flat — web-optimised variants)
 *   2. The item's own directory in the source tree (original files as fallback)
 */
function readItems(contentDir: string, config: AppConfig): ContentItem[] {
  const dir = resolve(contentDir);
  if (!existsSync(dir)) {
    throw new ContentError(`Content folder not found: ${dir}`);
  }

  const renderedDir = resolve(config.renderedDir);

  const allContentFiles = walkContentFiles(dir);
  if (allContentFiles.length === 0) {
    throw new ContentError(`No .html or .md content files in ${dir}`);
  }

  // First pass: scan frontmatter of all files to find text sidecar filenames.
  // These files are referenced by other items and should NOT be treated as
  // standalone content items.
  const textSidecarFiles = new Set<string>();
  for (const { relDir, filename } of allContentFiles) {
    const itemDir = relDir ? join(dir, relDir) : dir;
    const filePath = join(itemDir, filename);
    const raw = readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as ItemFrontmatter;
    if (fm.sidecars) {
      for (const sc of fm.sidecars) {
        if (sc.kind === 'text') {
          // Store relative to content root for comparison.
          const ref = relDir ? `${relDir}/${sc.filename}` : sc.filename;
          textSidecarFiles.add(ref);
        }
      }
    }
  }

  // Filter out text sidecar files from the content file list.
  const contentFiles = allContentFiles.filter(({ relDir, filename }) => {
    const ref = relDir ? `${relDir}/${filename}` : filename;
    return !textSidecarFiles.has(ref);
  });

  if (contentFiles.length === 0) {
    throw new ContentError(`No .html or .md content files in ${dir}`);
  }

  // Detect conflicts: same stem (basename minus extension) present as both
  // .html and .md (in the same directory or across directories).
  const stemToFile = new Map<string, string>();
  for (const { relDir, filename } of contentFiles) {
    const ext = extname(filename).toLowerCase();
    const stem = basename(filename, ext);
    const key = stem; // stems must be globally unique (used as item id)
    const existing = stemToFile.get(key);
    const fullRef = relDir ? `${relDir}/${filename}` : filename;
    if (existing) {
      throw new ContentError(
        `Duplicate content stem "${stem}": found both "${existing}" and "${fullRef}". ` +
          `If both .html and .md exist for the same item, keep only one.`,
      );
    }
    stemToFile.set(key, fullRef);
  }

  const items: ContentItem[] = [];
  for (const { relDir, filename } of contentFiles) {
    const ext = extname(filename).toLowerCase();
    const stem = basename(filename, ext);
    const isAbstract = ABSTRACT_STEMS.includes(stem);
    const itemDir = relDir ? join(dir, relDir) : dir;
    const filePath = join(itemDir, filename);
    const raw = readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as ItemFrontmatter;

    // Convert Markdown body to HTML if the source is .md.
    let bodyContent = parsed.content.trim();
    if (ext === '.md') {
      // Encode spaces in internalref: URLs so marked's link parser handles them.
      bodyContent = bodyContent.replace(
        /\]\(internalref:([^)]+)\)/g,
        (_, title: string) => `](internalref:${encodeURIComponent(title)})`,
      );
      bodyContent = marked.parse(bodyContent, { async: false }) as string;
    }

    // Shift headings so the highest used level becomes h3 (h2 is reserved for
    // the card title). E.g. if the doc uses h1,h2,h3 → they become h3,h4,h5.
    bodyContent = shiftHeadings(bodyContent);

    // Unquoted YAML dates arrive as Date objects — normalise to a string.
    fm.date = coerceDate(fm.date) as string;

    // The abstract may omit frontmatter; its type is inferred from the filename.
    if (isAbstract) {
      fm.type = 'abstract';
      fm.topic = fm.topic ?? 'general';
      fm.title = fm.title ?? 'Abstract';
      fm.date = fm.date ?? new Date(0).toISOString();
    }

    const result = validateFrontmatter(fm);
    if (!result.valid) {
      const ref = relDir ? `${relDir}/${filename}` : filename;
      throw new ContentError(`Invalid frontmatter in ${ref}:\n  - ${result.errors.join('\n  - ')}`);
    }

    const html = externalizeLinks(breakLongUrls(bodyContent));
    const text = htmlToText(html);
    const sidecarsFm = fm.sidecars ?? [];

    // Constraint: an item must have a body OR at least one sidecar.
    if (!text && sidecarsFm.length === 0) {
      const ref = relDir ? `${relDir}/${filename}` : filename;
      throw new ContentError(`${ref} has neither body content nor sidecars.`);
    }

    // Constraint: sidecar filenames must be prefixed with the item stem.
    for (const sc of sidecarsFm) {
      if (!sc.filename.startsWith(`${stem}--`) && !sc.filename.startsWith(stem)) {
        const ref = relDir ? `${relDir}/${filename}` : filename;
        throw new ContentError(
          `${ref}: sidecar "${sc.filename}" is not prefixed with the item stem "${stem}".`,
        );
      }
    }

    // Constraint: at most one audio sidecar per card.
    const audioSidecars = sidecarsFm.filter((sc) => sc.kind === 'audio');
    if (audioSidecars.length > 1) {
      const ref = relDir ? `${relDir}/${filename}` : filename;
      throw new ContentError(
        `${ref}: only one audio sidecar is allowed per card, found ${audioSidecars.length}.`,
      );
    }

    const type = normalizeType(fm) as CardType;
    const { timestamp, hasTime } = parseItemDate(fm.date);
    const fontSize = fm.font_size ?? 1.0;
    const widthMul = fm.width ?? 1.0;

    // Resolve + measure sidecars. Look first in the rendered (cache) directory,
    // then fall back to the item's source directory.
    const sidecars: Sidecar[] = sidecarsFm.map((sc) => {
      // Text sidecars: read the file, convert MD→HTML if needed, compute size.
      if (sc.kind === 'text') {
        const textPath = join(itemDir, sc.filename);
        if (!existsSync(textPath)) {
          throw new ContentError(
            `Text sidecar "${sc.filename}" not found in "${itemDir}".`,
          );
        }
        let textHtml = readFileSync(textPath, 'utf8').trim();
        const textExt = sc.filename.split('.').pop()?.toLowerCase();
        if (textExt === 'md') {
          // Encode internalref: URLs for marked.
          textHtml = textHtml.replace(
            /\]\(internalref:([^)]+)\)/g,
            (_, title: string) => `](internalref:${encodeURIComponent(title)})`,
          );
          textHtml = marked.parse(textHtml, { async: false }) as string;
        }
        textHtml = shiftHeadings(textHtml);
        textHtml = breakLongUrls(textHtml);
        textHtml = externalizeLinks(textHtml);
        const size = sc.size ?? 1.0;
        const textDims = textCardSize(textHtml, config, fontSize, widthMul * size, false);
        return {
          filename: sc.filename,
          url: '',
          sources: [],
          kind: sc.kind,
          description: sc.description,
          size,
          renderWidth: textDims.width,
          renderHeight: textDims.height,
          relX: 0,
          relY: 0,
          html: textHtml,
        };
      }

      const baseStem = stripExt(sc.filename);
      const variants = [...(WEB_FORMATS[sc.kind] ?? []), ...(PASSTHROUGH_FORMATS[sc.kind] ?? [])];

      // Check rendered dir first (flat), then source dir alongside the item.
      const presentVariants = variants.filter(
        (v) =>
          existsSync(join(renderedDir, `${baseStem}.${v.ext}`)) ||
          existsSync(join(itemDir, `${baseStem}.${v.ext}`)),
      );

      let sources: { url: string; type: string }[];
      let probeFile: string;
      if (presentVariants.length > 0) {
        sources = presentVariants.map((v) => ({
          url: mediaUrl(config, `${baseStem}.${v.ext}`),
          type: v.type,
        }));
        // Probe from whichever location has the file.
        const firstExt = presentVariants[0].ext;
        probeFile = existsSync(join(renderedDir, `${baseStem}.${firstExt}`))
          ? join(renderedDir, `${baseStem}.${firstExt}`)
          : join(itemDir, `${baseStem}.${firstExt}`);
      } else {
        // Pre-conversion fallback: use the authored file as-is (source dir).
        sources = [{ url: mediaUrl(config, sc.filename), type: mimeForFile(sc.filename) }];
        probeFile = join(itemDir, sc.filename);
      }

      const dims = probeDimensions(probeFile, sc.kind);
      const size = sc.size ?? 1.0;
      let renderWidth: number;
      let renderHeight: number;
      if (sc.kind === 'audio' || !dims) {
        const a = audioRenderSize(config.baseline.audioHeight, config.baseline.textWidth, size);
        renderWidth = a.width;
        renderHeight = a.height;
      } else {
        const r = mediaRenderSize(dims, config.baseline.mediaArea, size);
        renderWidth = r.width;
        renderHeight = r.height;
      }
      return {
        filename: sc.filename,
        url: sources[0].url,
        sources,
        kind: sc.kind,
        description: sc.description,
        size,
        width: dims?.width,
        height: dims?.height,
        renderWidth,
        renderHeight,
        relX: 0,
        relY: 0,
        lqip: sc.kind === 'video' ? readLqip(renderedDir, baseStem) : undefined,
      };
    });

    const hasBody = text.length > 0;
    const textSize = hasBody
      ? textCardSize(html, config, fontSize, widthMul, true, fm.title)
      : { width: 0, height: 0 };

    // Pack the item's parts into one tight group.
    const packed = packItemParts(
      {
        textCard: hasBody ? textSize : null,
        sidecars: sidecars.map((s) => ({ width: s.renderWidth, height: s.renderHeight })),
      },
      config,
    );
    packed.sidecars.forEach((p, i) => {
      sidecars[i].relX = p.x;
      sidecars[i].relY = p.y;
    });

    items.push({
      id: stem,
      stem,
      title: fm.title,
      timestamp,
      dateIso: fm.date,
      hasTime,
      topic: fm.topic,
      category: fm.category,
      type,
      html,
      text,
      fontSize,
      width: widthMul,
      sidecars,
      textCard: {
        x: packed.textCard.x,
        y: packed.textCard.y,
        width: textSize.width,
        height: textSize.height,
      },
      localSize: { width: packed.width, height: packed.height },
      hasAudio: sidecars.some((s) => s.kind === 'video' || s.kind === 'audio'),
      author: fm.author,
      year: fm.year,
      institution: fm.institution,
      summary: fm.summary,
      layout: {
        timeline: { bounds: { x: 0, y: 0, width: packed.width, height: packed.height } },
        topic: { bounds: { x: 0, y: 0, width: packed.width, height: packed.height } },
        book: { bounds: { x: 0, y: 0, width: 0, height: 0 } },
      },
    });
  }
  return items;
}

/** Enforce cross-file constraints: exactly one conclusion per topic, newest dated. */
function validateConstraints(items: ContentItem[]): void {
  // Title uniqueness (required for cross-reference links).
  const titleToFile = new Map<string, string>();
  for (const item of items) {
    const lower = item.title.toLowerCase();
    const existing = titleToFile.get(lower);
    if (existing) {
      throw new ContentError(
        `Duplicate title "${item.title}" found in "${item.id}" and "${existing}". ` +
          `Titles must be unique (they are used as cross-reference targets).`,
      );
    }
    titleToFile.set(lower, item.id);
  }

  const byTopic = new Map<string, ContentItem[]>();
  for (const item of items) {
    if (item.type === 'abstract') continue;
    const list = byTopic.get(item.topic) ?? [];
    list.push(item);
    byTopic.set(item.topic, list);
  }

  // Validate internalref: links point to existing items.
  const refPattern = /href="internalref:([^"]+)"/gi;
  for (const item of items) {
    let match: RegExpExecArray | null;
    while ((match = refPattern.exec(item.html)) !== null) {
      const targetTitle = decodeURIComponent(match[1]).toLowerCase();
      if (!titleToFile.has(targetTitle)) {
        throw new ContentError(
          `Broken cross-reference in "${item.id}": internalref target ` +
            `"${decodeURIComponent(match[1])}" does not match any item title.`,
        );
      }
    }
  }

  for (const [topic, list] of byTopic) {
    const conclusions = list.filter((i) => i.type === 'conclusion');
    if (conclusions.length !== 1) {
      throw new ContentError(
        `Topic "${topic}" must have exactly one conclusion, found ${conclusions.length}.`,
      );
    }
    const conclusion = conclusions[0];
    const newest = Math.max(...list.map((i) => i.timestamp));
    if (conclusion.timestamp < newest) {
      throw new ContentError(
        `Conclusion of topic "${topic}" (${conclusion.dateIso}) must be the newest entry; ` +
          `a later-dated item exists.`,
      );
    }

    // An introduction is optional, but at most one per topic and it must be the
    // oldest entry in its topic.
    const introductions = list.filter((i) => i.type === 'introduction');
    if (introductions.length > 1) {
      throw new ContentError(
        `Topic "${topic}" may have at most one introduction, found ${introductions.length}.`,
      );
    }
    if (introductions.length === 1) {
      const introduction = introductions[0];
      const oldest = Math.min(...list.map((i) => i.timestamp));
      if (introduction.timestamp > oldest) {
        throw new ContentError(
          `Introduction of topic "${topic}" (${introduction.dateIso}) must be the oldest entry; ` +
            `an earlier-dated item exists.`,
        );
      }
    }
  }
}

/** Build the complete, render-ready content index. */
export function buildContentIndex(
  config: AppConfig,
  opts: { renameMedia?: boolean } = {},
): ContentIndex {
  const items = readItems(config.contentDir, config);
  validateConstraints(items);

  const abstract = items.find((i) => i.type === 'abstract') ?? null;
  const nonAbstract = items.filter((i) => i.type !== 'abstract');
  // "general" always first, then the rest alphabetically.
  const topicSet = new Set(nonAbstract.map((i) => i.topic));
  const topics = [
    ...(topicSet.has('general') ? ['general'] : []),
    ...[...topicSet].filter((t) => t !== 'general').sort(),
  ];

  // Timeline layout.
  const timeline = layoutTimeline(
    items.map((i) => ({
      id: i.id,
      timestamp: i.timestamp,
      width: i.localSize.width,
      height: i.localSize.height,
      isAbstract: i.type === 'abstract',
      topic: i.topic,
      isIntro: i.type === 'introduction',
      isConclusion: i.type === 'conclusion',
    })),
    config,
  );
  const timelineById = new Map(timeline.placements.map((p) => [p.id, p]));

  // Topic layout.
  const topic = layoutTopic(
    nonAbstract.map((i) => ({
      id: i.id,
      topic: i.topic,
      timestamp: i.timestamp,
      width: i.localSize.width,
      height: i.localSize.height,
      isIntro: i.type === 'introduction',
      isConclusion: i.type === 'conclusion',
    })),
    topics,
    abstract ? { width: abstract.localSize.width, height: abstract.localSize.height } : null,
    config,
  );
  const topicById = new Map(topic.placements.map((p) => [p.id, p]));

  // Align the two views so they share the SAME centre. The view morph zooms out
  // to the union of both layouts and then zooms into the target; with a common
  // centre the camera position is identical at the zoomed-out point, so only the
  // CARDS move during the swap while the canvas itself stays put (smooth morph).
  const centerOf = (r: { x: number; y: number; width: number; height: number }) => ({
    x: r.x + r.width / 2,
    y: r.y + r.height / 2,
  });
  const tlCenter = centerOf(timeline.bounds);
  const tpCenter = centerOf(topic.bounds);
  const dx = tlCenter.x - tpCenter.x;
  const dy = tlCenter.y - tpCenter.y;
  if (dx !== 0 || dy !== 0) {
    for (const p of topic.placements) {
      p.bounds.x += dx;
      p.bounds.y += dy;
    }
    for (const c of topic.clusters) {
      c.center.x += dx;
      c.center.y += dy;
      c.bounds.x += dx;
      c.bounds.y += dy;
    }
    if (topic.abstractBounds) {
      topic.abstractBounds.x += dx;
      topic.abstractBounds.y += dy;
    }
    topic.bounds.x += dx;
    topic.bounds.y += dy;
  }

  // Apply placements back onto items.
  for (const item of items) {
    const tl = timelineById.get(item.id);
    if (tl) {
      item.layout.timeline = { bounds: tl.bounds, below: tl.below };
    }
    if (item.type === 'abstract' && topic.abstractBounds) {
      item.layout.topic = { bounds: topic.abstractBounds };
    } else {
      const tp = topicById.get(item.id);
      if (tp) item.layout.topic = { bounds: tp.bounds };
    }
  }

  const clusters: TopicCluster[] = topic.clusters.map((c) => ({
    topic: c.topic,
    center: c.center,
    bounds: c.bounds,
    itemIds: c.itemIds,
  }));

  const categories = [
    ...new Set(nonAbstract.map((i) => i.category).filter((c): c is string => !!c)),
  ].sort();

  const timestamps = nonAbstract.map((i) => i.timestamp);
  const timeRange = {
    min: timestamps.length ? Math.min(...timestamps) : 0,
    max: timestamps.length ? Math.max(...timestamps) : 0,
  };

  // Build deterministic rename map: original cache filename → deploy filename.
  // Format: <topic>-<datetime>-<title>-<iteration>.<ext>
  // Only in production builds; dev server uses original filenames.
  const mediaRenameMap: Record<string, string> = {};
  if (opts.renameMedia) {
    for (const item of items) {
      const topicPart = toKebab(item.topic);
      const datePart = dateToKebab(item.dateIso);
      const titlePart = toKebab(item.title);
      const prefix = `${topicPart}-${datePart}-${titlePart}`;

      let iteration = 0;
      for (const sc of item.sidecars) {
        if (sc.kind === 'text') continue; // text sidecars have no media files
        iteration++;
        for (const src of sc.sources) {
          // Extract the original filename from the URL.
          const parts = src.url.split('/');
          const origName = parts[parts.length - 1];
          const ext = origName.includes('.') ? origName.slice(origName.lastIndexOf('.')) : '';
          const deployName = `${prefix}-${iteration}${ext}`;
          mediaRenameMap[origName] = deployName;
          // Update the URL to use the deploy filename.
          src.url = src.url.replace(origName, deployName);
        }
        // Update the primary sidecar URL too.
        if (sc.sources.length > 0) {
          sc.url = sc.sources[0].url;
        }
      }
    }
  }

  return {
    items,
    topics,
    clusters,
    categories,
    abstractId: abstract?.id ?? null,
    bounds: { timeline: timeline.bounds, topic: topic.bounds, book: { x: 0, y: 0, width: 0, height: 0 } },
    mediaRenameMap,
    searchDocs: items.map((i) => ({
      id: i.id,
      title: i.title,
      text: i.text,
      topic: i.topic,
      category: i.category,
    })),
    timeRange,
    timelineScale: timeline.scale,
    timelineMinTimestamp: timeline.minTimestamp,
  };
}
