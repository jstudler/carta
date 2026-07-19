/**
 * convert-images.mjs — generate web-optimised images with `sharp`.
 *
 * For every source image it writes modern formats with a universal fallback:
 *   - .avif (best compression, supported by all current major browsers)
 *   - .webp (broad support, good compression)
 *   - .jpg  (universal fallback)
 *
 * EXIF orientation is auto-applied and images are capped to a sensible max edge
 * so the canvas stays light on mobile. Source filenames (and their item prefix)
 * are preserved. Originals are never modified. sharp is open-source + free.
 *
 * Usage:
 *   node tools/convert/convert-images.mjs <source-dir> [output-dir] [maxEdge]
 */

import { readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, extname, basename, resolve, relative } from 'node:path';
import sharp from 'sharp';

const [, , srcArg, outArg, maxEdgeArg] = process.argv;
if (!srcArg) {
  console.error('Usage: node tools/convert/convert-images.mjs <source-dir> [output-dir] [maxEdge]');
  process.exit(1);
}

const SRC = resolve(srcArg);
const OUT = resolve(outArg ?? srcArg);
const MAX_EDGE = Number(maxEdgeArg ?? 2200);
const INPUT_EXT = new Set(['.jpg', '.jpeg', '.png', '.tiff', '.webp', '.heic', '.heif']);

mkdirSync(OUT, { recursive: true });

/** Recursively collect image files as absolute paths. */
function walkImages(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkImages(full));
    } else if (INPUT_EXT.has(extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

const filePaths = walkImages(SRC);
if (filePaths.length === 0) {
  console.log(`No source images found in ${SRC}`);
  process.exit(0);
}

let count = 0;
for (const filePath of filePaths) {
  const file = basename(filePath);
  const stem = basename(file, extname(file));
  const pipeline = sharp(filePath)
    .rotate() // apply EXIF orientation
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });

  const targets = [
    { ext: 'avif', fn: (p) => p.avif({ quality: 55 }) },
    { ext: 'webp', fn: (p) => p.webp({ quality: 78 }) },
    { ext: 'jpg', fn: (p) => p.jpeg({ quality: 82, mozjpeg: true }) },
  ];

  for (const { ext, fn } of targets) {
    const dest = join(OUT, `${stem}.${ext}`);
    // Don't overwrite an identically named source (e.g. .jpg → .jpg in place).
    if (existsSync(dest) && resolve(dest) === resolve(filePath)) continue;
    // eslint-disable-next-line no-await-in-loop
    await fn(pipeline.clone()).toFile(dest);
  }
  count += 1;
  console.log(`image → ${stem}.{avif,webp,jpg}  (${relative(SRC, filePath)})`);
}

console.log(`Done. Converted ${count} image(s) into: ${OUT}`);
