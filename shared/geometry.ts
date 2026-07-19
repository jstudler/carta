/**
 * Pure geometry helpers for canvas layout and viewport math. Unit tested.
 */

import type { Rect } from './contentTypes';

export interface Vec2 {
  x: number;
  y: number;
}

/** Union of two rectangles (smallest rect containing both). */
export function unionRect(a: Rect, b: Rect): Rect {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.width, b.x + b.width);
  const maxY = Math.max(a.y + a.height, b.y + b.height);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Bounding rect of a list of rects (empty → zero rect). */
export function boundsOf(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  return rects.reduce((acc, r) => unionRect(acc, r));
}

/** Centre point of a rect. */
export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** True when two rects overlap (touching edges do not count as overlap). */
export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/** Expand a rect by `pad` on every side. */
export function inflateRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}

/** Clamp a number to [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Compute the zoom + translate that fits `target` rect into a viewport of
 * `viewportWidth`×`viewportHeight`, leaving a fractional `padding` margin.
 * Returns canvas transform values (scale + top-left translate in screen px).
 */
export function fitRect(
  target: Rect,
  viewportWidth: number,
  viewportHeight: number,
  padding = 0.08,
): { zoom: number; x: number; y: number } {
  const pad = 1 - padding * 2;
  const safeW = Math.max(1, target.width);
  const safeH = Math.max(1, target.height);
  const zoom = Math.min((viewportWidth * pad) / safeW, (viewportHeight * pad) / safeH);
  const center = rectCenter(target);
  // Translate so the target centre maps to the viewport centre.
  const x = viewportWidth / 2 - center.x * zoom;
  const y = viewportHeight / 2 - center.y * zoom;
  return { zoom, x, y };
}

/** Transform that centres `center` at a given zoom in the viewport. */
export function centerOn(
  center: Vec2,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
): { zoom: number; x: number; y: number } {
  return {
    zoom,
    x: viewportWidth / 2 - center.x * zoom,
    y: viewportHeight / 2 - center.y * zoom,
  };
}
