/**
 * Vite plugin: build-time content pipeline + media serving.
 *
 *  - Exposes the pre-built content index as the virtual module
 *    `virtual:content-index` (imported by the app).
 *  - In dev, serves media files from both the rendered cache directory AND the
 *    source content tree (recursive) under `/content/*`, and triggers a full
 *    reload when any content file changes.
 *  - On build, copies every media file (from the rendered cache and any media
 *    still in the source tree) into `dist/content/` so the static output is
 *    self-contained (and can equally be re-pointed at S3 via MEDIA_BASE_URL).
 *
 * The content folder is fully decoupled from the app: set CONTENT_DIR to ingest
 * any folder, RENDERED_DIR for the web-optimised media cache, and MEDIA_BASE_URL
 * to serve media from a CDN / S3 bucket instead.
 */

import { readdirSync, existsSync, mkdirSync, copyFileSync, statSync, rmSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { ContentError } from './content/buildIndex';
import { getContentIndex, invalidateContentIndex } from './content/indexCache';
import { wordCount } from './content/parse';
import { resolveAppConfig } from './resolveConfig';

const VIRTUAL_ID = 'virtual:content-index';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** Max file size (bytes) for deployed media — matches convert-media default. */
const MAX_DEPLOY_SIZE = 25 * 1024 * 1024;

/** All media extensions recognised by the dev server. */
const MEDIA_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg',
  '.mov', '.mp4', '.webm', '.m4v', '.mkv',
  '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac',
]);

/**
 * Web-only extensions deployed to dist. Raw originals (.mov, .wav, .png, .tiff,
 * .heic, etc.) are excluded — only converted formats go into the production build.
 */
const DEPLOY_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg',
  '.mp4', '.webm',
  '.mp3', '.ogg', '.opus',
]);

/** True for files that should be skipped (drafts, hidden, orig files). */
function isIgnored(filename: string): boolean {
  return (
    filename.startsWith('_draft_') ||
    filename.startsWith('.') ||
    /\.orig\.[^.]+$/i.test(filename)
  );
}

/** List deployable media in a flat directory. */
function listMediaFlat(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(
    (f) => MEDIA_EXT.has(extname(f).toLowerCase()) && !isIgnored(f),
  );
}

/**
 * Recursively collect deployable media from a directory tree.
 * Returns `{ relPath, absPath }` for each file found.
 */
function walkMedia(
  rootDir: string,
  dir: string = rootDir,
): { relPath: string; absPath: string }[] {
  if (!existsSync(dir)) return [];
  const results: { relPath: string; absPath: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (isIgnored(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMedia(rootDir, full));
    } else if (MEDIA_EXT.has(extname(entry.name).toLowerCase())) {
      results.push({ relPath: entry.name, absPath: full });
    }
  }
  return results;
}

/**
 * Build a map of filename → absolute path, giving precedence to the rendered
 * (cache) directory over the source content tree — unless the rendered file
 * exceeds the size limit while the source file does not.
 * Only includes web-deployable formats (DEPLOY_EXT).
 */
function collectDeployableMedia(contentDir: string, renderedDir: string): Map<string, string> {
  const map = new Map<string, string>();
  // Source tree first (subdirectories flattened to basename).
  for (const { relPath, absPath } of walkMedia(contentDir)) {
    if (DEPLOY_EXT.has(extname(relPath).toLowerCase())) {
      if (statSync(absPath).size > MAX_DEPLOY_SIZE) continue; // skip oversized source files
      map.set(relPath, absPath);
    }
  }
  // Rendered dir wins — except when the rendered file is oversized and the
  // source is not (e.g. re-encoding made the file larger than the original).
  for (const name of listMediaFlat(renderedDir)) {
    if (DEPLOY_EXT.has(extname(name).toLowerCase())) {
      const renderedPath = join(renderedDir, name);
      const renderedSize = statSync(renderedPath).size;
      const srcPath = map.get(name);
      if (renderedSize > MAX_DEPLOY_SIZE) {
        if (srcPath) {
          // Source is already in the map and within limits — keep it.
          continue;
        }
        // No valid source fallback — skip entirely.
        continue;
      }
      map.set(name, renderedPath);
    }
  }
  return map;
}

export function contentPlugin(): Plugin {
  const config = resolveAppConfig();
  const contentDir = resolve(config.contentDir);
  const renderedDir = resolve(config.renderedDir);
  let viteConfig: ResolvedConfig;
  let cachedRenameMap: Record<string, string> = {};

  function buildOrThrow(): string {
    try {
      const isProd = viteConfig?.command === 'build';
      const index = getContentIndex(config, { renameMedia: isProd });
      // Cache the rename map for the copy step in closeBundle.
      cachedRenameMap = index.mediaRenameMap ?? {};
      // eslint-disable-next-line no-console
      console.log(`[content] indexed ${index.items.length} items from ${contentDir}`);

      // --- Metrics ---
      let totalChars = 0;
      let totalWords = 0;
      const mediaByKind: Record<string, number> = {};
      let totalMedia = 0;
      for (const item of index.items) {
        // Body text
        totalChars += item.text.length;
        totalWords += wordCount(item.text);
        // Title
        totalChars += item.title.length;
        totalWords += wordCount(item.title);
        for (const sc of item.sidecars) {
          // Sidecar descriptions
          if (sc.description) {
            totalChars += sc.description.length;
            totalWords += wordCount(sc.description);
          }
          // Media count
          if (sc.kind !== 'text') {
            mediaByKind[sc.kind] = (mediaByKind[sc.kind] ?? 0) + 1;
            totalMedia++;
          }
        }
      }
      const kindBreakdown = Object.entries(mediaByKind)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, n]) => `${k}: ${n}`)
        .join(', ');
      // eslint-disable-next-line no-console
      console.log(
        `[content] ${totalChars.toLocaleString()} chars, ${totalWords.toLocaleString()} words | ` +
          `${totalMedia} media files (${kindBreakdown})`,
      );

      // Strip the rename map from the runtime bundle (not needed in browser).
      const { mediaRenameMap: _, ...runtimeIndex } = index;
      return `export default ${JSON.stringify(runtimeIndex)};`;
    } catch (err) {
      if (err instanceof ContentError) {
        throw new Error(`[content] validation failed: ${err.message}`);
      }
      throw err;
    }
  }

  /** Resolve a media request to a file on disk. Checks rendered dir first, then walks source. */
  function resolveMediaFile(name: string): string | null {
    // 1. Rendered cache (flat).
    const cached = join(renderedDir, name);
    if (cached.startsWith(renderedDir) && existsSync(cached)) return cached;
    // 2. Source tree (may be in a subdirectory — walk to find it by basename).
    const media = collectDeployableMedia(contentDir, renderedDir);
    const abs = media.get(name);
    if (abs && existsSync(abs)) return abs;
    return null;
  }

  return {
    name: 'carta-content',
    configResolved(resolved) {
      viteConfig = resolved;
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildOrThrow();
      return null;
    },
    configureServer(server) {
      // Serve media files from the rendered cache and source content tree during dev.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/content/')) return next();
        const name = decodeURIComponent(req.url.slice('/content/'.length).split('?')[0]);
        const filePath = resolveMediaFile(name);
        if (!filePath) return next();
        const ext = extname(filePath).toLowerCase();
        res.setHeader('Content-Type', mimeFor(ext));
        res.setHeader('Accept-Ranges', 'bytes');
        streamFile(req, res, filePath);
      });

      // Reload when any content file changes. Watch both source and rendered dirs.
      server.watcher.add(contentDir);
      if (existsSync(renderedDir)) server.watcher.add(renderedDir);
      let pending: ReturnType<typeof setTimeout> | null = null;
      const reload = (file: string) => {
        const resolved = resolve(file);
        if (!resolved.startsWith(contentDir) && !resolved.startsWith(renderedDir)) return;
        if (pending) clearTimeout(pending);
        pending = setTimeout(() => {
          pending = null;
          invalidateContentIndex();
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) {
            const seen = new Set<typeof mod>();
            server.moduleGraph.invalidateModule(mod, seen, Date.now(), true);
            for (const importer of mod.importers) {
              server.moduleGraph.invalidateModule(importer, seen, Date.now(), true);
            }
          }
          server.ws.send({ type: 'full-reload', path: '*' });
        }, 80);
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
    },
    closeBundle() {
      // Skip during tests (Vitest loads the Vite config but runs no real build).
      if (process.env.VITEST) return;
      // Skip copying when media is served from an external base URL.
      if (config.mediaBaseUrl) return;
      const outDir = resolve(viteConfig.root, viteConfig.build.outDir, 'content');
      // Start clean so renamed/removed media never linger from a previous build.
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      const media = collectDeployableMedia(contentDir, renderedDir);
      let copied = 0;
      const hasRenameMap = Object.keys(cachedRenameMap).length > 0;
      for (const [name, absPath] of media) {
        if (hasRenameMap) {
          // Only copy files that are referenced by the content index.
          const deployName = cachedRenameMap[name];
          if (!deployName) continue; // Skip unreferenced files.
          copyFileSync(absPath, join(outDir, deployName));
        } else {
          copyFileSync(absPath, join(outDir, name));
        }
        copied += 1;
      }
      // eslint-disable-next-line no-console
      console.log(`[content] copied ${copied} media files to ${outDir}`);
      // Warn about any files in dist/content that exceed the deploy size limit.
      const oversized: string[] = [];
      for (const f of readdirSync(outDir)) {
        const fp = join(outDir, f);
        const size = statSync(fp).size;
        if (size > MAX_DEPLOY_SIZE) {
          oversized.push(`${f} (${(size / 1024 / 1024).toFixed(1)} MB)`);
        }
      }
      if (oversized.length) {
        const limit = MAX_DEPLOY_SIZE / 1024 / 1024;
        // eslint-disable-next-line no-console
        console.warn(
          `[content] WARNING: ${oversized.length} file(s) in dist exceed ${limit} MB limit:\n` +
            oversized.map((f) => `  - ${f}`).join('\n'),
        );
      }
    },
  };
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
    '.mov': 'video/quicktime', '.mp4': 'video/mp4', '.webm': 'video/webm',
    '.m4v': 'video/x-m4v', '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.ogg': 'audio/ogg', '.opus': 'audio/opus', '.wav': 'audio/wav', '.flac': 'audio/flac',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Minimal range-aware file streamer (enables video/audio seeking in dev). */
function streamFile(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  filePath: string,
): void {
  // Lazy import to keep this Node-only code out of the browser bundle.
  import('node:fs').then((fs) => {
    const total = statSync(filePath).size;
    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match && match[1] ? parseInt(match[1], 10) : 0;
      const end = match && match[2] ? parseInt(match[2], 10) : total - 1;
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', total);
      fs.createReadStream(filePath).pipe(res);
    }
  });
}
