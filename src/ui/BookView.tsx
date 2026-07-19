/**
 * BookView — article/book-style reading view. Renders all content sequentially
 * like a single-page article. Order: abstract → topics (each with items by date)
 * → general items + conclusion.
 *
 * ToC is expanded by default on the left, content flows to the right.
 * Photos and videos are inline with text.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { content, colorScheme } from '../content';
import { useStore } from '../store';
import { formatCardTimestamp } from '../../shared/time';
import { toTitleCase, toKebab, shiftBodyHeadings, TYPE_LABELS } from '../lib/text';
import { faviconDataUri } from '../lib/favicon';
import type { ContentItem, Sidecar } from '../../shared/contentTypes';

const APP_ICON = faviconDataUri(colorScheme);

// --- Helpers ----------------------------------------------------------------

function itemAnchor(item: ContentItem): string {
  return `book-${item.id}`;
}

function topicAnchor(topic: string): string {
  return `book-topic-${topic}`;
}

/**
 * Lazy-mount wrapper: only renders children when within 2 viewport heights
 * of the visible area. Prevents video/audio from preloading until close.
 */
function LazyMedia({ children }: { children: React.ReactNode }): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '200% 0px' }, // 2 viewport heights above and below
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref}>{visible ? children : null}</div>;
}

function InlineMedia({ sidecar }: { sidecar: Sidecar }): React.ReactElement | null {
  if (sidecar.kind === 'picture') {
    return (
      <figure className="book__media">
        <picture>
          {sidecar.sources.slice(0, -1).map((s) => (
            <source key={s.url} srcSet={s.url.replace(/ /g, '%20')} type={s.type} />
          ))}
          <img
            src={(sidecar.sources[sidecar.sources.length - 1] ?? { url: sidecar.url }).url}
            alt={sidecar.description ?? ''}
            loading="lazy"
          />
        </picture>
        {sidecar.description && <figcaption>{sidecar.description}</figcaption>}
      </figure>
    );
  }
  if (sidecar.kind === 'video') {
    return (
      <LazyMedia>
        <figure className="book__media">
          <video controls preload="metadata" playsInline>
            {sidecar.sources.map((s) => (
              <source key={s.url} src={s.url.replace(/ /g, '%20')} type={s.type} />
            ))}
          </video>
          {sidecar.description && <figcaption>{sidecar.description}</figcaption>}
        </figure>
      </LazyMedia>
    );
  }
  if (sidecar.kind === 'audio') {
    return (
      <LazyMedia>
        <figure className="book__media book__media--audio">
          <audio controls preload="metadata">
            {sidecar.sources.map((s) => (
              <source key={s.url} src={s.url.replace(/ /g, '%20')} type={s.type} />
            ))}
          </audio>
          {sidecar.description && <figcaption>{sidecar.description}</figcaption>}
        </figure>
      </LazyMedia>
    );
  }
  if (sidecar.kind === 'text' && sidecar.html) {
    // Shift headings down so they nest under the card title (h3 → h4, etc.).
    return <div className="book__text-sidecar book__item-body" dangerouslySetInnerHTML={{ __html: shiftBodyHeadings(sidecar.html) }} />;
  }
  return null;
}

function BookItem({ item, headingLevel }: { item: ContentItem; headingLevel: 3 | 4 }): React.ReactElement {
  const Tag = `h${headingLevel}` as const;
  const topicUrl = `?view=topic&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`;
  const timelineUrl = `?view=timeline&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`;
  return (
    <article id={itemAnchor(item)} className="book__item">
      <Tag className="book__item-title">
        {item.title}
        <span className="book__item-viewlinks">
          <a href={topicUrl} title="View in Topic view">
            <img className="book__viewlink-icon" src={APP_ICON} alt="Topic view" />
          </a>
          <a href={timelineUrl} title="View in Timeline view">
            <svg className="book__viewlink-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4.5" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 2.5v4M16 2.5v4" />
            </svg>
          </a>
        </span>
      </Tag>
      <p className="book__item-meta">
        {formatCardTimestamp(item.timestamp, item.hasTime)}
        {` · ${toTitleCase(item.topic)}`}
        {item.category ? ` · ${toTitleCase(item.category)}` : ''}
        {TYPE_LABELS[item.type] ? ` · ${TYPE_LABELS[item.type]}` : ''}
      </p>
      {item.html && <div className="book__item-body" dangerouslySetInnerHTML={{ __html: shiftBodyHeadings(item.html) }} />}
      {item.sidecars.map((s) => (
        <InlineMedia key={s.filename} sidecar={s} />
      ))}
    </article>
  );
}

// --- Main Component ---------------------------------------------------------

export function BookView(): React.ReactElement {
  const view = useStore((s) => s.view);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const scrollTimerRef = useRef<number | undefined>(undefined);

  // Only one media plays at a time: pause all others when any starts.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: Event): void => {
      const playing = e.target as HTMLMediaElement;
      container.querySelectorAll('video, audio').forEach((el) => {
        if (el !== playing && !(el as HTMLMediaElement).paused) {
          (el as HTMLMediaElement).pause();
        }
      });
    };
    container.addEventListener('play', handler, true);
    return () => container.removeEventListener('play', handler, true);
  }, [view]);

  // Update URL as user scrolls — debounced, finds item at center of viewport.
  useEffect(() => {
    if (view !== 'book') return;
    const scrollEl = contentRef.current;
    if (!scrollEl) return;
    const onScroll = (): void => {
      window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(() => {
        const centerY = scrollEl.scrollTop + scrollEl.clientHeight / 2;
        // Find the item element closest to the vertical center.
        const articles = scrollEl.querySelectorAll<HTMLElement>('[id^="book-"]');
        let closest: HTMLElement | null = null;
        let closestDist = Infinity;
        articles.forEach((el) => {
          const dist = Math.abs(el.offsetTop + el.offsetHeight / 2 - centerY);
          if (dist < closestDist) {
            closestDist = dist;
            closest = el;
          }
        });
        if (closest) {
          const item = content.items.find((i) => itemAnchor(i) === (closest as HTMLElement).id);
          if (item) {
            const query = `?view=book&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`;
            window.history.replaceState(null, '', query);
          }
        }
      }, 300);
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      window.clearTimeout(scrollTimerRef.current);
    };
  }, [view]);

  // Navigate to item by URL params on mount / view switch.
  const scrollToCardFromUrl = useCallback(() => {
    if (view !== 'book') return;
    const params = new URLSearchParams(window.location.search);
    const cardParam = params.get('card');
    if (cardParam) {
      const item = content.items.find(
        (i) => toKebab(i.title) === cardParam,
      );
      if (item) {
        requestAnimationFrame(() => {
          const el = document.getElementById(itemAnchor(item));
          el?.scrollIntoView({ behavior: 'instant', block: 'start' });
        });
      }
    }
  }, [view]);

  useEffect(() => { scrollToCardFromUrl(); }, [scrollToCardFromUrl]);

  /** Navigate to an item: scroll to it and update URL (no # fragment). */
  const navigateToItem = useCallback((item: ContentItem): void => {
    const query = `?view=book&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`;
    window.history.pushState(null, '', query);
    const el = document.getElementById(itemAnchor(item));
    el?.scrollIntoView({ behavior: 'instant', block: 'start' });
    setNavOpen(false); // Close mobile nav on navigate.
  }, []);

  const [navOpen, setNavOpen] = useState(false);

  const abstract = content.items.find((i) => i.type === 'abstract');
  const nonGeneralTopics = content.topics.filter((t) => t !== 'general');

  // General items that are not abstract/conclusion, ordered by date.
  const generalItems = content.items
    .filter((i) => i.topic === 'general' && i.type !== 'abstract' && i.type !== 'conclusion')
    .sort((a, b) => a.timestamp - b.timestamp);
  const generalConclusion = content.items.find(
    (i) => i.topic === 'general' && i.type === 'conclusion',
  );

  if (view !== 'book') return <></>;

  return (
    <div ref={containerRef} className="book-view">
      {/* Mobile hamburger toggle */}
      <button
        className="book__mobile-toggle"
        onClick={() => setNavOpen((o) => !o)}
        aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
      >
        {navOpen ? '✕' : '☰'}
      </button>
      {/* Mobile overlay backdrop */}
      <div
        className={`book__overlay${navOpen ? ' book__overlay--visible' : ''}`}
        onClick={() => setNavOpen(false)}
      />

      {/* Sidebar ToC */}
      <nav className={`book__toc${navOpen ? ' book__toc--open' : ''}`}>
        <h2 className="book__toc-title">Contents</h2>
        <ul className="book__toc-list">
          {abstract && (
            <li><button onClick={() => navigateToItem(abstract)}>Abstract</button></li>
          )}
          {generalItems.length > 0 && (
            <li>
              <span className="book__toc-heading">General</span>
              <ul>
                {generalItems.map((item) => (
                  <li key={item.id}>
                    <button onClick={() => navigateToItem(item)}>{item.title}</button>
                  </li>
                ))}
              </ul>
            </li>
          )}
          {nonGeneralTopics.map((topic) => {
            const topicItems = content.items
              .filter((i) => i.topic === topic && i.type !== 'abstract')
              .sort((a, b) => a.timestamp - b.timestamp);
            return (
              <li key={topic}>
                <button onClick={() => topicItems[0] && navigateToItem(topicItems[0])}>{toTitleCase(topic)}</button>
                <ul>
                  {topicItems.map((item) => (
                    <li key={item.id}>
                      <button onClick={() => navigateToItem(item)}>{item.title}</button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
          {generalConclusion && (
            <li><button onClick={() => navigateToItem(generalConclusion)}>Conclusion</button></li>
          )}
        </ul>
      </nav>

      {/* Main content */}
      <main ref={contentRef} className="book__content">
        {/* Cover */}
        {abstract && (
          <section className="book__cover">
            <h1 className="book__cover-title">{abstract.title}</h1>
            {abstract.summary && <p className="book__cover-summary">{abstract.summary}</p>}
            {abstract.author && <p className="book__cover-author">{abstract.author}</p>}
            {abstract.institution && <p className="book__cover-institution">{abstract.institution}</p>}
            {abstract.year && <p className="book__cover-year">{abstract.year}</p>}
          </section>
        )}

        {/* Abstract */}
        {abstract && (
          <section id={itemAnchor(abstract)} className="book__section">
            <h2 className="book__h2">Abstract</h2>
            {abstract.html && <div className="book__item-body" dangerouslySetInnerHTML={{ __html: abstract.html }} />}
            {abstract.sidecars.map((s) => (
              <InlineMedia key={s.filename} sidecar={s} />
            ))}
          </section>
        )}

        {/* General items (non-abstract, non-conclusion) — after abstract */}
        {generalItems.length > 0 && (
          <section id="book-general-other" className="book__section">
            <h2 className="book__h2">General</h2>
            {generalItems.map((item) => (
              <BookItem key={item.id} item={item} headingLevel={3} />
            ))}
          </section>
        )}

        {/* Per-topic sections */}
        {nonGeneralTopics.map((topic) => {
          const items = content.items
            .filter((i) => i.topic === topic && i.type !== 'abstract')
            .sort((a, b) => a.timestamp - b.timestamp);
          return (
            <section key={topic} id={topicAnchor(topic)} className="book__section">
              <h2 className="book__h2">{toTitleCase(topic)}</h2>
              {items.map((item) => (
                <BookItem key={item.id} item={item} headingLevel={3} />
              ))}
            </section>
          );
        })}

        {/* Conclusion */}
        {generalConclusion && (
          <section id={itemAnchor(generalConclusion)} className="book__section">
            <h2 className="book__h2">Conclusion</h2>
            <BookItem item={generalConclusion} headingLevel={3} />
          </section>
        )}
      </main>
    </div>
  );
}
