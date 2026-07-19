/**
 * The document title and every link-preview text must come from the project
 * itself — the abstract card's frontmatter — never from the application.
 */

import { describe, it, expect } from 'vitest';
import { APP_CONFIG } from '../app.config';
import { buildContentIndex } from '../tools/content/buildIndex';
import { siteMetaFromIndex, abstractOf } from '../shared/siteMeta';
import type { ContentIndex } from '../shared/contentTypes';

const index = buildContentIndex(APP_CONFIG);

describe('siteMetaFromIndex', () => {
  it('takes the title from the abstract card', () => {
    const abstract = abstractOf(index);
    expect(abstract).toBeDefined();
    expect(siteMetaFromIndex(index).title).toBe(abstract!.title);
  });

  it('takes the description from the abstract summary', () => {
    expect(siteMetaFromIndex(index).description).toBe(abstractOf(index)!.summary);
  });

  it('uses the institution as the site name', () => {
    expect(siteMetaFromIndex(index).siteName).toBe(abstractOf(index)!.institution);
  });

  it('carries the author and year through', () => {
    const meta = siteMetaFromIndex(index);
    expect(meta.author).toBe(abstractOf(index)!.author);
    expect(meta.year).toBe(abstractOf(index)!.year);
  });

  it('falls back to a body excerpt when the abstract has no summary', () => {
    const abstract = abstractOf(index)!;
    const stripped: ContentIndex = {
      ...index,
      items: index.items.map((i) =>
        i.id === abstract.id ? { ...i, summary: undefined } : i,
      ),
    };
    const { description } = siteMetaFromIndex(stripped);
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(201);
    expect(description).not.toContain('\n');
  });

  it('prefers the author when there is no institution', () => {
    const abstract = abstractOf(index)!;
    const stripped: ContentIndex = {
      ...index,
      items: index.items.map((i) =>
        i.id === abstract.id ? { ...i, institution: undefined } : i,
      ),
    };
    expect(siteMetaFromIndex(stripped).siteName).toBe(abstract.author);
  });

  it('falls back to a neutral name for a project without an abstract', () => {
    const empty: ContentIndex = { ...index, items: [], abstractId: null };
    expect(siteMetaFromIndex(empty)).toEqual({
      title: 'Carta',
      description: '',
      siteName: 'Carta',
    });
  });
});
