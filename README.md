# Carta

*Carta* — from the Italian for **paper**, **card**, and **map** — is a static,
zoomable canvas for presenting artistic research online. Research items (text,
photos, videos, audio) are laid out as **cards** on a large, pannable surface —
like pinning work to a studio wall — and explored the way you would a **map**:
scroll, pinch, drag, double-click.

Three views give structure to the material:

- **Timeline view** — a research timeline with an adaptive, human-readable axis.
- **Topic view** — research topics clustered around the project abstract.
- **Book view** — an article-style reading layout with all content flowing sequentially.

Everything heavy (parsing, validation, media measurement, layout, the search
index) happens **at build time**, so the browser only ever loads a finished
content index. The runtime stays light enough for mobile while feeling smooth on
a GPU-composited canvas.

## Features

- Maps-like pan/zoom (wheel, trackpad pinch, touch, drag, double-click).
- Smooth, configurable view transitions and autoplay (GSAP).
- Synced multi-video playback per item; only one media group plays at a time.
- Plyr players (play/pause, scrubber, volume, time) revealed on zoom-in.
- Card types: normal, **abstract**, **conclusion** (thick border), **imponderable**
  (❓❗), **reflection** (🪞).
- Minimap, table of contents, fuzzy search (Fuse.js), category filter.
- URL state sync (share a link to reproduce a view; restores on load).
- Keyboard: ←/→ navigate cards, Space autoplay/pause, Esc zoom-out.
- Mobile: chrome collapses behind a sandwich menu with an abstract info panel.
- A4 PDF export via a dedicated, didactic print layout (`window.print()`).
- Configurable earthy colour schemes, baseline sizings, and UI corners.

## Tech stack

React 19 + TypeScript · Vite 6 · Tailwind CSS v4 · `@use-gesture/react` · GSAP ·
Zustand · Fuse.js · Plyr · `gray-matter` + Ajv + `image-size` + `ffprobe`
(build-time) · `sharp` + FFmpeg (media tooling). All open-source and free to
publish.

## Content model

One `.html` file per item, with YAML frontmatter (validated against
`content-item.schema.json`) followed by an HTML body. Media files sit alongside
the HTML, prefixed with its stem, and are listed under `sidecars`.

```html
---
title: Projector Tests on Curved Surfaces
date: 2025-06-22
topic: projection-mapping
category: experiment
type: normal
sidecars:
  - filename: projection-mapping_2025-06-22--140000.jpg
    kind: picture
    description: Light streaks from short-throw projector on plaster form
    size: 1.2
  - filename: projection-mapping_2025-06-22--141500.mp4
    kind: video
    description: Pulsing glow animation test on curved surface
---
<p>Set up a series of projection tests using a short-throw projector …</p>
```

Rules enforced at build time:

- Each item needs an HTML body **or** at least one sidecar.
- Sidecar filenames must be prefixed with the item stem.
- Each topic has **exactly one** `conclusion`, and it must be the newest entry.
- `_abstract.html` is the special project abstract (`type` inferred, frontmatter
  optional).

Sizing: text cards use `font_size` (type scale) and `width` (column width / line
breaks). Media uses only `size` (area scale, aspect ratio always preserved).
Global baselines live in `app.config.ts`.

## Decoupled content folder

The app and the content are independent. Point the build at any folder:

```bash
CONTENT_DIR=/path/to/my-content npm run build
```

Serve media from S3 / a CDN instead of bundling it (output stays compatible with
Cloudflare Pages and S3):

```bash
MEDIA_BASE_URL=https://cdn.example.com/research npm run build
```

With no `MEDIA_BASE_URL`, media is copied into `dist/content/` so the static
output is self-contained.

## Link previews

Sharing the site on WhatsApp, Teams, Slack or Signal shows a preview card. The
build renders it from your content — no headless browser involved: the layout is
already computed in Node, so the canvas is drawn fully zoomed out as a square
`og.png` (1200×1200) plus a wide `og-wide.png` (1200×630). UI chrome and card
text are omitted, so the image reads as an abstract poster of the canvas.

The preview title, description and publisher come from the **abstract card's**
frontmatter (`title`, `summary`, `institution` / `author`), which also becomes
the document `<title>`. Nothing to configure except where the site is deployed:

```bash
SITE_URL=https://carta.example.org npm run build
```

`SITE_URL` is required — every Open Graph consumer rejects a relative image URL.
Without it the images are still generated but the meta tags are skipped, and the
build says so. Both images are also served by `npm run dev` at `/og.png` and
`/og-wide.png`, so you can iterate on them without building.

## Getting started

```bash
npm install        # install dependencies
npm run dev        # dev server with HMR (re-indexes on content changes)
npm run build      # type-check + produce static output in dist/
npm run preview    # preview the production build
```

Open the dev server URL. The app starts in topic view, fully zoomed out.

By default, the dev server uses the bundled `carta-sample-data/` submodule. To use a
different content folder, set `CONTENT_DIR` (see [Decoupled content folder](#decoupled-content-folder)).

## Sample data

A fictional sample dataset is included as a git submodule at `carta-sample-data/`
([jstudler/carta-sample-data](https://github.com/jstudler/carta-sample-data)).
It contains a complete project about "Kinetic Light Sculpture" with 5 topics,
34 cards, and procedurally generated media — useful for exploring the app or
as a starting point for your own content.

```bash
# Initialise the submodule after cloning
git submodule update --init

# The dev server uses it by default
npm run dev
```

## Testing

```bash
npm test           # run the unit + integration test suite (Vitest)
npm run test:watch # watch mode
npm run typecheck  # TypeScript only
```

Helper functions (date/label formatting, geometry, sizing, layout, frontmatter
validation, HTML→text) are unit tested; an integration test runs the full
pipeline over the `carta-sample-data/` submodule.

## Media conversion tooling

Produce web-safe, cross-browser encodings (Chrome, Chromium, Firefox, Edge,
Brave, WebKit). Requires FFmpeg on `PATH` for media; `sharp` (installed) for
images. Originals are never modified.

```bash
# Video → MP4 (H.264) + WebM (VP9); audio → M4A (AAC) + WebM (Opus); gif → video
npm run convert:media -- carta-sample-data                   # writes alongside sources
npm run convert:media -- carta-sample-data out-dir             # or to a separate folder
npm run convert:media -- carta-sample-data --max-size-mb=22    # reduces max size to approx 22 MB

# Images → AVIF + WebP + JPEG fallback (EXIF-corrected, size-capped)
npm run convert:images -- carta-sample-data
npm run convert:images -- carta-sample-data out-dir 2200
```

## PDF export

Click the printer button (or the browser's print) to export an A4-friendly,
human-readable document — abstract first, then each topic chronologically with
its conclusion highlighted and loose ends / reflections marked. This is the
didactic outline, not a screenshot of the canvas.

## Configuration

`app.config.ts` is the single source of truth for:

- `colorScheme` and the available `COLOR_SCHEMES` (earthy, canvas-like palettes).
- `baseline` sizings (media area, font size, text width, audio height, gaps).
- `animation` durations (navigate, focus, unfocus, view transition).
- `autoplay` durations (photo dwell, seconds-per-word, pre/post-roll).
- `corners` for the minimap, controls, TOC and search.
- `contentDir` / `mediaBaseUrl` defaults (overridable via env vars).

## Deployment

`npm run build` emits a fully static `dist/`. Deploy to Cloudflare Pages,
Netlify, Vercel or GitHub Pages. For an S3 media backend, build with
`MEDIA_BASE_URL` pointing at the bucket/CDN and upload the media files there.

### Deploy to Cloudflare Pages

```bash
npx wrangler pages project create my-artistic-research-page --production-branch main
npm run build
npx wrangler pages deploy dist --project-name my-artistic-research-page
```

## Project structure

```text
app.config.ts            # central configuration + colour schemes
content-item.schema.json # frontmatter JSON schema
shared/                  # types + pure helpers shared by build & runtime
tools/
  contentPlugin.ts       # Vite plugin: virtual:content-index + media serving
  content/               # parse, validate, measure, size, layout, build index
  convert/               # FFmpeg + sharp conversion tooling
src/
  canvas/                # Canvas, Card, MediaBox, TimelineAxis, TopicLabels
  media/                 # Plyr wrapper, SyncGroup, media registry
  ui/                    # Controls, MiniMap, TOC, Search, Filter, MobileMenu, Print
  lib/                   # camera, navigation, autoplay, geometry glue
  hooks/                 # URL sync, keyboard, media query
tests/                   # Vitest unit + integration tests
```

## License

This project is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later).

If you deploy a modified version of this software as a network service, you must
make the complete source code available to its users under the same license. For
commercial licensing enquiries, please contact the author.
