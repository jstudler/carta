import { describe, it, expect } from 'vitest';
import { htmlToText, wordCount, validateFrontmatter, normalizeType } from '../tools/content/parse';

describe('htmlToText', () => {
  it('strips tags and decodes entities', () => {
    expect(htmlToText('<p>Hello &amp; <strong>world</strong></p>')).toBe('Hello & world');
  });
  it('removes script/style content', () => {
    expect(htmlToText('<style>p{color:red}</style><p>visible</p>')).toBe('visible');
  });
  it('collapses whitespace', () => {
    expect(htmlToText('<p>a</p>\n\n<p>b</p>')).toBe('a b');
  });
});

describe('wordCount', () => {
  it('counts words', () => {
    expect(wordCount('one two three')).toBe(3);
  });
  it('returns 0 for empty', () => {
    expect(wordCount('   ')).toBe(0);
  });
});

describe('normalizeType', () => {
  it('defaults to normal', () => {
    expect(normalizeType({ title: 't', date: '2025-01-01', topic: 'x' })).toBe('normal');
  });
  it('keeps an explicit type', () => {
    expect(normalizeType({ title: 't', date: '2025-01-01', topic: 'x', type: 'conclusion' })).toBe(
      'conclusion',
    );
  });
});

describe('validateFrontmatter', () => {
  it('accepts a valid item', () => {
    const r = validateFrontmatter({
      title: 'Hello',
      date: '2025-03-14',
      topic: 'technical-setup',
      category: 'studio-work',
      type: 'normal',
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects a missing required field', () => {
    const r = validateFrontmatter({ title: 'Hello', topic: 'x' });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('rejects an unknown type', () => {
    const r = validateFrontmatter({ title: 'x', date: '2025-01-01', topic: 'x', type: 'weird' });
    expect(r.valid).toBe(false);
  });

  it('rejects a malformed date', () => {
    const r = validateFrontmatter({ title: 'x', date: '14-03-2025', topic: 'x' });
    expect(r.valid).toBe(false);
  });

  it('rejects sidecars with an invalid kind', () => {
    const r = validateFrontmatter({
      title: 'x',
      date: '2025-01-01',
      topic: 'x',
      sidecars: [{ filename: 'x--a.mp4', kind: 'movie' }],
    });
    expect(r.valid).toBe(false);
  });
});
