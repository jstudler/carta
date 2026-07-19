/** Tiny text helpers used at runtime (autoplay reading time, search snippets). */

/** Count whitespace-separated words. */
export function wordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/** Truncate text to a maximum length, appending an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Convert a metadata slug (topic / category) to Title Case: dashes become
 * spaces and every word is capitalised (first letter upper, the rest lower).
 * e.g. "studio-work" → "Studio Work", "sensor-integration" → "Sensor Integration".
 */
export function toTitleCase(value: string): string {
  return value
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Convert a string to kebab-case (lowercase, non-alphanumeric → hyphens). */
export function toKebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Shift all HTML headings down by one level (h1→h2, h2→h3, …, h5→h6). */
export function shiftBodyHeadings(html: string): string {
  return html.replace(/<(\/?)(h)([1-6])([\s>])/gi, (_, slash, h, level, rest) => {
    const newLevel = Math.min(6, Number(level) + 1);
    return `<${slash}${h}${newLevel}${rest}`;
  });
}

/** Human-readable labels for special card types. */
export const TYPE_LABELS: Record<string, string> = {
  introduction: 'Introduction',
  conclusion: 'Conclusion',
  reflection: 'Reflection',
  lookout: 'Lookout & Future Prospects',
  imponderable: 'Loose Ends & Unsolved Problems',
};
