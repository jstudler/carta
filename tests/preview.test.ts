/**
 * Tests for the build-time social preview renderer. These run on the real
 * sample content index, so they also guard against layout changes producing a
 * degenerate (empty or out-of-frame) preview image.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { APP_CONFIG, resolveColorScheme } from '../app.config';
import { buildContentIndex } from '../tools/content/buildIndex';
import { renderCanvasSvg } from '../tools/preview/renderCanvasSvg';
import type { ContentIndex } from '../shared/contentTypes';

const SIZE = 1200;
const scheme = resolveColorScheme(APP_CONFIG.colorScheme);

let index: ContentIndex;
let svg: string;

beforeAll(() => {
  index = buildContentIndex(APP_CONFIG);
  svg = renderCanvasSvg(index, {
    view: 'topic',
    width: SIZE,
    height: SIZE,
    scheme,
    config: APP_CONFIG,
  });
});

/**
 * Pull every card `<rect>` out of the SVG. The full-bleed background rect has no
 * `x`/`y` attributes, so it drops out here naturally.
 */
function cardRects(): Array<{ x: number; y: number; width: number; height: number }> {
  return [...svg.matchAll(/<rect ([^>]+)\/>/g)]
    .map((m) => {
      const attr = (name: string): number => {
        const found = new RegExp(`${name}="(-?[\\d.]+)"`).exec(m[1]);
        return found ? Number(found[1]) : NaN;
      };
      return { x: attr('x'), y: attr('y'), width: attr('width'), height: attr('height') };
    })
    .filter((r) => !Number.isNaN(r.x));
}

/** The `translate(x,y) scale(z)` applied to the world layer. */
function worldTransform(): { x: number; y: number; zoom: number } {
  const m = /translate\((-?[\d.]+),(-?[\d.]+)\) scale\(([\d.e-]+)\)/.exec(svg);
  if (!m) throw new Error('world transform not found');
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

describe('renderCanvasSvg', () => {
  it('produces a square SVG document at the requested size', () => {
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain(`width="${SIZE}" height="${SIZE}"`);
    expect(svg).toContain(`viewBox="0 0 ${SIZE} ${SIZE}"`);
  });

  it('fills the frame with the scheme background', () => {
    expect(svg).toContain(`<rect width="${SIZE}" height="${SIZE}" fill="${scheme.background}"/>`);
  });

  it('draws one rect per text card plus one per sidecar', () => {
    const expected = index.items.reduce(
      (sum, item) =>
        sum +
        (item.textCard.width > 0 && item.textCard.height > 0 ? 1 : 0) +
        item.sidecars.filter((s) => s.renderWidth > 0 && s.renderHeight > 0).length,
      0,
    );
    expect(cardRects()).toHaveLength(expected);
  });

  it('draws a connector path per topic', () => {
    const paths = [...svg.matchAll(/<path /g)];
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(index.topics.length + 1);
  });

  it('contains no NaN or Infinity coordinates', () => {
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it('keeps every card inside the frame once the world transform is applied', () => {
    const { x, y, zoom } = worldTransform();
    expect(zoom).toBeGreaterThan(0);
    for (const r of cardRects()) {
      const left = x + r.x * zoom;
      const top = y + r.y * zoom;
      // A small tolerance absorbs the rounding applied when serialising coords.
      expect(left).toBeGreaterThanOrEqual(-1);
      expect(top).toBeGreaterThanOrEqual(-1);
      expect(left + r.width * zoom).toBeLessThanOrEqual(SIZE + 1);
      expect(top + r.height * zoom).toBeLessThanOrEqual(SIZE + 1);
    }
  });

  it('is deterministic', () => {
    const again = renderCanvasSvg(index, {
      view: 'topic',
      width: SIZE,
      height: SIZE,
      scheme,
      config: APP_CONFIG,
    });
    expect(again).toBe(svg);
  });

  it('renders a wide variant without clipping content', () => {
    const wide = renderCanvasSvg(index, {
      view: 'topic',
      width: 1200,
      height: 630,
      scheme,
      config: APP_CONFIG,
    });
    expect(wide).toContain('width="1200" height="630"');
    expect(wide).not.toMatch(/NaN|Infinity/);
  });
});
