/**
 * Renders the canvas, fully zoomed out, as a standalone SVG string.
 *
 * This is the source image for the social preview (og:image) shown by WhatsApp,
 * Teams, Slack and friends. It deliberately does NOT screenshot the running app:
 * every card position is already computed at build time by the layout pipeline,
 * so the whole picture can be drawn in Node with no browser and no DOM.
 *
 * Only the world layer is drawn — cards and topic lines. All UI chrome (controls,
 * minimap, search, table of contents) is absent by construction. Card text is
 * omitted too: at full zoom-out it would be illegible, so cards render as flat
 * colour blocks and the result reads as an abstract poster of the canvas.
 */

import type { AppConfig, ColorScheme } from '../../app.config';
import type { ContentIndex, ContentItem } from '../../shared/contentTypes';
import { fitRect, inflateRect } from '../../shared/geometry';
import { smoothPath } from '../../shared/curves';
import { buildTopicPalette } from '../../shared/palette';
import { siteMetaFromIndex } from '../../shared/siteMeta';

export interface PreviewOptions {
  /** Which layout to draw. 'topic' fills a square best; 'timeline' is very wide. */
  view: 'timeline' | 'topic';
  width: number;
  height: number;
  scheme: ColorScheme;
  config: AppConfig;
  /** Fraction of each edge left empty around the content. Matches `fitAll`. */
  padding?: number;
}

/** Trim float noise so the SVG stays small and byte-identical across runs. */
function n(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** Escape a string for safe inclusion in XML text/attribute content. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Centre of an item's main text card, falling back to its full bounds. */
function cardCenter(item: ContentItem, view: 'timeline' | 'topic'): { x: number; y: number } {
  const b = item.layout[view].bounds;
  const cardW = item.textCard.width || b.width;
  const cardH = item.textCard.height || b.height;
  return {
    x: b.x + item.textCard.x + cardW / 2,
    y: b.y + item.textCard.y + cardH / 2,
  };
}

/**
 * Topic connector paths, mirroring src/canvas/TopicLines.tsx: one smooth curve
 * per topic through its cards in chronological order.
 */
function topicLinePaths(
  index: ContentIndex,
  view: 'timeline' | 'topic',
  palette: ReturnType<typeof buildTopicPalette>,
  strokeWidth: number,
): string {
  const allTopics = ['general', ...index.topics.filter((t) => t !== 'general')];
  const byId = new Map(index.items.map((i) => [i.id, i]));
  const out: string[] = [];

  for (const topic of allTopics) {
    const topicItems =
      topic === 'general'
        ? index.items.filter((i) => i.topic === 'general')
        : (index.clusters.find((c) => c.topic === topic)?.itemIds ??
            index.items.filter((i) => i.topic === topic).map((i) => i.id))
            .map((id) => byId.get(id))
            .filter((i): i is ContentItem => !!i);

    const points = [...topicItems]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((i) => cardCenter(i, view));

    // Timeline view threads non-general topics from the abstract to the conclusion.
    if (topic !== 'general' && view === 'timeline') {
      const abstract = index.items.find((i) => i.type === 'abstract');
      const conclusion = index.items.find((i) => i.topic === 'general' && i.type === 'conclusion');
      if (abstract) points.unshift(cardCenter(abstract, view));
      if (conclusion) points.push(cardCenter(conclusion, view));
    }

    if (points.length < 2) continue;

    const d = smoothPath(points, view === 'timeline');
    out.push(
      `<path d="${d}" fill="none" stroke="${palette.lineColorForTopic(topic)}"` +
        ` stroke-width="${n(strokeWidth)}" stroke-opacity="0.6"/>`,
    );
  }

  return out.join('');
}

/** One rounded rect per card box: the text card plus every media sidecar. */
function cardRects(
  index: ContentIndex,
  view: 'timeline' | 'topic',
  palette: ReturnType<typeof buildTopicPalette>,
  radius: number,
): string {
  const out: string[] = [];

  for (const item of index.items) {
    const b = item.layout[view].bounds;
    const surface = palette.surfaceForTopic(item.topic);
    const rx = radius > 0 ? ` rx="${n(radius)}"` : '';

    if (item.textCard.width > 0 && item.textCard.height > 0) {
      out.push(
        `<rect x="${n(b.x + item.textCard.x)}" y="${n(b.y + item.textCard.y)}"` +
          ` width="${n(item.textCard.width)}" height="${n(item.textCard.height)}"${rx}` +
          ` fill="${surface.background}"/>`,
      );
    }

    for (const sidecar of item.sidecars) {
      if (sidecar.renderWidth <= 0 || sidecar.renderHeight <= 0) continue;
      out.push(
        `<rect x="${n(b.x + sidecar.relX)}" y="${n(b.y + sidecar.relY)}"` +
          ` width="${n(sidecar.renderWidth)}" height="${n(sidecar.renderHeight)}"${rx}` +
          ` fill="${surface.background}" fill-opacity="0.85"/>`,
      );
    }
  }

  return out.join('');
}

/**
 * Draw the whole canvas fitted into a `width` × `height` frame.
 * Returns a complete, self-contained SVG document string.
 */
export function renderCanvasSvg(index: ContentIndex, opts: PreviewOptions): string {
  const { view, width, height, scheme, config } = opts;
  const padding = opts.padding ?? 0.06;
  const palette = buildTopicPalette(index.topics, scheme);

  // Same framing the app uses for "fit everything on screen" (see lib/navigation.fitAll).
  const target = inflateRect(index.bounds[view], config.baseline.itemGap);
  const { zoom, x, y } = fitRect(target, width, height, padding);

  // Keep the connector lines at a constant on-screen weight, as the canvas does
  // at low zoom (TopicLines: 2 / zoom below zoom 0.5).
  const strokeWidth = 2 / zoom;
  const radius = 4 * config.canvas.cornerRadiusScale;

  // Approximates the card box-shadow: 0 6px 22px rgba(0,0,0,.14).
  const shadow =
    '<filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%"' +
    ' color-interpolation-filters="sRGB">' +
    `<feDropShadow dx="0" dy="${n(6 / zoom)}" stdDeviation="${n(11 / zoom)}"` +
    ' flood-color="#000000" flood-opacity="0.14"/></filter>';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"` +
    ` viewBox="0 0 ${width} ${height}">` +
    `<title>${esc(siteMetaFromIndex(index).title)}</title>` +
    `<defs>${shadow}</defs>` +
    `<rect width="${width}" height="${height}" fill="${scheme.background}"/>` +
    `<g transform="translate(${n(x)},${n(y)}) scale(${zoom})">` +
    topicLinePaths(index, view, palette, strokeWidth) +
    `<g filter="url(#cardShadow)">${cardRects(index, view, palette, radius)}</g>` +
    '</g></svg>'
  );
}
