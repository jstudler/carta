/**
 * Frontmatter validation (against content-item.schema.json) and HTML→text
 * extraction used for search indexing and autoplay word counts.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import Ajv, { type ValidateFunction } from 'ajv';
import type { ItemFrontmatter } from '../../shared/contentTypes';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../../content-item.schema.json');

let validator: ValidateFunction | null = null;

/** Lazily compile the JSON schema validator (one Ajv instance per process). */
function getValidator(): ValidateFunction {
  if (validator) return validator;
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  validator = ajv.compile(schema);
  return validator;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate one item's frontmatter against the schema. */
export function validateFrontmatter(data: unknown): ValidationResult {
  const validate = getValidator();
  const valid = validate(data) as boolean;
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`,
  );
  return { valid, errors };
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Extract readable plain text from an HTML body: strip script/style, drop tags,
 * decode the handful of common entities, and collapse whitespace.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Count words in a plain-text string (used for autoplay reading time). */
export function wordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Insert `<wbr>` break opportunities into long, unbroken tokens (typically URLs)
 * so they wrap after common separators (`/ - ? & = _ .` and whitespace already
 * breaks) instead of overflowing the card. Only tokens of 24+ non-space
 * characters are touched, and only in the TEXT between tags (never inside a tag
 * or an HTML entity), so normal prose and markup are left intact.
 */
export function breakLongUrls(html: string): string {
  // Split into alternating text / tag segments; only transform the text ones.
  return html
    .split(/(<[^>]+>)/)
    .map((seg, i) => (i % 2 === 1 ? seg : seg.replace(/\S{24,}/g, breakToken)))
    .join('');
}

function breakToken(token: string): string {
  // Protect HTML entities (e.g. &amp;) so we never split inside them.
  return token
    .split(/(&[a-zA-Z#0-9]+;)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/([/\-?&=_.])/g, '$1<wbr>')))
    .join('');
}

/**
 * Make external links open in a new tab. Any anchor whose href points off-site
 * (http(s)://, protocol-relative //, or mailto:) gets `target="_blank"` plus the
 * security-hardening `rel="noopener noreferrer"` (prevents the opened page from
 * accessing `window.opener` and leaking the referrer). In-page / relative links
 * are left untouched so internal navigation stays in the same tab.
 */
export function externalizeLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (full, attrs: string) => {
    const hrefMatch = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = hrefMatch ? hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '' : '';
    const isExternal = /^(https?:)?\/\//i.test(href) || /^mailto:/i.test(href);
    if (!isExternal) return full;
    let next = attrs;
    if (!/\btarget\s*=/i.test(next)) next += ' target="_blank"';
    if (!/\brel\s*=/i.test(next)) next += ' rel="noopener noreferrer"';
    return `<a${next}>`;
  });
}

/** Infer card type defaulting to 'normal'. */
export function normalizeType(fm: ItemFrontmatter): NonNullable<ItemFrontmatter['type']> {
  return fm.type ?? 'normal';
}
