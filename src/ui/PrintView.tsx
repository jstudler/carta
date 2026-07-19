/**
 * PrintView — the A4-friendly, human-readable document used for PDF export.
 * Structured like a research paper: cover page with metadata, then abstract,
 * clickable TOC, general section, per-topic sections, and conclusion.
 *
 * Order mirrors BookView: Abstract → (ToC) → General → Topics → Conclusion.
 *
 * Internal cross-references (ref: links) become in-page anchors.
 * External links become numbered references collected in a global appendix.
 */

import { content } from '../content';
import { APP_CONFIG } from '../../app.config';
import { formatCardTimestamp } from '../../shared/time';
import { toTitleCase, toKebab, shiftBodyHeadings, TYPE_LABELS } from '../lib/text';
import type { ContentItem, Sidecar } from '../../shared/contentTypes';

// --- Helpers ----------------------------------------------------------------

/** Human-friendly extension preference order (most common first). */
const FRIENDLY_EXT: Record<string, string[]> = {
  picture: ['.jpg', '.jpeg', '.png', '.webp', '.avif'],
  video: ['.mp4', '.webm'],
  audio: ['.mp3', '.webm'],
};

/**
 * Convert an ISO date string to kebab-case parts (mirrors build pipeline dateToKebab).
 * "2026-04-16T11:06" → "2026-04-16-11-06", midnight → "2026-04-16".
 */
function dateToKebab(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return toKebab(dateStr);
  const parts = [m[1], m[2], m[3]];
  if (m[4] && m[5] && !(m[4] === '00' && m[5] === '00')) {
    parts.push(m[4], m[5]);
  }
  return parts.join('-');
}

/**
 * Compute the deterministic deploy filename for a sidecar, matching the build
 * pipeline's rename scheme: <topic>-<datetime>-<title>-<iteration>.<ext>
 * Picks the most human-friendly format (jpg, mp4, mp3) when available.
 */
function deployFilename(item: ContentItem, sidecar: Sidecar, iteration: number): string {
  const prefix = `${toKebab(item.topic)}-${dateToKebab(item.dateIso)}-${toKebab(item.title)}`;
  // Pick the most human-friendly extension from available sources.
  const prefs = FRIENDLY_EXT[sidecar.kind] ?? [];
  let ext = '';
  for (const pref of prefs) {
    if (sidecar.sources.some((s) => s.url.toLowerCase().endsWith(pref))) {
      ext = pref;
      break;
    }
  }
  if (!ext) {
    // Fallback: last source (most compatible by convention) or sidecar filename.
    const last = sidecar.sources[sidecar.sources.length - 1];
    const name = last ? last.url.split('/').pop()! : sidecar.filename;
    ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  }
  return `${prefix}-${iteration}${ext}`;
}

/** Stable anchor id for an item (used for TOC linking + cross-refs). */
function itemAnchor(item: ContentItem): string {
  return `item-${item.id}`;
}

/**
 * Convert ref: links to in-page anchors and collect external links as footnotes.
 * Returns { html, footnotes }.
 */
function processLinks(
  html: string,
  allItems: ContentItem[],
  counterStart = 0,
): { html: string; footnotes: { index: number; url: string }[]; nextCounter: number } {
  const footnotes: { index: number; url: string }[] = [];
  let counter = counterStart;

  // Replace internalref: links with in-page anchor links.
  let processed = html.replace(
    /<a\s+href="internalref:([^"]+)"([^>]*)>(.*?)<\/a>/gi,
    (_, title, attrs, text) => {
      const target = allItems.find(
        (i) => i.title.toLowerCase() === decodeURIComponent(title).toLowerCase(),
      );
      if (target) {
        return `<a href="#${itemAnchor(target)}"${attrs}>${text}</a>`;
      }
      return text;
    },
  );

  // Replace external links with footnote markers (keep link clickable).
  processed = processed.replace(
    /<a\s+href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/gi,
    (_, url, text) => {
      counter += 1;
      footnotes.push({ index: counter, url });
      const label = String(counter).padStart(2, '0');
      return `<a href="${url}" class="print-ext-link">${text}</a><sup class="print-fn-ref" id="fn-ref-${counter}"><a href="#fn-${counter}">[${label}]</a></sup>`;
    },
  );

  return { html: processed, footnotes, nextCounter: counter };
}

// --- Components -------------------------------------------------------------

function MediaCaption({ filename, description }: { filename: string; description?: string }): React.ReactElement {
  return <figcaption className="print-media__caption">{description ? `${filename}: ${description}` : filename}</figcaption>;
}

function PictureBlock({ sidecar, filename }: { sidecar: Sidecar; filename: string }): React.ReactElement {
  return (
    <figure className="print-media__figure">
      <img src={sidecar.url} alt={sidecar.description ?? ''} />
      <MediaCaption filename={filename} description={sidecar.description} />
    </figure>
  );
}

function VideoPlaceholder({ filename, description }: { filename: string; description?: string }): React.ReactElement {
  return (
    <figure className="print-media__figure print-media__figure--av">
      <div className="print-media__placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
        <span>Video</span>
      </div>
      <MediaCaption filename={filename} description={description} />
    </figure>
  );
}

function AudioPlaceholder({ filename, description }: { filename: string; description?: string }): React.ReactElement {
  return (
    <figure className="print-media__figure print-media__figure--av">
      <div className="print-media__placeholder">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
        <span>Audio</span>
      </div>
      <MediaCaption filename={filename} description={description} />
    </figure>
  );
}

/** Render a single content item: h2 title, metadata, body (headings shifted), sidecars. */
function ItemBlock({ item, bodyHtml, sidecarHtmls }: {
  item: ContentItem;
  bodyHtml: string;
  sidecarHtmls: Map<string, string>;
}): React.ReactElement {
  const badge = TYPE_LABELS[item.type] ?? null;

  // Compute deploy filenames for each media sidecar (matching build pipeline).
  let iteration = 0;

  return (
    <article id={itemAnchor(item)} className="print-item">
      <header>
        <h2 className="print-item__title">{item.title}</h2>
        <p className="print-item__meta">
          {formatCardTimestamp(item.timestamp, item.hasTime)}
          {` · ${toTitleCase(item.topic)}`}
          {item.category ? ` · ${toTitleCase(item.category)}` : ''}
          {badge ? ` · ${badge}` : ''}
        </p>
      </header>
      {bodyHtml && <div className="print-item__body" dangerouslySetInnerHTML={{ __html: bodyHtml }} />}

      {item.sidecars.length > 0 && (
        <div className="print-item__media">
          {item.sidecars.map((s) => {
            if (s.kind === 'text' && s.html) {
              const html = sidecarHtmls.get(s.filename) ?? '';
              return <div key={s.filename} className="print-item__body" dangerouslySetInnerHTML={{ __html: html }} />;
            }
            if (s.kind === 'text') return null;
            iteration++;
            const fname = deployFilename(item, s, iteration);
            if (s.kind === 'picture') return <PictureBlock key={s.filename} sidecar={s} filename={fname} />;
            if (s.kind === 'video') return <VideoPlaceholder key={s.filename} filename={fname} description={s.description} />;
            if (s.kind === 'audio') return <AudioPlaceholder key={s.filename} filename={fname} description={s.description} />;
            return null;
          })}
        </div>
      )}
    </article>
  );
}

// --- Main Component ---------------------------------------------------------

export function PrintView(): React.ReactElement {
  const abstract = content.items.find((i) => i.type === 'abstract');
  const title = abstract?.title ?? 'Carta for presenting Artistic Research';
  const { imageMaxWidthMm, imageMaxHeightMm } = APP_CONFIG.print;

  // General items (non-abstract, non-conclusion) sorted by date.
  const generalItems = content.items
    .filter((i) => i.topic === 'general' && i.type !== 'abstract' && i.type !== 'conclusion')
    .sort((a, b) => a.timestamp - b.timestamp);

  // General conclusion (last item of the entire research).
  const generalConclusion = content.items.find(
    (i) => i.topic === 'general' && i.type === 'conclusion',
  );

  // Non-general topics in canonical order.
  const nonGeneralTopics = content.topics.filter((t) => t !== 'general');

  // Pre-process all items in display order for global footnote numbering.
  const allFootnotes: { index: number; url: string }[] = [];
  const processedMap = new Map<string, { bodyHtml: string; sidecarHtmls: Map<string, string> }>();
  let fnCounter = 0;

  function preprocessItem(item: ContentItem, shiftHeadings = true) {
    let bodyHtml = '';
    if (item.html) {
      const src = shiftHeadings ? shiftBodyHeadings(item.html) : item.html;
      const r = processLinks(src, content.items, fnCounter);
      bodyHtml = r.html;
      allFootnotes.push(...r.footnotes);
      fnCounter = r.nextCounter;
    }
    const sidecarHtmls = new Map<string, string>();
    for (const s of item.sidecars) {
      if (s.kind === 'text' && s.html) {
        const r = processLinks(shiftBodyHeadings(s.html), content.items, fnCounter);
        sidecarHtmls.set(s.filename, r.html);
        allFootnotes.push(...r.footnotes);
        fnCounter = r.nextCounter;
      }
    }
    processedMap.set(item.id, { bodyHtml, sidecarHtmls });
  }

  // Abstract (no heading shift for body).
  if (abstract) {
    let bodyHtml = '';
    if (abstract.html) {
      const r = processLinks(abstract.html, content.items, fnCounter);
      bodyHtml = r.html;
      allFootnotes.push(...r.footnotes);
      fnCounter = r.nextCounter;
    }
    const sidecarHtmls = new Map<string, string>();
    for (const s of abstract.sidecars) {
      if (s.kind === 'text' && s.html) {
        const r = processLinks(shiftBodyHeadings(s.html), content.items, fnCounter);
        sidecarHtmls.set(s.filename, r.html);
        allFootnotes.push(...r.footnotes);
        fnCounter = r.nextCounter;
      }
    }
    processedMap.set(abstract.id, { bodyHtml, sidecarHtmls });
  }
  // General items.
  for (const item of generalItems) preprocessItem(item);
  // Per-topic items in canonical order.
  for (const topic of nonGeneralTopics) {
    content.items
      .filter((i) => i.topic === topic && i.type !== 'abstract')
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((item) => preprocessItem(item));
  }
  // Conclusion.
  if (generalConclusion) preprocessItem(generalConclusion);

  return (
    <div
      className="print-root"
      style={{
        '--print-img-max-w': `${imageMaxWidthMm}mm`,
        '--print-img-max-h': `${imageMaxHeightMm}mm`,
      } as React.CSSProperties}
    >
      {/* Fixed header repeated on every printed page by Chrome */}
      <header className="print-header">
        <span className="print-header__title">{title}</span>
        <span className="print-header__chapter"></span>
      </header>

      {/* Cover page */}
      <section className="print-cover">
        <h1 className="print-cover__title">{title}</h1>
        {abstract?.summary && (
          <p className="print-cover__summary">{abstract.summary}</p>
        )}
        {abstract?.author && (
          <p className="print-cover__author">{abstract.author}</p>
        )}
        {abstract?.institution && (
          <p className="print-cover__institution">{abstract.institution}</p>
        )}
        {abstract?.year && (
          <p className="print-cover__year">{abstract.year}</p>
        )}
      </section>

      {/* Abstract section */}
      {abstract && (
        <section className="print-section" id={itemAnchor(abstract)}>
          <h1 className="print-section__title">Abstract</h1>
          <div className="print-item__body" dangerouslySetInnerHTML={{ __html: processedMap.get(abstract.id)?.bodyHtml ?? '' }} />
          {abstract.sidecars.length > 0 && (() => {
            let iteration = 0;
            const sidecarHtmls = processedMap.get(abstract.id)?.sidecarHtmls ?? new Map();
            return (
              <div className="print-item__media">
                {abstract.sidecars.map((s) => {
                  if (s.kind === 'text' && s.html) {
                    const html = sidecarHtmls.get(s.filename) ?? '';
                    return <div key={s.filename} className="print-item__body" dangerouslySetInnerHTML={{ __html: html }} />;
                  }
                  if (s.kind === 'text') return null;
                  iteration++;
                  const fname = deployFilename(abstract, s, iteration);
                  if (s.kind === 'picture') return <PictureBlock key={s.filename} sidecar={s} filename={fname} />;
                  if (s.kind === 'video') return <VideoPlaceholder key={s.filename} filename={fname} description={s.description} />;
                  if (s.kind === 'audio') return <AudioPlaceholder key={s.filename} filename={fname} description={s.description} />;
                  return null;
                })}
              </div>
            );
          })()}
        </section>
      )}

      {/* Table of Contents */}
      <nav className="print-toc">
        <h1 className="print-toc__title">Table of Contents</h1>
        <ol className="print-toc__list">
          {/* Abstract entry */}
          {abstract && (
            <li>
              <a href={`#${itemAnchor(abstract)}`}>Abstract</a>
            </li>
          )}

          {/* General section entry */}
          {generalItems.length > 0 && (
            <li>
              <a href="#section-general">General</a>
              <ol className="print-toc__items">
                {generalItems.map((item) => (
                  <li key={item.id}>
                    <a href={`#${itemAnchor(item)}`}>{item.title}</a>
                  </li>
                ))}
              </ol>
            </li>
          )}

          {/* Per-topic entries */}
          {nonGeneralTopics.map((topic) => {
            const items = content.items
              .filter((i) => i.topic === topic && i.type !== 'abstract')
              .sort((a, b) => a.timestamp - b.timestamp);
            return (
              <li key={topic}>
                <a href={`#topic-${topic}`}>{toTitleCase(topic)}</a>
                <ol className="print-toc__items">
                  {items.map((item) => (
                    <li key={item.id}>
                      <a href={`#${itemAnchor(item)}`}>{item.title}</a>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}

          {/* Conclusion entry */}
          {generalConclusion && (
            <li>
              <a href={`#${itemAnchor(generalConclusion)}`}>Conclusion</a>
            </li>
          )}

          {/* Appendix entry */}
          {allFootnotes.length > 0 && (
            <li>
              <a href="#appendix">Appendix</a>
              <ol className="print-toc__items">
                <li>
                  <a href="#appendix-references">Online References</a>
                </li>
              </ol>
            </li>
          )}
        </ol>
      </nav>

      {/* General section */}
      {generalItems.length > 0 && (
        <section className="print-section" id="section-general">
          <h1 className="print-section__title">General</h1>
          {generalItems.map((item) => (
            <ItemBlock key={item.id} item={item} bodyHtml={processedMap.get(item.id)?.bodyHtml ?? ''} sidecarHtmls={processedMap.get(item.id)?.sidecarHtmls ?? new Map()} />
          ))}
        </section>
      )}

      {/* Per-topic sections */}
      {nonGeneralTopics.map((topic) => {
        const items = content.items
          .filter((i) => i.topic === topic && i.type !== 'abstract')
          .sort((a, b) => a.timestamp - b.timestamp);
        return (
          <section key={topic} id={`topic-${topic}`} className="print-section">
            <h1 className="print-section__title">{toTitleCase(topic)}</h1>
            {items.map((item) => (
              <ItemBlock key={item.id} item={item} bodyHtml={processedMap.get(item.id)?.bodyHtml ?? ''} sidecarHtmls={processedMap.get(item.id)?.sidecarHtmls ?? new Map()} />
            ))}
          </section>
        );
      })}

      {/* Conclusion */}
      {generalConclusion && (
        <section className="print-section" id={itemAnchor(generalConclusion)}>
          <h1 className="print-section__title">Conclusion</h1>
          <ItemBlock item={generalConclusion} bodyHtml={processedMap.get(generalConclusion.id)?.bodyHtml ?? ''} sidecarHtmls={processedMap.get(generalConclusion.id)?.sidecarHtmls ?? new Map()} />
        </section>
      )}

      {/* Appendix */}
      {allFootnotes.length > 0 && (
        <section className="print-section" id="appendix">
          <h1 className="print-section__title">Appendix</h1>
          <h2 className="print-item__title" id="appendix-references">Online References</h2>
          <ol className="print-appendix__refs">
            {allFootnotes.map((fn) => (
              <li key={fn.index} id={`fn-${fn.index}`}>
                <a href={`#fn-ref-${fn.index}`} className="print-appendix__num">{String(fn.index).padStart(2, '0')}</a>
                <a href={fn.url}>{fn.url}</a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
