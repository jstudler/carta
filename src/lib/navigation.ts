/**
 * High-level camera navigation: fitting the whole canvas, focusing an item
 * (zoom-in), restoring after focus (zoom-out), and centring an item for
 * arrow-key navigation / autoplay. All motion is delegated to the GSAP-backed
 * camera controller so it is smooth and uses the configured durations.
 */

import type { ContentItem, Rect } from '../../shared/contentTypes';
import type { ViewMode } from './types';
import { camera } from './camera';
import { config, content, itemsByTime } from '../content';
import { useStore } from '../store';
import { mediaRegistry } from '../media/mediaRegistry';
import { fitRect, inflateRect, rectCenter, centerOn, unionRect } from '../../shared/geometry';

/** Bounding rect of an item in the given view. */
export function itemRect(item: ContentItem, view: ViewMode): Rect {
  return item.layout[view].bounds;
}

/** Zoom to frame a single item and mark it focused. */
export function focusItem(
  item: ContentItem,
  view: ViewMode,
): void {
  const state = useStore.getState();
  const { width, height } = state.viewport;
  state.setFocused(item.id, null);
  const target = fitRect(inflateRect(itemRect(item, view), 24), width, height, 0.12);
  void camera.animateTo(target, config.animation.focus);
  // Auto-start media playback when focusing a card with audio/video.
  if (item.hasAudio) {
    mediaRegistry.requestAutoplay(item.id);
  }
}

/** Smoothly frame an item WITHOUT focusing it (used by TOC + search results). */
export function goToItem(item: ContentItem, view: ViewMode): void {
  const { width, height } = useStore.getState().viewport;
  const target = fitRect(inflateRect(itemRect(item, view), config.baseline.itemGap), width, height, 0.2);
  void camera.animateTo(target, config.animation.navigate);
}

/** Fit a view's whole-canvas bounds into the viewport. */
export function fitAll(bounds: Rect, animate = true): void {
  const { width, height } = useStore.getState().viewport;
  const target = fitRect(inflateRect(bounds, config.baseline.itemGap), width, height, 0.06);
  if (animate) void camera.animateTo(target, config.animation.viewTransition);
  else camera.set(target);
}

/** Clear the focused state and pause media. */
export function blurFocused(): void {
  const { focusedId } = useStore.getState();
  if (focusedId) mediaRegistry.pauseAll();
  useStore.getState().setFocused(null);
}

/**
 * Centre an item in the viewport, keeping the current zoom unless `zoom` is
 * given. Used by arrow-key navigation (mostly horizontal motion) and autoplay.
 */
export function centerItem(
  item: ContentItem,
  view: ViewMode,
  opts: { zoom?: number; duration?: number } = {},
): Promise<void> {
  const { width, height } = useStore.getState().viewport;
  const center = rectCenter(itemRect(item, view));
  const zoom = opts.zoom ?? camera.get().zoom;
  const target = centerOn(center, zoom, width, height);
  return camera.animateTo(target, opts.duration ?? config.animation.navigate);
}

/**
 * Switch between timeline and topic view with the required choreography:
 * 1. zoom out far enough to frame BOTH layouts (so the rearrangement is fully
 *    in view), then
 * 2. swap the layout — every card glides from its old to its new position via a
 *    CSS transition (the `canvas-world--morphing` class), so the user sees the
 *    items travel across the canvas, then
 * 3. zoom in to frame the destination overview.
 */
export async function switchView(
  to: ViewMode,
  boundsFor: (v: ViewMode) => Rect,
): Promise<void> {
  const store = useStore.getState();
  if (store.view === to || store.transitioning) return;
  store.setTransitioning(true);
  if (store.focusedId) {
    mediaRegistry.pauseAll();
    store.setFocused(null);
  }
  const { width, height } = store.viewport;
  const morph = config.animation.viewTransition;
  const union = unionRect(boundsFor(store.view), boundsFor(to));
  const framing = fitRect(inflateRect(union, config.baseline.itemGap), width, height, 0.06);

  // 1. Fade out topic lines. This also applies `canvas-world--morphing`, which
  //    hides card text/images and promotes each card to its own layer. Give the
  //    browser two frames to commit that (a one-off style/layout pass) BEFORE any
  //    motion starts, so the hitch lands on a still frame instead of mid-glide.
  store.setLinesHidden(true);
  await nextFrame();
  await nextFrame();
  await delay(200); // matches CSS transition duration

  // 2. Zoom/pan to the shared framing.
  await camera.animateTo(framing, morph * 0.5);

  // 3. Swap layout; cards glide to their new spots (CSS transition on .item).
  store.setView(to);
  await delay(morph * 1000);

  // 4. Settle camera.
  await camera.animateTo(framing, morph * 0.5);

  // 5. Drop the morph state first — this de-promotes the card layers and reveals
  //    the card contents again — then fade the topic lines back in a frame
  //    later, so the two don't land on the same frame. Both happen after all
  //    motion has stopped, so any cost lands on a still frame.
  store.setTransitioning(false);
  await nextFrame();
  store.setLinesHidden(false);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** The deterministic navigation/autoplay order for a view. */
export function navigationOrder(view: ViewMode): ContentItem[] {
  if (view === 'timeline') return itemsByTime;
  const byId = new Map(content.items.map((i) => [i.id, i]));
  const ordered: ContentItem[] = [];
  if (content.abstractId) {
    const a = byId.get(content.abstractId);
    if (a) ordered.push(a);
  }
  for (const cluster of content.clusters) {
    const members = cluster.itemIds
      .map((id) => byId.get(id))
      .filter((i): i is ContentItem => !!i)
      .sort((a, b) => a.timestamp - b.timestamp);
    ordered.push(...members);
  }
  return ordered;
}

/** Index of the item whose centre is closest to the viewport centre. */
export function mostCenteredIndex(order: ContentItem[], view: ViewMode): number {
  const t = camera.get();
  const { width, height } = useStore.getState().viewport;
  const cx = width / 2;
  const cy = height / 2;
  let best = 0;
  let bestDist = Infinity;
  order.forEach((item, i) => {
    const c = rectCenter(itemRect(item, view));
    const sx = c.x * t.zoom + t.x;
    const sy = c.y * t.zoom + t.y;
    const d = Math.hypot(sx - cx, sy - cy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/**
 * Step to the next/previous card. Motion is horizontal-first: the X always
 * centres on the target, while Y is only moved if the target would otherwise sit
 * off-screen (satisfying "mostly move horizontally, up/down only if out of view").
 */
export function navigateStep(view: ViewMode, direction: 1 | -1): void {
  const order = navigationOrder(view);
  if (order.length === 0) return;
  const current = mostCenteredIndex(order, view);
  const nextIndex = clampIndex(current + direction, order.length);
  const item = order[nextIndex];

  const t = camera.get();
  const { width, height } = useStore.getState().viewport;
  const c = rectCenter(itemRect(item, view));
  const rect = itemRect(item, view);

  const targetX = width / 2 - c.x * t.zoom;
  // Keep Y unless the card would fall outside the viewport at the new position.
  const topScreen = rect.y * t.zoom + t.y;
  const bottomScreen = (rect.y + rect.height) * t.zoom + t.y;
  let targetY = t.y;
  if (topScreen < 0 || bottomScreen > height) {
    targetY = height / 2 - c.y * t.zoom;
  }
  void camera.animateTo({ zoom: t.zoom, x: targetX, y: targetY }, config.animation.navigate);
}

function clampIndex(i: number, length: number): number {
  if (i < 0) return 0;
  if (i >= length) return length - 1;
  return i;
}
