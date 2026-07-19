import { describe, it, expect } from 'vitest';
import { buildContentIndex } from '../tools/content/buildIndex';
import { APP_CONFIG } from '../app.config';

/**
 * Integration test over the real sample-data folder: the full pipeline must
 * parse, validate cross-file constraints, lay out, and index without throwing.
 */
describe('buildContentIndex (sample-data)', () => {
  const index = buildContentIndex(APP_CONFIG);

  it('indexes every item', () => {
    expect(index.items.length).toBeGreaterThan(10);
  });

  it('finds the abstract', () => {
    expect(index.abstractId).not.toBeNull();
  });

  it('discovers the expected topics', () => {
    expect(index.topics).toEqual(
      expect.arrayContaining(['material-studies', 'projection-mapping', 'sensor-integration', 'audience-interaction']),
    );
  });

  it('has exactly one conclusion per topic, dated newest', () => {
    for (const topic of index.topics) {
      const members = index.items.filter((i) => i.topic === topic && i.type !== 'abstract');
      const conclusions = members.filter((i) => i.type === 'conclusion');
      expect(conclusions).toHaveLength(1);
      const newest = Math.max(...members.map((i) => i.timestamp));
      expect(conclusions[0].timestamp).toBe(newest);
    }
  });

  it('builds a search corpus and a topic cluster per topic', () => {
    expect(index.searchDocs.length).toBe(index.items.length);
    expect(index.clusters.length).toBe(index.topics.length);
  });

  it('produces a positive timeline scale', () => {
    expect(index.timelineScale).toBeGreaterThan(0);
  });

  /**
   * LQIPs are inlined into the content index (and therefore into the JS bundle),
   * so they must stay tiny and must never appear on non-video sidecars. They are
   * only present once `convert:media` has run, so absence is not a failure.
   */
  it('carries video LQIPs as small image data URIs, and only on videos', () => {
    const sidecars = index.items.flatMap((i) => i.sidecars);
    expect(sidecars.length).toBeGreaterThan(0);
    for (const sc of sidecars) {
      if (sc.kind !== 'video') {
        expect(sc.lqip).toBeUndefined();
        continue;
      }
      if (sc.lqip === undefined) continue; // not converted yet
      expect(sc.lqip.startsWith('data:image/')).toBe(true);
      expect(sc.lqip.length).toBeLessThan(4096);
    }
  });
});
