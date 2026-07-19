import { describe, it, expect } from 'vitest';
import {
  unionRect,
  boundsOf,
  rectCenter,
  rectsOverlap,
  inflateRect,
  clamp,
  lerp,
  fitRect,
  centerOn,
} from '../shared/geometry';

describe('unionRect', () => {
  it('contains both rectangles', () => {
    const u = unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 5, height: 5 });
    expect(u).toEqual({ x: 0, y: 0, width: 25, height: 10 });
  });
});

describe('boundsOf', () => {
  it('returns a zero rect for an empty list', () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
  it('bounds multiple rects', () => {
    const b = boundsOf([
      { x: 0, y: 0, width: 4, height: 4 },
      { x: 10, y: 10, width: 2, height: 2 },
    ]);
    expect(b).toEqual({ x: 0, y: 0, width: 12, height: 12 });
  });
});

describe('rectCenter', () => {
  it('computes the centre', () => {
    expect(rectCenter({ x: 0, y: 0, width: 10, height: 20 })).toEqual({ x: 5, y: 10 });
  });
});

describe('rectsOverlap', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  it('detects overlap', () => {
    expect(rectsOverlap(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });
  it('detects separation', () => {
    expect(rectsOverlap(a, { x: 20, y: 0, width: 5, height: 5 })).toBe(false);
  });
  it('respects the gap parameter', () => {
    expect(rectsOverlap(a, { x: 12, y: 0, width: 5, height: 5 }, 5)).toBe(true);
  });
});

describe('inflateRect', () => {
  it('expands on all sides', () => {
    expect(inflateRect({ x: 5, y: 5, width: 10, height: 10 }, 2)).toEqual({
      x: 3,
      y: 3,
      width: 14,
      height: 14,
    });
  });
});

describe('clamp / lerp', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
  it('lerps', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('fitRect', () => {
  it('centres the target in the viewport', () => {
    const { zoom, x, y } = fitRect({ x: 0, y: 0, width: 100, height: 100 }, 200, 200, 0);
    expect(zoom).toBeCloseTo(2);
    // Centre of target (50,50) maps to viewport centre (100,100).
    expect(50 * zoom + x).toBeCloseTo(100);
    expect(50 * zoom + y).toBeCloseTo(100);
  });
});

describe('centerOn', () => {
  it('places the point at the viewport centre', () => {
    const { x, y } = centerOn({ x: 30, y: 40 }, 2, 200, 100);
    expect(30 * 2 + x).toBeCloseTo(100);
    expect(40 * 2 + y).toBeCloseTo(50);
  });
});
