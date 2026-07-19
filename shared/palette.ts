/**
 * Topic → colour mapping, shared by the browser canvas and the build-time
 * preview-image renderer. Pure data transformation over an already-built
 * content index; no DOM, no React, no store.
 */

import type { ColorScheme } from '../app.config';
import { darken, luminance } from './curves';

/** A card surface: background fill plus the font colour that reads on it. */
export interface Surface {
  background: string;
  font: string;
}

/**
 * General-topic cards (including the abstract) use a dark surface with a bright
 * font rather than a rotating palette entry, so they read as structural anchors.
 */
export const GENERAL_SURFACE: Surface = { background: '#23202b', font: '#ece8f0' };

export interface TopicPalette {
  /** Palette slot assigned to an item's topic. */
  paletteIndexFor(topic: string): number;
  /** The card-palette background colour assigned to a topic. */
  colorForTopic(topic: string): string;
  /** The full card surface (background + font) for a topic. */
  surfaceForTopic(topic: string): Surface;
  /** A line colour for a topic that stays visible against the canvas. */
  lineColorForTopic(topic: string): string;
}

/**
 * Assign a card palette index PER TOPIC so every card of a topic shares one
 * colour scheme. Topics are mapped to palette entries in stable, sorted order;
 * the abstract (topic 'general') uses the last palette as a neutral accent.
 */
export function buildTopicPalette(topics: string[], scheme: ColorScheme): TopicPalette {
  const index = new Map<string, number>(
    topics.map((topic, i) => [topic, i % scheme.cards.length]),
  );

  const paletteIndexFor = (topic: string): number => {
    const mapped = index.get(topic);
    if (mapped !== undefined) return mapped;
    // Fallback (e.g. the abstract's 'general' topic): last palette entry.
    return scheme.cards.length - 1;
  };

  const colorForTopic = (topic: string): string => {
    const idx = index.get(topic);
    if (idx === undefined) return scheme.accent;
    return scheme.cards[idx].background;
  };

  const surfaceForTopic = (topic: string): Surface =>
    topic === 'general' ? GENERAL_SURFACE : scheme.cards[paletteIndexFor(topic)];

  /**
   * - Dark backgrounds (light/white font): use the background colour as-is.
   * - Light backgrounds (dark/black font): darken the background colour so it's
   *   visible against the canvas while keeping the same hue.
   */
  const lineColorForTopic = (topic: string): string => {
    if (topic === 'general') return GENERAL_SURFACE.background;
    const entry = scheme.cards[paletteIndexFor(topic)];
    if (!entry) return colorForTopic(topic);
    if (luminance(entry.background) > 0.5) return darken(entry.background, 0.4);
    return entry.background;
  };

  return { paletteIndexFor, colorForTopic, surfaceForTopic, lineColorForTopic };
}
