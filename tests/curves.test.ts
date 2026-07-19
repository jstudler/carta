/**
 * Regression tests for the pure curve + colour helpers extracted out of
 * src/canvas/TopicLines.tsx. The expected path strings below were captured from
 * the original in-component implementation, so any drift is caught here.
 */

import { describe, it, expect } from 'vitest';
import { smoothPath, hexToRgb, luminance, darken } from '../shared/curves';

const pts = [
  { x: 0, y: 0 },
  { x: 100, y: 50 },
  { x: 200, y: 20 },
  { x: 300, y: 120 },
];

describe('smoothPath', () => {
  it('returns an empty string for no points', () => {
    expect(smoothPath([])).toBe('');
  });

  it('returns a move-to for a single point', () => {
    expect(smoothPath([{ x: 4, y: 7 }])).toBe('M4,7');
  });

  it('returns a straight line for two points', () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M0,0L10,5');
  });

  it('matches the original Catmull-Rom output (topic view)', () => {
    expect(smoothPath(pts)).toBe(
      'M0,0 C30,15 40,44 100,50 C160,56 140,-1 200,20 C260,41 270,90 300,120',
    );
  });

  it('matches the original monotone-cubic output (timeline view)', () => {
    expect(smoothPath(pts, true)).toBe(
      'M0,0 C33.333333333333336,16.666666666666668 66.66666666666666,50 100,50' +
        ' C133.33333333333334,50 166.66666666666666,20 200,20' +
        ' C233.33333333333334,20 266.6666666666667,86.66666666666666 300,120',
    );
  });

  it('never emits NaN for duplicate points', () => {
    const d = smoothPath([
      { x: 10, y: 10 },
      { x: 10, y: 10 },
      { x: 10, y: 10 },
    ], true);
    expect(d).not.toMatch(/NaN|Infinity/);
  });
});

describe('colour helpers', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(hexToRgb('#9ec6b5')).toEqual({ r: 158, g: 198, b: 181 });
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('computes luminance on a 0..1 scale', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBe(1);
    expect(luminance('#9ec6b5')).toBeGreaterThan(0.5);
    expect(luminance('#383553')).toBeLessThan(0.5);
  });

  it('darkens toward black and pads to 6 digits', () => {
    expect(darken('#9ec6b5', 0.4)).toBe('#5f776d');
    expect(darken('#ffffff', 1)).toBe('#000000');
    expect(darken('#9ec6b5', 0)).toBe('#9ec6b5');
  });
});
