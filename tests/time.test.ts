import { describe, it, expect } from 'vitest';
import {
  parseItemDate,
  granularityForSpan,
  formatTick,
  formatCardTimestamp,
  generateTicks,
  floorToGranularity,
} from '../shared/time';

describe('parseItemDate', () => {
  it('treats a bare date as having no time component', () => {
    const { hasTime } = parseItemDate('2025-03-14');
    expect(hasTime).toBe(false);
  });

  it('treats explicit midnight as no time component', () => {
    expect(parseItemDate('2025-03-14T00:00:00').hasTime).toBe(false);
  });

  it('detects a real time-of-day', () => {
    expect(parseItemDate('2025-03-14T15:30').hasTime).toBe(true);
  });

  it('throws on an invalid date', () => {
    expect(() => parseItemDate('not-a-date')).toThrow();
  });
});

describe('granularityForSpan', () => {
  const DAY = 86_400_000;
  it('uses years for multi-year spans', () => {
    expect(granularityForSpan(4 * 365 * DAY)).toBe('year');
  });
  it('uses months for multi-month spans', () => {
    expect(granularityForSpan(90 * DAY)).toBe('month');
  });
  it('uses days for multi-day spans', () => {
    expect(granularityForSpan(5 * DAY)).toBe('day');
  });
  it('uses minutes for sub-hour spans', () => {
    expect(granularityForSpan(30 * 60_000)).toBe('minute');
  });
});

describe('formatTick', () => {
  const t = new Date('2025-08-09T14:05:00').getTime();
  it('formats a year', () => expect(formatTick(t, 'year')).toBe('2025'));
  it('formats a month', () => expect(formatTick(t, 'month')).toBe('August 2025'));
  it('includes the hour at hour granularity', () =>
    expect(formatTick(t, 'hour')).toContain('14:00'));
});

describe('formatCardTimestamp', () => {
  const t = new Date('2025-08-09T14:05:00').getTime();
  it('omits the time when there is none', () => {
    expect(formatCardTimestamp(t, false)).not.toContain(':');
  });
  it('includes the time when present', () => {
    expect(formatCardTimestamp(t, true)).toContain('14:05');
  });
});

describe('generateTicks', () => {
  it('produces ascending ticks within range', () => {
    const min = new Date('2025-01-01').getTime();
    const max = new Date('2025-12-31').getTime();
    const ticks = generateTicks(min, max, 4);
    expect(ticks.length).toBeGreaterThan(0);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i].timestamp).toBeGreaterThan(ticks[i - 1].timestamp);
    }
  });
});

describe('floorToGranularity', () => {
  it('floors to the start of the month', () => {
    const t = new Date('2025-08-09T14:05:00').getTime();
    const floored = new Date(floorToGranularity(t, 'month'));
    expect(floored.getDate()).toBe(1);
    expect(floored.getHours()).toBe(0);
  });
});
