import { describe, it, expect } from 'vitest';
import { packShelf, packItemParts, layoutTimeline, layoutTopic } from '../tools/content/layout';
import { rectsOverlap } from '../shared/geometry';
import { APP_CONFIG } from '../app.config';

describe('packShelf', () => {
  it('wraps boxes that exceed the row width', () => {
    const r = packShelf(
      [
        { width: 100, height: 50 },
        { width: 100, height: 50 },
        { width: 100, height: 50 },
      ],
      220,
      10,
    );
    // Third box should wrap to a new row.
    expect(r.placements[2].y).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(50);
  });
});

describe('packItemParts', () => {
  it('places the text card first and keeps sidecars grouped', () => {
    const r = packItemParts(
      { textCard: { width: 200, height: 120 }, sidecars: [{ width: 150, height: 100 }] },
      APP_CONFIG,
    );
    expect(r.textCard.x).toBe(0);
    expect(r.sidecars).toHaveLength(1);
    expect(r.width).toBeGreaterThan(0);
  });
});

describe('layoutTimeline', () => {
  const items = [
    { id: 'a', timestamp: new Date('2025-01-01').getTime(), width: 200, height: 120, isAbstract: false },
    { id: 'b', timestamp: new Date('2025-01-01').getTime(), width: 200, height: 120, isAbstract: false },
    { id: 'c', timestamp: new Date('2025-06-01').getTime(), width: 200, height: 120, isAbstract: false },
    { id: 'x', timestamp: 0, width: 200, height: 120, isAbstract: true },
  ];

  it('never overlaps placements', () => {
    const { placements } = layoutTimeline(items, APP_CONFIG);
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        expect(rectsOverlap(placements[i].bounds, placements[j].bounds)).toBe(false);
      }
    }
  });

  it('places the abstract left of everything', () => {
    const { placements } = layoutTimeline(items, APP_CONFIG);
    const abstract = placements.find((p) => p.id === 'x')!;
    const others = placements.filter((p) => p.id !== 'x');
    for (const o of others) {
      expect(abstract.bounds.x).toBeLessThan(o.bounds.x);
    }
  });

  it('maps X proportionally to time', () => {
    const { scale, minTimestamp } = layoutTimeline(items, APP_CONFIG);
    expect(scale).toBeGreaterThan(0);
    expect(minTimestamp).toBe(new Date('2025-01-01').getTime());
  });
});

describe('layoutTopic', () => {
  const items = [
    { id: 'a1', topic: 'alpha', timestamp: 1, width: 200, height: 120 },
    { id: 'a2', topic: 'alpha', timestamp: 2, width: 200, height: 120 },
    { id: 'b1', topic: 'beta', timestamp: 1, width: 200, height: 120 },
    { id: 'b2', topic: 'beta', timestamp: 2, width: 200, height: 120 },
  ];

  it('keeps clusters from overlapping', () => {
    const { clusters } = layoutTopic(items, ['alpha', 'beta'], { width: 200, height: 120 }, APP_CONFIG);
    expect(clusters).toHaveLength(2);
    expect(rectsOverlap(clusters[0].bounds, clusters[1].bounds)).toBe(false);
  });

  it('centres the abstract at the origin', () => {
    const { abstractBounds } = layoutTopic(items, ['alpha'], { width: 100, height: 80 }, APP_CONFIG);
    expect(abstractBounds).not.toBeNull();
    expect(abstractBounds!.x).toBe(-50);
    expect(abstractBounds!.y).toBe(-40);
  });
});
