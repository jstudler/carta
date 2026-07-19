/**
 * Runtime content access. The heavy lifting (parsing, validation, layout,
 * search-corpus extraction) already happened at build time; here we just adopt
 * the finished index, build the Fuse search instance, and expose typed helpers.
 */

import Fuse from 'fuse.js';
import index from 'virtual:content-index';
import type { ContentIndex, ContentItem } from '../shared/contentTypes';
import { buildTopicPalette } from '../shared/palette';
import { APP_CONFIG, resolveColorScheme } from '../app.config';

export const content: ContentIndex = index;
export const config = APP_CONFIG;
export const colorScheme = resolveColorScheme(config.colorScheme);

/** Items keyed by id for O(1) lookup. */
export const itemsById: Map<string, ContentItem> = new Map(
  content.items.map((i) => [i.id, i]),
);

/** Fuzzy full-text search over titles + extracted body text. */
export const fuse = new Fuse(content.searchDocs, {
  keys: [
    { name: 'title', weight: 2 },
    { name: 'text', weight: 1 },
  ],
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

/**
 * Topic → colour mapping. Shared with the build-time preview-image renderer so
 * the social preview uses exactly the same palette as the live canvas.
 */
export const topicPalette = buildTopicPalette(content.topics, colorScheme);

export function paletteIndexFor(item: ContentItem): number {
  return topicPalette.paletteIndexFor(item.topic);
}

/** The card-palette background colour assigned to a topic (used for its title glow). */
export const colorForTopic = topicPalette.colorForTopic;

/** Items in chronological order (used for autoplay + arrow-key navigation). */
export const itemsByTime: ContentItem[] = [...content.items].sort(
  (a, b) => a.timestamp - b.timestamp,
);

/** Distinct card types present in the content (for the type filter). */
export const itemTypes: string[] = [...new Set(content.items.map((i) => i.type))];
