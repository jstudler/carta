/**
 * Web media format policy, shared by the build pipeline and the conversion tool.
 *
 * For video/audio we list the UNIVERSAL format first (.mp4 / .mp3) because
 * Cloudflare Pages does not reliably support HTTP range requests for files
 * larger than ~1 MB.  Without range support, WebM files (whose seek index /
 * Cues live at the end) can stall or hang in the browser.  MP4 with the
 * `+faststart` flag (moov atom at the front) and MP3 (metadata in the ID3
 * header) both play immediately from a sequential download, avoiding the issue.
 *
 *   - video   : .mp4 (H.264/AAC)  → .webm (VP9/Opus)
 *   - audio   : .mp3 (MPEG)       → .webm (Opus)
 *   - picture : .avif → .webp     → .jpg
 *
 * `extname` here is WITHOUT the leading dot. Keeping this list in one place means
 * the app's <source> ordering and the converter's outputs can never drift apart.
 */

import type { SidecarKind } from './contentTypes';

export interface WebFormat {
  ext: string;
  /** MIME type for the <source type="…"> attribute. */
  type: string;
}

/** Ordered web variants (modern → fallback) for each media kind. */
export const WEB_FORMATS: Record<SidecarKind, WebFormat[]> = {
  video: [
    { ext: 'mp4', type: 'video/mp4' },
    { ext: 'webm', type: 'video/webm' },
  ],
  audio: [
    { ext: 'mp3', type: 'audio/mpeg' },
    { ext: 'webm', type: 'audio/webm' },
  ],
  picture: [
    { ext: 'avif', type: 'image/avif' },
    { ext: 'webp', type: 'image/webp' },
    { ext: 'jpg', type: 'image/jpeg' },
    { ext: 'png', type: 'image/png' },
  ],
  text: [],
};

/**
 * Formats that are web-native but cannot be produced by raster conversion.
 * SVG is a vector format — it can be converted TO raster, but raster images
 * cannot be converted to SVG. These are served as-is when present.
 */
export const PASSTHROUGH_FORMATS: Record<SidecarKind, WebFormat[]> = {
  video: [],
  audio: [],
  picture: [{ ext: 'svg', type: 'image/svg+xml' }],
  text: [],
};

/** Extensions that are considered non-web originals (moved aside to `.orig.ext`). */
export const NON_WEB_EXT: Record<SidecarKind, string[]> = {
  video: ['mov', 'm4v', 'mkv', 'avi'],
  audio: ['wav', 'flac', 'aiff', 'aif', 'aac', 'm4a'],
  picture: ['tiff', 'tif', 'heic', 'heif'],
  text: [],
};

/** MIME type for an arbitrary filename (best-effort fallback). */
export function mimeForFile(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    webm: 'video/webm',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    flac: 'audio/flac',
    avif: 'image/avif',
    webp: 'image/webp',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    gif: 'image/gif',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Strip the final extension from a filename, returning the stem (no dot). */
export function stripExt(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i <= 0 ? filename : filename.slice(0, i);
}
