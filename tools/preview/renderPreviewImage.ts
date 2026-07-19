/**
 * Rasterizes the preview SVG to a shareable PNG.
 *
 * WhatsApp silently drops previews whose image is too large to fetch quickly, so
 * an oversized result is re-encoded as a palette PNG. The image is flat colour
 * blocks plus one soft shadow, so 256 colours is visually indistinguishable and
 * the output stays a PNG either way (no filename/extension juggling).
 */

import sharp from 'sharp';
import type { ContentIndex } from '../../shared/contentTypes';
import { renderCanvasSvg, type PreviewOptions } from './renderCanvasSvg';

/** Byte budget for the generated image. */
const MAX_BYTES = 250 * 1024;

export interface PreviewImage {
  buffer: Buffer;
  mime: 'image/png';
  width: number;
  height: number;
}

/** Render the canvas preview, fully zoomed out, and encode it as a PNG. */
export async function renderPreviewImage(
  index: ContentIndex,
  opts: PreviewOptions,
): Promise<PreviewImage> {
  const svg = renderCanvasSvg(index, opts);
  const pipeline = sharp(Buffer.from(svg));

  let buffer = await pipeline.clone().png({ compressionLevel: 9 }).toBuffer();
  if (buffer.length > MAX_BYTES) {
    buffer = await pipeline.clone().png({ compressionLevel: 9, palette: true }).toBuffer();
  }

  return { buffer, mime: 'image/png', width: opts.width, height: opts.height };
}
