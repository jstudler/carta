/**
 * Central application configuration.
 *
 * This file is the single source of truth for build-time AND runtime tunables:
 * - colour schemes (earthy, canvas-like palettes)
 * - global baseline sizings (used by the layout algorithm at build time and by
 *   card rendering at runtime)
 * - corner placement of UI chrome (map / controls)
 * - animation + autoplay durations
 * - the content source folder and media base URL (decoupled from the app so the
 *   build can ingest a folder from anywhere and serve media from S3 / local)
 *
 * Everything here is plain data so it can be imported by the Node build pipeline
 * and by the browser bundle alike.
 */

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ColorScheme {
  /** Unique id used for selection + persisted in config. */
  id: string;
  /** Human readable name shown in tooling. */
  name: string;
  /** Page background — the "canvas paper". */
  background: string;
  /** Colour of the timeline axis + topic guide lines. */
  axis: string;
  /** Muted text (timestamps, captions, category labels). */
  muted: string;
  /** Accent used for focus rings, the minimap viewport, active controls. */
  accent: string;
  /**
   * Rotating palette of card surfaces. Cards are assigned a palette entry
   * deterministically so the canvas reads like a coherent composition.
   */
  cards: Array<{ background: string; font: string }>;
}

/**
 * Earthy palettes inspired by the user's reference palette. The first scheme is
 * the reference itself; the others are calmer / warmer / cooler variations that
 * keep the "real canvas / paper" feeling.
 */
export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'earth',
    name: 'Earth (reference)',
    background: '#CFC8BC',
    axis: '#7c7666',
    muted: '#5d574a',
    accent: '#9c6b3f',
    cards: [
      { background: '#9ec6b5', font: '#334442' },
      { background: '#383553', font: '#d1cdd8' },
      { background: '#edc180', font: '#000000' },
      { background: '#bdc8e7', font: '#000000' },
      { background: '#c98a6b', font: '#231310' },
      { background: '#6b8f8a', font: '#f0f4f2' },
      { background: '#d9b8c4', font: '#2b1a22' },
      { background: '#8a9a5b', font: '#1a1f0e' },
      { background: '#4a5a6a', font: '#dde6ee' },
      { background: '#e0d2a8', font: '#2a2412' },
    ],
  },
  {
    id: 'clay',
    name: 'Clay',
    background: '#d8cdbf',
    axis: '#8a7a66',
    muted: '#6a5d4c',
    accent: '#b5663a',
    cards: [
      { background: '#c79a76', font: '#2c211a' },
      { background: '#7a8b76', font: '#f0ece2' },
      { background: '#e3b778', font: '#2a1f12' },
      { background: '#a9b0c0', font: '#1c2230' },
      { background: '#b5663a', font: '#f5e8df' },
      { background: '#6f7d8c', font: '#eef2f6' },
      { background: '#d8b4a0', font: '#2c1c14' },
      { background: '#9aa17a', font: '#1f230f' },
      { background: '#4a3f3a', font: '#e6ddd4' },
      { background: '#e6d3ad', font: '#2e2616' },
    ],
  },
  {
    id: 'moss',
    name: 'Moss',
    background: '#c8c9ba',
    axis: '#6f7a5e',
    muted: '#525c44',
    accent: '#7d6b3c',
    cards: [
      { background: '#9bb089', font: '#27331f' },
      { background: '#3f4a3a', font: '#dfe5d4' },
      { background: '#d9c98a', font: '#2a2613' },
      { background: '#b6c1c9', font: '#1f2a2e' },
      { background: '#7d8b5e', font: '#f1f3e8' },
      { background: '#a87f57', font: '#241910' },
      { background: '#c2cbb0', font: '#2a301d' },
      { background: '#586b52', font: '#e4ead8' },
      { background: '#d6b59a', font: '#2c1d12' },
      { background: '#8f9aa0', font: '#1b2225' },
    ],
  },
  {
    id: 'dusk',
    name: 'Dusk',
    background: '#c5bcc0',
    axis: '#7a6c74',
    muted: '#5b4f57',
    accent: '#a05a6b',
    cards: [
      { background: '#b79aa6', font: '#2e1f27' },
      { background: '#3a3550', font: '#d6d1e0' },
      { background: '#e0b489', font: '#2c1f12' },
      { background: '#9fb0bd', font: '#1d272e' },
      { background: '#a05a6b', font: '#f4e6ea' },
      { background: '#6a6480', font: '#ece9f2' },
      { background: '#cda9b4', font: '#2c1d24' },
      { background: '#8a9a7e', font: '#1d2417' },
      { background: '#4b4252', font: '#e0dae6' },
      { background: '#e3cdb0', font: '#2e2516' },
    ],
  },
];

export interface AppConfig {
  /**
   * Source content folder, relative to the project root or absolute. May contain
   * subdirectories at any depth — each card's content file (.html or .md) and its
   * sidecar media must share the same directory. Override with CONTENT_DIR env var.
   */
  contentDir: string;
  /**
   * Directory for web-compatible rendered media (converted images, audio, video).
   * Keeps the source content folder clean: originals live in contentDir, web
   * variants in renderedDir. Override with RENDERED_DIR env var.
   */
  renderedDir: string;
  /**
   * Base URL media files are served from at runtime. '' → served from the same
   * origin under /content. Point this at an S3 / CDN bucket for production.
   * Override with the MEDIA_BASE_URL env var.
   */
  mediaBaseUrl: string;

  /**
   * Site identity used for social link previews (Open Graph / Twitter cards) in
   * WhatsApp, Teams, Slack, Signal, etc. The preview *texts* are not configured
   * here — they come from the project itself, i.e. the abstract card's title,
   * summary, author and institution (see shared/siteMeta.ts).
   */
  site: {
    /**
     * Absolute origin the site is deployed at, e.g. 'https://carta.example.org'
     * (no trailing slash). Every consumer of Open Graph requires an ABSOLUTE
     * image URL, so leaving this empty omits the preview meta tags entirely.
     * Override with the SITE_URL env var.
     */
    url: string;
  };

  /** Id of the active colour scheme (see COLOR_SCHEMES). */
  colorScheme: string;

  /** Corner placement for the minimap and the controls cluster. */
  corners: {
    map: Corner;
    controls: Corner;
    tableOfContents: Corner;
    search: Corner;
  };

  /** UI chrome tunables. */
  ui: {
    /** Minimap thumbnail width (px). */
    mapWidth: number;
    /** Minimap thumbnail height (px). */
    mapHeight: number;
    /**
     * Viewport width (px) at/above which the minimap is shown by default at load
     * time. Below it the map starts hidden (it can still be toggled on).
     */
    mapBreakpoint: number;
  };

  /** Tunables for elements drawn ON the canvas (cards, media boxes). */
  canvas: {
    /**
     * Corner-radius multiplier for canvas elements (cards, media boxes), 0–5.
     * 1 = the current radii, 0 = square corners, 2 = double, etc. Does NOT affect
     * UI chrome (toolbars, minimap, panels).
     */
    cornerRadiusScale: number;
    /** Topic title (the floating label at each cluster centre) appearance. */
    topicTitle: {
      /** Base font size (px) — the on-screen size while zoomed below 0.5. */
      fontSize: number;
      /**
       * Layered glow drawn straight from the glyphs in the topic's own colour.
       * Each entry is one text-shadow layer; `opacity` (0..1) tints the topic
       * accent colour, `blur` is the radius (px), `offsetX/offsetY` the offset.
       */
      shadow: { offsetX: number; offsetY: number; blur: number; opacity: number }[];
    };
  };

  /**
   * Global baseline sizings. The layout algorithm scales every card from these,
   * multiplied by per-item `size` / `font_size` / `width` settings.
   */
  baseline: {
    /** Reference area (px²) for a media card at size 1.0. Width/height derive from aspect ratio. */
    mediaArea: number;
    /** Base font size (px) for text cards at font_size 1.0. */
    fontSize: number;
    /** Base text card content width (px) at width 1.0. */
    textWidth: number;
    /** Height (px) of an audio player card at size 1.0. */
    audioHeight: number;
    /** Inner padding (px) of a card. */
    cardPadding: number;
    /** Gap (px) between sidecars grouped inside one item. */
    groupGap: number;
    /** Gap (px) between distinct items on the canvas. */
    itemGap: number;
  };

  /** Animation timings (seconds) for smooth, configurable canvas motion. */
  animation: {
    /** Pan/zoom tween when navigating between cards (arrow keys, TOC, search). */
    navigate: number;
    /** Zoom-in when a card is focused (media open). */
    focus: number;
    /** Zoom-out when a card is unfocused. */
    unfocus: number;
    /** View transition (timeline <-> topic): zoom-out → rearrange → zoom-in. */
    viewTransition: number;
  };

  /** Autoplay tunables. */
  autoplay: {
    /** Seconds a photo stays focused. */
    photoDuration: number;
    /** Seconds of reading time granted per word of text. */
    secondsPerWord: number;
    /** Minimum seconds a text card stays focused regardless of length. */
    textMinDuration: number;
    /** Lead-in before media playback starts (seconds). */
    preRoll: number;
    /** Tail after media playback ends before advancing (seconds). */
    postRoll: number;
  };

  /** Default viewport: app opens in topic view, fully zoomed out. */
  defaultView: 'timeline' | 'topic' | 'book';

  /** Print / PDF export tunables. */
  print: {
    /** Max width (mm) for image thumbnails in the PDF. */
    imageMaxWidthMm: number;
    /** Max height (mm) for image thumbnails in the PDF. */
    imageMaxHeightMm: number;
  };
}

export const APP_CONFIG: AppConfig = {
  contentDir: 'carta-sample-data',
  renderedDir: '.content-cache',
  mediaBaseUrl: '',
  site: {
    url: '',
  },
  colorScheme: 'moss',
  corners: {
    map: 'top-right',
    controls: 'top-right',
    tableOfContents: 'top-left',
    search: 'top-left',
  },
  ui: {
    mapWidth: 500,
    mapHeight: 300,
    mapBreakpoint: 800,
  },
  canvas: {
    cornerRadiusScale: 0,
    topicTitle: {
      fontSize: 18,
      shadow: [
        { offsetX: 0, offsetY: 0, blur: 6, opacity: 0 },
        { offsetX: 0, offsetY: 0, blur: 16, opacity: 1 },
        { offsetX: 0, offsetY: 0, blur: 30, opacity: 1 },
        { offsetX: 0, offsetY: 0, blur: 90, opacity: 1 },
        { offsetX: 0, offsetY: 0, blur: 150, opacity: 1 },
      ],
    },
  },
  baseline: {
    mediaArea: 150_000,
    fontSize: 18,
    textWidth: 320,
    audioHeight: 116,
    cardPadding: 20,
    groupGap: 16,
    itemGap: 120,
  },
  animation: {
    navigate: 0.8,
    focus: 0.7,
    unfocus: 0.6,
    viewTransition: 1.2,
  },
  autoplay: {
    photoDuration: 4,
    secondsPerWord: 0.35,
    textMinDuration: 3,
    preRoll: 0.5,
    postRoll: 1,
  },
  defaultView: 'book',
  print: {
    imageMaxWidthMm: 50,
    imageMaxHeightMm: 40,
  },
};

/** Resolve the active colour scheme object, falling back to the first scheme. */
export function resolveColorScheme(id: string): ColorScheme {
  return COLOR_SCHEMES.find((s) => s.id === id) ?? COLOR_SCHEMES[0];
}
