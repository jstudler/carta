/**
 * Memoized access to the built content index.
 *
 * Building the index is expensive (parses every source file, probes media with
 * sharp/ffprobe, runs both layout algorithms). Several Vite plugins need it —
 * `contentPlugin` to emit `virtual:content-index`, `previewPlugin` to render the
 * social preview image — so it is cached here and shared rather than rebuilt
 * per consumer. The dev-server watcher calls `invalidateContentIndex()` when
 * anything under the content or rendered directory changes.
 */

import type { AppConfig } from '../../app.config';
import { buildContentIndex } from './buildIndex';
import type { ContentIndex } from '../../shared/contentTypes';

interface CacheEntry {
  key: string;
  index: ContentIndex;
}

let cache: CacheEntry | null = null;

/**
 * Build the content index, or return the cached one. The cache is keyed on the
 * inputs that change the result, so a dev build and a production build (which
 * renames media) never share an entry.
 */
export function getContentIndex(
  config: AppConfig,
  opts: { renameMedia?: boolean } = {},
): ContentIndex {
  const key = `${config.contentDir}|${config.renderedDir}|${opts.renameMedia ? 'renamed' : 'raw'}`;
  if (cache && cache.key === key) return cache.index;
  const index = buildContentIndex(config, opts);
  cache = { key, index };
  return index;
}

/** Drop the cached index so the next `getContentIndex` call rebuilds it. */
export function invalidateContentIndex(): void {
  cache = null;
}
