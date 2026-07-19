/**
 * Build-time media dimension probing.
 *
 * Images are measured with `image-size` (sync, fast). Videos are measured with
 * `ffprobe` (part of FFmpeg). Reading intrinsic dimensions here, in Node, keeps
 * the browser free of async media-metadata work — especially important on mobile.
 *
 * Every probe degrades gracefully: if a file is missing or a tool is unavailable
 * we fall back to a sensible default aspect ratio so the build never hard-fails
 * on a single asset.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { imageSize } from 'image-size';
import type { SidecarKind } from '../../shared/contentTypes';

export interface Dimensions {
  width: number;
  height: number;
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const VIDEO_EXT = new Set(['.mov', '.mp4', '.webm', '.m4v', '.mkv']);

const DEFAULT_IMAGE: Dimensions = { width: 1600, height: 1200 };
const DEFAULT_VIDEO: Dimensions = { width: 1920, height: 1080 };

let ffprobeWarned = false;

/** Measure an image's pixel dimensions; falls back to a 4:3 default. */
function measureImage(filePath: string): Dimensions {
  try {
    const buffer = readFileSync(filePath);
    const result = imageSize(buffer);
    if (result.width && result.height) {
      // Respect EXIF orientation: swap on rotated images.
      const rotated = result.orientation && result.orientation >= 5;
      return rotated
        ? { width: result.height, height: result.width }
        : { width: result.width, height: result.height };
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_IMAGE;
}

/** Measure a video's pixel dimensions via ffprobe; falls back to 16:9. */
function measureVideo(filePath: string): Dimensions {
  try {
    const out = execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'csv=s=x:p=0',
        filePath,
      ],
      { encoding: 'utf8' },
    ).trim();
    const [w, h] = out.split('x').map((n) => parseInt(n, 10));
    if (w > 0 && h > 0) return { width: w, height: h };
  } catch {
    if (!ffprobeWarned) {
      // eslint-disable-next-line no-console
      console.warn('[content] ffprobe unavailable or failed — using default video aspect ratio.');
      ffprobeWarned = true;
    }
  }
  return DEFAULT_VIDEO;
}

/**
 * Probe a media file's intrinsic dimensions. Returns `null` for audio (which has
 * no visual aspect ratio) and for unknown extensions.
 */
export function probeDimensions(filePath: string, kind: SidecarKind): Dimensions | null {
  if (kind === 'audio') return null;
  const ext = extname(filePath).toLowerCase();
  if (!existsSync(filePath)) {
    return kind === 'video' ? DEFAULT_VIDEO : DEFAULT_IMAGE;
  }
  if (kind === 'picture' && IMAGE_EXT.has(ext)) return measureImage(filePath);
  if (kind === 'video' && VIDEO_EXT.has(ext)) return measureVideo(filePath);
  // Mismatched kind/extension: best-effort by extension.
  if (IMAGE_EXT.has(ext)) return measureImage(filePath);
  if (VIDEO_EXT.has(ext)) return measureVideo(filePath);
  return kind === 'video' ? DEFAULT_VIDEO : DEFAULT_IMAGE;
}
