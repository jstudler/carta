/**
 * Two-way URL ↔ state sync with browser history support.
 *
 * Two URL modes:
 * - Canvas browsing (no card focused): `?view=topic&zoom=0.02&x=100&y=200`
 * - Card focused: `?view=topic&topic=my-topic&card=my-card-title`
 *   Loading this URL auto-focuses the card and starts media playback.
 *
 * Significant navigation pushes history entries; continuous pan/zoom replaces.
 * Back/forward buttons restore the state via `popstate`.
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import { content, config } from '../content';
import { camera } from '../lib/camera';
import { fitAll, focusItem } from '../lib/navigation';
import type { ViewMode } from '../lib/types';
import type { ContentItem } from '../../shared/contentTypes';
import { siteMetaFromIndex } from '../../shared/siteMeta';

const DEBOUNCE_MS = 500;
const PUSH_THRESHOLD = 200;

/**
 * Main title from the abstract card's frontmatter. Same source the build uses
 * for the static <title> and the link-preview meta tags, so they never diverge.
 */
const mainTitle = siteMetaFromIndex(content).title;

import { toKebab } from '../lib/text';

/** Find a content item by its kebab-cased topic + title. */
function findItemByKebab(topic: string, card: string): ContentItem | undefined {
  return content.items.find(
    (i) => toKebab(i.topic) === topic && toKebab(i.title) === card,
  );
}

/** Update `document.title` based on focus state. */
function syncTitle(): void {
  const focusedId = useStore.getState().focusedId;
  if (focusedId) {
    const item = content.items.find((i) => i.id === focusedId);
    document.title = item ? `${mainTitle}: ${item.title}` : mainTitle;
  } else {
    document.title = mainTitle;
  }
}

// --- URL state types --------------------------------------------------------

interface CameraUrlState {
  mode: 'camera';
  view: ViewMode;
  x: number;
  y: number;
  zoom: number;
}

interface CardUrlState {
  mode: 'card';
  view: ViewMode;
  topic: string;
  card: string;
}

type UrlState = CameraUrlState | CardUrlState;

function readParams(search = window.location.search): UrlState | null {
  const p = new URLSearchParams(search);
  const viewRaw = p.get('view');
  const view: ViewMode = viewRaw === 'timeline' ? 'timeline' : viewRaw === 'book' ? 'book' : 'topic';

  // Card-focused URL: ?view=...&topic=...&card=...
  if (p.has('topic') && p.has('card')) {
    return { mode: 'card', view, topic: p.get('topic')!, card: p.get('card')! };
  }
  // Book view without specific card: just show the book from the top.
  if (view === 'book') {
    return { mode: 'card', view: 'book', topic: '', card: '' };
  }
  // Camera URL: ?view=...&zoom=...&x=...&y=...
  if (p.has('zoom')) {
    return {
      mode: 'camera',
      view,
      x: Number(p.get('x') ?? 0),
      y: Number(p.get('y') ?? 0),
      zoom: Number(p.get('zoom') ?? 1),
    };
  }
  return null;
}

function buildCameraQuery(view: ViewMode, zoom: number, x: number, y: number): string {
  const p = new URLSearchParams();
  p.set('view', view);
  p.set('zoom', zoom.toFixed(4));
  p.set('x', x.toFixed(1));
  p.set('y', y.toFixed(1));
  return `?${p.toString()}`;
}

function buildCardQuery(view: ViewMode, item: ContentItem): string {
  const p = new URLSearchParams();
  p.set('view', view);
  p.set('topic', toKebab(item.topic));
  p.set('card', toKebab(item.title));
  return `?${p.toString()}`;
}

/** True when navigating via popstate — suppresses the next pushState. */
let restoringFromHistory = false;

/** Last state that was pushed (used to decide push vs replace). */
let lastPushed: UrlState | null = null;

/** Restore a URL state (mount or popstate). */
function restoreState(state: UrlState): void {
  useStore.getState().setView(state.view);
  if (state.view === 'book') {
    // Book view: no camera positioning needed. Scroll handled by BookView.
    return;
  }
  if (state.mode === 'card') {
    const item = findItemByKebab(state.topic, state.card);
    if (item) {
      // Defer so the viewport size is known.
      requestAnimationFrame(() => focusItem(item, state.view));
    }
  } else {
    camera.set({ zoom: state.zoom, x: state.x, y: state.y });
  }
}

export function useUrlSync(): void {
  // Restore on mount.
  useEffect(() => {
    const params = readParams();
    if (params) {
      if (params.mode === 'camera' && Number.isFinite(params.zoom) && params.zoom > 0) {
        restoreState(params);
        lastPushed = params;
      } else if (params.mode === 'card') {
        restoreState(params);
        lastPushed = params;
      } else {
        const view = config.defaultView;
        useStore.getState().setView(view);
        requestAnimationFrame(() => fitAll(content.bounds[view], false));
      }
    } else {
      const view = config.defaultView;
      useStore.getState().setView(view);
      if (view !== 'book') {
        requestAnimationFrame(() => fitAll(content.bounds[view], false));
      }
    }
    syncTitle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist after changes (debounced) + listen for popstate.
  useEffect(() => {
    let timer: number | undefined;

    const write = (): void => {
      if (restoringFromHistory) {
        restoringFromHistory = false;
        return;
      }
      const { transform, view, focusedId } = useStore.getState();

      let query: string;
      let newState: UrlState;

      if (view === 'book') {
        // Book view manages its own URL via scroll observer in BookView.
        return;
      } else if (focusedId) {
        // Card-focused mode.
        const item = content.items.find((i) => i.id === focusedId);
        if (item) {
          query = buildCardQuery(view, item);
          newState = { mode: 'card', view, topic: toKebab(item.topic), card: toKebab(item.title) };
        } else {
          query = buildCameraQuery(view, transform.zoom, transform.x, transform.y);
          newState = { mode: 'camera', view, x: transform.x, y: transform.y, zoom: transform.zoom };
        }
      } else {
        // Free-browsing mode.
        query = buildCameraQuery(view, transform.zoom, transform.x, transform.y);
        newState = { mode: 'camera', view, x: transform.x, y: transform.y, zoom: transform.zoom };
      }

      // Decide: pushState (significant change) vs replaceState (small motion).
      let significant = !lastPushed || lastPushed.mode !== newState.mode;
      if (!significant && lastPushed) {
        if (newState.mode === 'card' && lastPushed.mode === 'card') {
          significant = newState.card !== lastPushed.card || newState.topic !== lastPushed.topic;
        } else if (newState.mode === 'camera' && lastPushed.mode === 'camera') {
          significant =
            lastPushed.view !== newState.view ||
            Math.abs(transform.x - lastPushed.x) > PUSH_THRESHOLD ||
            Math.abs(transform.y - lastPushed.y) > PUSH_THRESHOLD ||
            Math.abs(transform.zoom / (lastPushed.zoom || 1) - 1) > 0.5;
        }
      }

      if (significant) {
        window.history.pushState(newState, '', query);
        lastPushed = newState;
      } else {
        window.history.replaceState(newState, '', query);
      }
      syncTitle();
    };

    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(write, DEBOUNCE_MS);
    };

    const handlePopState = (e: PopStateEvent): void => {
      const state = (e.state as UrlState | null) ?? readParams();
      if (!state) return;
      if (state.mode === 'camera' && (!Number.isFinite(state.zoom) || state.zoom <= 0)) return;

      restoringFromHistory = true;
      lastPushed = state;
      restoreState(state);
      syncTitle();
    };

    window.addEventListener('popstate', handlePopState);
    const unsub = useStore.subscribe(schedule);
    return () => {
      window.clearTimeout(timer);
      unsub();
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);
}
