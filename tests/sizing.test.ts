import { describe, it, expect } from 'vitest';
import { mediaRenderSize, audioRenderSize, textCardSize } from '../tools/content/sizing';
import { APP_CONFIG } from '../app.config';

describe('mediaRenderSize', () => {
  it('preserves aspect ratio', () => {
    const r = mediaRenderSize({ width: 1920, height: 1080 }, 150_000, 1);
    expect(r.width / r.height).toBeCloseTo(1920 / 1080, 2);
  });
  it('hits the target area', () => {
    const r = mediaRenderSize({ width: 1000, height: 1000 }, 160_000, 1);
    expect(r.width * r.height).toBeGreaterThan(150_000);
    expect(r.width * r.height).toBeLessThan(170_000);
  });
  it('scales area with the size multiplier', () => {
    const a = mediaRenderSize({ width: 1000, height: 1000 }, 100_000, 1);
    const b = mediaRenderSize({ width: 1000, height: 1000 }, 100_000, 4);
    expect(b.width).toBeCloseTo(a.width * 2, 0);
  });
});

describe('audioRenderSize', () => {
  it('scales by the multiplier', () => {
    const r = audioRenderSize(80, 320, 2);
    expect(r.height).toBe(160);
    expect(r.width).toBe(640);
  });
});

describe('textCardSize', () => {
  it('grows taller with more text', () => {
    const short = textCardSize('Short.', APP_CONFIG, 1, 1, true);
    const long = textCardSize('word '.repeat(400), APP_CONFIG, 1, 1, true);
    expect(long.height).toBeGreaterThan(short.height);
  });
  it('width follows the width multiplier, not the font size', () => {
    const base = textCardSize('hello world', APP_CONFIG, 1, 1, true);
    const wider = textCardSize('hello world', APP_CONFIG, 1, 2, true);
    expect(wider.width).toBeGreaterThan(base.width);
  });
});
