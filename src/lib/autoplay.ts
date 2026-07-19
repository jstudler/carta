/**
 * Autoplay — guides the viewer through the research automatically.
 *
 * Order: timeline view → strictly chronological; topic view → cluster by cluster,
 * chronological within each. For every item the camera GLIDES to frame it in one
 * continuous motion (a single eased tween that arcs through an overview zoom — no
 * clumsy "zoom out, wait, zoom back in"), then dwells:
 *   - media  → plays it (after a pre-roll) and waits for the end (plus post-roll)
 *   - photo  → a fixed, configurable duration
 *   - text   → a duration proportional to its word count
 *
 * Any manual pan/zoom flips the `autoplaying` flag off, which the loop observes
 * and exits cleanly.
 */

import type { ContentItem } from '../../shared/contentTypes';
import type { ViewMode } from './types';
import { content, itemsByTime, config } from '../content';
import { useStore } from '../store';
import { camera } from './camera';
import { itemRect, blurFocused } from './navigation';
import { fitRect, inflateRect } from '../../shared/geometry';
import { mediaRegistry } from '../media/mediaRegistry';
import { wordCount } from './text';

let runToken = 0;

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/** Build the play order for the given view. */
export function autoplayOrder(view: ViewMode): ContentItem[] {
  const byId = new Map(content.items.map((i) => [i.id, i]));
  const abstract = content.abstractId ? byId.get(content.abstractId) : undefined;

  if (view === 'timeline') {
    return itemsByTime;
  }
  // Topic view: abstract first, then each cluster in order, chronological within.
  const ordered: ContentItem[] = [];
  if (abstract) ordered.push(abstract);
  for (const cluster of content.clusters) {
    const members = cluster.itemIds
      .map((id) => byId.get(id))
      .filter((i): i is ContentItem => !!i)
      .sort((a, b) => a.timestamp - b.timestamp);
    ordered.push(...members);
  }
  return ordered;
}

/** How long to dwell on a non-media item. */
function dwellSeconds(item: ContentItem): number {
  const hasPicture = item.sidecars.some((s) => s.kind === 'picture');
  if (item.text) {
    return Math.max(config.autoplay.textMinDuration, wordCount(item.text) * config.autoplay.secondsPerWord);
  }
  if (hasPicture) return config.autoplay.photoDuration;
  return config.autoplay.photoDuration;
}

/** Start autoplay from the item nearest the current viewport centre. */
export async function startAutoplay(view: ViewMode, fromId?: string): Promise<void> {
  const store = useStore.getState();
  store.setAutoplaying(true);
  const token = ++runToken;

  // Where the user kicked autoplay off — we restore to roughly here at the end.
  const entryTransform = camera.get();

  const order = autoplayOrder(view);
  let startIndex = 0;
  if (fromId) {
    const idx = order.findIndex((i) => i.id === fromId);
    if (idx >= 0) startIndex = idx;
  }

  for (let i = startIndex; i < order.length; i += 1) {
    if (token !== runToken || !useStore.getState().autoplaying) break;
    const item = order[i];

    // Glide to frame the item in ONE smooth, continuous motion (camera.glide
    // arcs through an overview zoom internally — no zoom-out/wait/zoom-in).
    const { width, height } = useStore.getState().viewport;
    const target = fitRect(inflateRect(itemRect(item, view), 24), width, height, 0.12);
    useStore.getState().setFocused(item.id, entryTransform);
    await camera.glide(target, config.animation.navigate);
    if (token !== runToken || !useStore.getState().autoplaying) break;

    const hasMedia = item.hasAudio;
    if (hasMedia) {
      await sleep(config.autoplay.preRoll);
      const group = mediaRegistry.group(item.id);
      if (group.master) {
        await group.play();
        await group.whenEnded();
      } else {
        await sleep(config.autoplay.photoDuration);
      }
      await sleep(config.autoplay.postRoll);
    } else {
      await sleep(dwellSeconds(item));
    }
    if (token !== runToken || !useStore.getState().autoplaying) break;
  }

  if (token === runToken) {
    blurFocused();
    useStore.getState().setAutoplaying(false);
  }
}

/** Stop autoplay (also triggered implicitly by any manual interaction). */
export function stopAutoplay(): void {
  runToken += 1;
  useStore.getState().setAutoplaying(false);
}
