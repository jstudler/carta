/**
 * Global UI + canvas state (Zustand).
 *
 * The live camera transform lives here but is applied to the DOM imperatively by
 * the canvas (via a transient subscription) so panning/zooming does NOT trigger
 * React re-renders. Components only re-render on discrete state changes (view,
 * focus, filter, search, playback).
 */

import { create } from 'zustand';
import type { ViewMode, Transform } from './lib/types';
import { content, config, itemTypes } from './content';

export interface AppState {
  /** Viewport (window) size in CSS pixels. */
  viewport: { width: number; height: number };
  /** Active view. */
  view: ViewMode;
  /** Live camera transform (screen-space translate + scale). */
  transform: Transform;
  /** Item currently zoomed/focused (media open), or null. */
  focusedId: string | null;
  /** Transform to restore when the focused item is closed. */
  restoreTransform: Transform | null;
  /** Item id whose media group is currently playing (only one at a time). */
  playingGroupId: string | null;
  /** Global mute. */
  muted: boolean;
  /** Global playback volume (0..1) applied to every media element. */
  volume: number;
  /** Whether the minimap is currently shown (desktop only). */
  mapVisible: boolean;
  /** Whether the keyboard-shortcuts overlay is open. */
  shortcutsOpen: boolean;
  /** Autoplay running. */
  autoplaying: boolean;
  /** A coordinated view/transition animation is in flight. */
  transitioning: boolean;
  /** Topic lines are hidden during view transitions (fade out/in). */
  linesHidden: boolean;
  /** Selected categories (empty set is treated as "all"). */
  activeCategories: Set<string>;
  /** Selected topics (each is a filterable topic; 'general'/abstract is exempt). */
  activeTopics: Set<string>;
  /** Selected card types. */
  activeTypes: Set<string>;
  /** Current search query. */
  search: string;
  /** Which top-left panel is open ('toc' | 'search' | null) — mutually exclusive. */
  openPanel: 'toc' | 'search' | null;
  /** Mobile sandwich menu open. */
  menuOpen: boolean;

  setViewport: (w: number, h: number) => void;
  setView: (view: ViewMode) => void;
  setTransform: (t: Transform) => void;
  setFocused: (id: string | null, restore?: Transform | null) => void;
  setPlayingGroup: (id: string | null) => void;
  toggleMute: () => void;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  toggleMap: () => void;
  setMapVisible: (v: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setAutoplaying: (a: boolean) => void;
  setTransitioning: (t: boolean) => void;
  setLinesHidden: (h: boolean) => void;
  toggleCategory: (category: string) => void;
  setAllCategories: () => void;
  clearCategories: () => void;
  setOnlyCategory: (category: string) => void;
  toggleTopic: (topic: string) => void;
  setAllTopics: () => void;
  clearTopics: () => void;
  setOnlyTopic: (topic: string) => void;
  toggleType: (type: string) => void;
  setAllTypes: () => void;
  clearTypes: () => void;
  setOnlyType: (type: string) => void;
  setSearch: (q: string) => void;
  setOpenPanel: (panel: 'toc' | 'search' | null) => void;
  setMenuOpen: (open: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  viewport: { width: window.innerWidth, height: window.innerHeight },
  view: config.defaultView,
  transform: { zoom: 1, x: 0, y: 0 },
  focusedId: null,
  restoreTransform: null,
  playingGroupId: null,
  muted: false,
  volume: 1,
  mapVisible: window.innerWidth >= config.ui.mapBreakpoint,
  shortcutsOpen: false,
  autoplaying: false,
  transitioning: false,
  linesHidden: false,
  activeCategories: new Set(content.categories),
  activeTopics: new Set(content.topics),
  activeTypes: new Set(itemTypes),
  search: '',
  openPanel: null,
  menuOpen: false,

  setViewport: (width, height) => set({ viewport: { width, height } }),
  setView: (view) => set({ view }),
  setTransform: (transform) => set({ transform }),
  setFocused: (focusedId, restore = null) =>
    set((s) => ({
      focusedId,
      restoreTransform: focusedId ? (restore ?? s.transform) : null,
    })),
  setPlayingGroup: (playingGroupId) => set({ playingGroupId }),
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setMuted: (muted) => set({ muted }),
  setVolume: (volume) => set({ volume }),
  toggleMap: () => set((s) => ({ mapVisible: !s.mapVisible })),
  setMapVisible: (mapVisible) => set({ mapVisible }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setAutoplaying: (autoplaying) => set({ autoplaying }),
  setTransitioning: (transitioning) => set({ transitioning }),
  setLinesHidden: (linesHidden) => set({ linesHidden }),
  toggleCategory: (category) =>
    set((s) => {
      const next = new Set(s.activeCategories);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return { activeCategories: next };
    }),
  setAllCategories: () => set({ activeCategories: new Set(content.categories) }),
  clearCategories: () => set({ activeCategories: new Set() }),
  setOnlyCategory: (category) => set({ activeCategories: new Set([category]) }),
  toggleTopic: (topic) =>
    set((s) => {
      const next = new Set(s.activeTopics);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return { activeTopics: next };
    }),
  setAllTopics: () => set({ activeTopics: new Set(content.topics) }),
  clearTopics: () => set({ activeTopics: new Set() }),
  setOnlyTopic: (topic) => set({ activeTopics: new Set([topic]) }),
  toggleType: (type) =>
    set((s) => {
      const next = new Set(s.activeTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { activeTypes: next };
    }),
  setAllTypes: () => set({ activeTypes: new Set(itemTypes) }),
  clearTypes: () => set({ activeTypes: new Set() }),
  setOnlyType: (type) => set({ activeTypes: new Set([type]) }),
  setSearch: (search) => set({ search }),
  setOpenPanel: (openPanel) => set({ openPanel }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
}));

/** Topics that participate in the topic filter (excludes the abstract's 'general'). */
const FILTERABLE_TOPICS = new Set(content.topics);

/**
 * Selector: is an item visible under the current category / topic / type
 * filters? Each filter is independent — an item must satisfy ALL three.
 * Items without a category, or whose topic isn't a filterable topic (e.g. the
 * abstract's 'general'), are exempt from that particular filter.
 */
export function isItemVisible(
  item: { category?: string; topic: string; type: string },
  categories: Set<string>,
  topics: Set<string>,
  types: Set<string>,
): boolean {
  const categoryOk = !item.category || categories.has(item.category);
  const topicOk = !FILTERABLE_TOPICS.has(item.topic) || topics.has(item.topic);
  const typeOk = types.has(item.type);
  return categoryOk && topicOk && typeOk;
}
