/**
 * Vite plugin: document metadata + social link preview (Open Graph / Twitter card).
 *
 *  - Renders the canvas fully zoomed out — no UI chrome, no text — into a square
 *    PNG at /og.png, plus a 1.91:1 variant at /og-wide.png for the platforms
 *    that crop square images badly (Slack, LinkedIn, X).
 *  - Serves both on the dev server so the image can be iterated on without a
 *    build, and emits them into dist/ on build.
 *  - Writes the document title, description and Open Graph / Twitter meta tags
 *    into index.html. Crawlers do not execute JavaScript, so for a static SPA
 *    these must already be in the served HTML.
 *
 * All texts come from the project, not from the app: the abstract card is the
 * project's title page, so its title / summary / institution are what a shared
 * link shows (see shared/siteMeta.ts).
 *
 * Set SITE_URL (e.g. https://carta.example.org) to enable the preview tags:
 * every Open Graph consumer requires an absolute og:image URL and silently
 * shows no preview for a relative one.
 */

import type { Plugin, ResolvedConfig } from 'vite';
import { resolveColorScheme } from '../app.config';
import { siteMetaFromIndex } from '../shared/siteMeta';
import { getContentIndex } from './content/indexCache';
import { renderPreviewImage } from './preview/renderPreviewImage';
import { resolveAppConfig } from './resolveConfig';

/** The square preview. 1200×1200 is WhatsApp/Teams' large-preview sweet spot. */
const SQUARE = { path: 'og.png', width: 1200, height: 1200 };
/** The 1.91:1 preview used by platforms that prefer a wide card. */
const WIDE = { path: 'og-wide.png', width: 1200, height: 630 };

/** Which layout the preview draws. Topic view fills a square; timeline is a thin strip. */
const PREVIEW_VIEW = 'topic' as const;

interface PreviewPluginOptions {
  /**
   * Cache-busting token appended to the image URLs. These platforms cache
   * previews aggressively and key on the exact URL, so a redeploy must change
   * it — the build commit hash is a good choice.
   */
  version: string;
}

export function previewPlugin({ version }: PreviewPluginOptions): Plugin {
  const config = resolveAppConfig();
  const scheme = resolveColorScheme(config.colorScheme);
  let viteConfig: ResolvedConfig;

  function index() {
    return getContentIndex(config, { renameMedia: viteConfig?.command === 'build' });
  }

  async function render(variant: typeof SQUARE): Promise<Buffer> {
    const image = await renderPreviewImage(index(), {
      view: PREVIEW_VIEW,
      width: variant.width,
      height: variant.height,
      scheme,
      config,
    });
    return image.buffer;
  }

  /** Absolute URL for a preview asset, cache-busted so Teams/WhatsApp refetch it. */
  function assetUrl(path: string): string {
    return `${config.site.url}/${path}?v=${version}`;
  }

  return {
    name: 'carta-preview',

    configResolved(resolved) {
      viteConfig = resolved;
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0].replace(/^\//, '');
        const variant = path === SQUARE.path ? SQUARE : path === WIDE.path ? WIDE : null;
        if (!variant) return next();
        render(variant).then(
          (buffer) => {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Length', buffer.length);
            // Always regenerate in dev so content edits show up on reload.
            res.setHeader('Cache-Control', 'no-store');
            res.end(buffer);
          },
          (err) => next(err),
        );
      });
    },

    async generateBundle() {
      if (process.env.VITEST) return;
      for (const variant of [SQUARE, WIDE]) {
        const source = await render(variant);
        this.emitFile({ type: 'asset', fileName: variant.path, source });
        // eslint-disable-next-line no-console
        console.log(
          `[preview] ${variant.path} — ${variant.width}×${variant.height}, ` +
            `${(source.length / 1024).toFixed(0)} KB`,
        );
      }
      if (!config.site.url) {
        // eslint-disable-next-line no-console
        console.warn(
          '[preview] SITE_URL is not set — link preview meta tags omitted. ' +
            'WhatsApp, Teams and Slack require an absolute og:image URL.',
        );
      }
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const meta = siteMetaFromIndex(index());

        // The project describes itself: replace the placeholder title and
        // description that ship in index.html.
        let out = html
          .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeText(meta.title)}</title>`)
          .replace(
            /(<meta\s+name="description"\s+content=")[\s\S]*?("\s*\/?>)/,
            (_m, open: string, close: string) => `${open}${escapeAttr(meta.description)}${close}`,
          );

        // Link previews need an absolute image URL, which requires SITE_URL.
        if (!config.site.url) return out.replace('<!--og-meta-->', '');

        const url = config.site.url;
        const tags: Array<[string, string]> = [
          ['og:type', 'website'],
          ['og:site_name', meta.siteName],
          ['og:title', meta.title],
          ['og:description', meta.description],
          ['og:url', `${url}/`],
          ['og:image', assetUrl(SQUARE.path)],
          ['og:image:type', 'image/png'],
          ['og:image:width', String(SQUARE.width)],
          ['og:image:height', String(SQUARE.height)],
          ['og:image:alt', `The canvas of “${meta.title}”, fully zoomed out`],
        ];
        const twitter: Array<[string, string]> = [
          ['twitter:card', 'summary_large_image'],
          ['twitter:title', meta.title],
          ['twitter:description', meta.description],
          ['twitter:image', assetUrl(WIDE.path)],
        ];
        if (meta.author) tags.push(['article:author', meta.author]);

        const markup = [
          ...tags.map(([p, c]) => `<meta property="${p}" content="${escapeAttr(c)}" />`),
          ...twitter.map(([n, c]) => `<meta name="${n}" content="${escapeAttr(c)}" />`),
          `<link rel="canonical" href="${url}/" />`,
        ].join('\n    ');

        out = out.replace('<!--og-meta-->', markup);
        return out;
      },
    },
  };
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
