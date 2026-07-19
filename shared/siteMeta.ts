/**
 * Site metadata derived from the project's own content rather than from the
 * application. The abstract card is the project's title page, so its frontmatter
 * (title, summary, author, institution, year) is what should appear as the
 * document title and in link previews on WhatsApp, Teams, Slack and friends.
 *
 * Used at build time to write the static <title> and Open Graph tags — crawlers
 * do not run JavaScript — and at runtime to keep document.title in sync.
 */

import type { ContentIndex, ContentItem } from './contentTypes';

/** Used only when the project has no abstract card to describe itself. */
const FALLBACK_TITLE = 'Carta';

export interface SiteMeta {
  /** Project title — the abstract card's title. */
  title: string;
  /** One or two sentences describing the project. */
  description: string;
  /** Publisher shown above a link preview: the institution, else the author. */
  siteName: string;
  author?: string;
  year?: number;
}

/** Condense body text into a single-paragraph description of at most `max` chars. */
function excerpt(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  // Prefer breaking at the last sentence end, else the last word boundary.
  const sentenceEnd = cut.lastIndexOf('. ');
  if (sentenceEnd > max * 0.5) return cut.slice(0, sentenceEnd + 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** The item that carries the project's title-page metadata. */
export function abstractOf(index: ContentIndex): ContentItem | undefined {
  const byId = index.abstractId
    ? index.items.find((i) => i.id === index.abstractId)
    : undefined;
  return byId ?? index.items.find((i) => i.type === 'abstract');
}

export function siteMetaFromIndex(index: ContentIndex): SiteMeta {
  const abstract = abstractOf(index);
  if (!abstract) {
    return { title: FALLBACK_TITLE, description: '', siteName: FALLBACK_TITLE };
  }
  return {
    title: abstract.title || FALLBACK_TITLE,
    description: abstract.summary?.trim() || excerpt(abstract.text),
    siteName: abstract.institution ?? abstract.author ?? FALLBACK_TITLE,
    author: abstract.author,
    year: abstract.year,
  };
}
