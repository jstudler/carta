import { describe, it, expect } from 'vitest';
import { wordCount, truncate } from '../src/lib/text';

describe('wordCount (runtime)', () => {
  it('counts words', () => expect(wordCount('a b c d')).toBe(4));
  it('handles empty', () => expect(wordCount('')).toBe(0));
});

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('short', 10)).toBe('short');
  });
  it('truncates with an ellipsis', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});
