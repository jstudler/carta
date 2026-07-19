/**
 * Date parsing and adaptive, human-readable timeline label formatting.
 * Pure functions — unit tested and shared by the build pipeline and the runtime.
 */

export interface ParsedDate {
  /** Epoch milliseconds. */
  timestamp: number;
  /** True when the source carried a meaningful time-of-day (i.e. not midnight). */
  hasTime: boolean;
}

/**
 * Parse an ISO date or datetime. A bare `YYYY-MM-DD` (or one whose time is
 * exactly midnight) is treated as a day without a time component.
 */
export function parseItemDate(iso: string): ParsedDate {
  const hasTimePart = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${iso}`);
  }
  const isMidnight =
    date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
  return { timestamp: date.getTime(), hasTime: hasTimePart && !isMidnight };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MS_MINUTE = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/**
 * Granularity of timeline tick labels, chosen from the time span currently
 * visible on screen. Coarser ranges collapse to months / years; finer ranges
 * expand to weekdays, then hours and minutes.
 */
export type TimeGranularity = 'year' | 'month' | 'day' | 'hour' | 'minute';

/** Pick a label granularity from the visible time span (in milliseconds). */
export function granularityForSpan(spanMs: number): TimeGranularity {
  if (spanMs > 3 * 365 * MS_DAY) return 'year';
  if (spanMs > 60 * MS_DAY) return 'month';
  if (spanMs > 2 * MS_DAY) return 'day';
  if (spanMs > 3 * MS_HOUR) return 'hour';
  return 'minute';
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Format a single timeline tick label at the given granularity. */
export function formatTick(timestamp: number, granularity: TimeGranularity): string {
  const d = new Date(timestamp);
  switch (granularity) {
    case 'year':
      return String(d.getFullYear());
    case 'month':
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    case 'day':
      return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
    case 'hour':
      return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${pad(d.getHours())}:00`;
    case 'minute':
      return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

/**
 * Format the timestamp shown on a card. Midnight-only dates show just the day;
 * dated-with-time items also show hours:minutes.
 */
export function formatCardTimestamp(timestamp: number, hasTime: boolean): string {
  const d = new Date(timestamp);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  if (!hasTime) return day;
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Round a timestamp down to the start of its granularity bucket. */
export function floorToGranularity(timestamp: number, g: TimeGranularity): number {
  const d = new Date(timestamp);
  switch (g) {
    case 'year':
      return new Date(d.getFullYear(), 0, 1).getTime();
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    case 'day':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case 'hour':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
    case 'minute':
      return new Date(
        d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(),
      ).getTime();
  }
}

/** Step size (ms) for advancing one granularity bucket (approximate for month/year). */
export function granularityStep(g: TimeGranularity): number {
  switch (g) {
    case 'year':
      return 365 * MS_DAY;
    case 'month':
      return 30 * MS_DAY;
    case 'day':
      return MS_DAY;
    case 'hour':
      return MS_HOUR;
    case 'minute':
      return MS_MINUTE;
  }
}

/**
 * Generate evenly spaced tick timestamps spanning [min, max] at the appropriate
 * granularity, aiming for `targetCount` visible labels.
 */
export function generateTicks(
  min: number,
  max: number,
  targetCount = 4,
): { timestamp: number; granularity: TimeGranularity }[] {
  const span = Math.max(1, max - min);
  const granularity = granularityForSpan(span);
  const rawStep = span / targetCount;
  const baseStep = granularityStep(granularity);
  const step = Math.max(baseStep, Math.round(rawStep / baseStep) * baseStep);

  const ticks: { timestamp: number; granularity: TimeGranularity }[] = [];
  let t = floorToGranularity(min, granularity);
  while (t <= max + step) {
    if (t >= min - step) ticks.push({ timestamp: t, granularity });
    t += step;
    if (ticks.length > 64) break; // safety valve
  }
  return ticks;
}
