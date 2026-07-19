/**
 * Adaptive Table of Contents — two expandable sections that mirror the canvas's
 * two views:
 *   • Timeline → Year → Month → entry
 *   • Topics   → Topic → entry
 * The section matching the current view auto-expands (and the other collapses)
 * whenever the view changes. Clicking a leaf switches views first if needed,
 * then glides the canvas to that card. Entries use the width-compensated
 * weight-hover effect (heavier on hover with no layout shift).
 */

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { content, itemsById } from '../content';
import { focusItem, switchView } from '../lib/navigation';
import { toTitleCase, toKebab } from '../lib/text';
import type { ViewMode } from '../lib/types';
import type { ContentItem } from '../../shared/contentTypes';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface MonthGroup {
  month: number;
  items: ContentItem[];
}
interface YearGroup {
  year: number;
  months: MonthGroup[];
}
interface TopicGroup {
  topic: string;
  items: ContentItem[];
}

/** Build Year → Month → items, omitting empty months and sorted chronologically. */
function buildTimeline(): YearGroup[] {
  const items = content.items
    .filter((i) => i.type !== 'abstract')
    .sort((a, b) => a.timestamp - b.timestamp);
  const byYear = new Map<number, Map<number, ContentItem[]>>();
  for (const item of items) {
    const d = new Date(item.timestamp);
    const y = d.getFullYear();
    const m = d.getMonth();
    if (!byYear.has(y)) byYear.set(y, new Map());
    const months = byYear.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(item);
  }
  return [...byYear.keys()]
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      months: [...byYear.get(year)!.keys()]
        .sort((a, b) => a - b)
        .map((month) => ({ month, items: byYear.get(year)!.get(month)! })),
    }));
}

/** Build Topic → items in the canonical topic order. */
function buildTopics(): TopicGroup[] {
  return content.topics.map((topic) => ({
    topic,
    items: content.items
      .filter((i) => i.topic === topic && i.type !== 'abstract')
      .sort((a, b) => a.timestamp - b.timestamp),
  }));
}

const timelineGroups = buildTimeline();
const topicGroups = buildTopics();

/** Expansion keys to open for a given view (its whole tree). */
function defaultExpanded(view: ViewMode): Set<string> {
  const s = new Set<string>();
  if (view === 'timeline') {
    s.add('timeline');
    for (const y of timelineGroups) {
      s.add(`tl-y-${y.year}`);
      for (const m of y.months) s.add(`tl-m-${y.year}-${m.month}`);
    }
  } else if (view === 'book') {
    s.add('book');
    for (const t of topicGroups) s.add(`bk-${t.topic}`);
  } else {
    s.add('topics');
    for (const t of topicGroups) s.add(`tp-${t.topic}`);
  }
  return s;
}

function WeightLink({ text, onClick }: { text: string; onClick: () => void }): React.ReactElement {
  return (
    <button className="toc__link weight-hover" data-text={text} onClick={onClick}>
      <span>{text}</span>
    </button>
  );
}

export function TableOfContents({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const view = useStore((s) => s.view);
  const openPanel = useStore((s) => s.openPanel);
  const setOpenPanel = useStore((s) => s.setOpenPanel);
  const open = openPanel === 'toc';

  const [expanded, setExpanded] = useState<Set<string>>(() => defaultExpanded(view));

  // Auto-expand the section matching the current view; collapse the other.
  useEffect(() => {
    setExpanded(defaultExpanded(view));
  }, [view]);

  const toggle = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const navigate = async (item: ContentItem, targetView: ViewMode): Promise<void> => {
    setOpenPanel(null);
    if (useStore.getState().view !== targetView) {
      await switchView(targetView, (v) => content.bounds[v]);
    }
    focusItem(item, targetView);
  };

  const abstractItem = content.abstractId ? itemsById.get(content.abstractId) : undefined;

  const caret = (key: string): string => (expanded.has(key) ? '▾' : '▸');

  const timelineSection = (
    <section className="toc__section">
      <button
        className="toc__section-head"
        onClick={() => toggle('timeline')}
        aria-expanded={expanded.has('timeline')}
      >
        <span className="toc__caret">{caret('timeline')}</span> As Timeline
      </button>
      {expanded.has('timeline') && (
        <div className="toc__section-body">
          {abstractItem && (
            <WeightLink text="Abstract" onClick={() => navigate(abstractItem, 'timeline')} />
          )}
          {timelineGroups.map((y) => {
            const yKey = `tl-y-${y.year}`;
            return (
              <div key={yKey} className="toc__group">
                <button
                  className="toc__group-head"
                  onClick={() => toggle(yKey)}
                  aria-expanded={expanded.has(yKey)}
                >
                  <span className="toc__caret">{caret(yKey)}</span> {y.year}
                </button>
                {expanded.has(yKey) && (
                  <div className="toc__group-body">
                    {y.months.map((m) => {
                      const mKey = `tl-m-${y.year}-${m.month}`;
                      return (
                        <div key={mKey} className="toc__group">
                          <button
                            className="toc__group-head toc__group-head--sub"
                            onClick={() => toggle(mKey)}
                            aria-expanded={expanded.has(mKey)}
                          >
                            <span className="toc__caret">{caret(mKey)}</span>{' '}
                            {MONTH_NAMES[m.month]}
                          </button>
                          {expanded.has(mKey) && (
                            <ul className="toc__leaves">
                              {m.items.map((item) => (
                                <li key={item.id}>
                                  <WeightLink
                                    text={item.title}
                                    onClick={() => navigate(item, 'timeline')}
                                  />
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const topicsSection = (
    <section className="toc__section">
      <button
        className="toc__section-head"
        onClick={() => toggle('topics')}
        aria-expanded={expanded.has('topics')}
      >
        <span className="toc__caret">{caret('topics')}</span> As Topics
      </button>
      {expanded.has('topics') && (
        <div className="toc__section-body">
          {abstractItem && (
            <WeightLink text="Abstract" onClick={() => navigate(abstractItem, 'topic')} />
          )}
          {topicGroups.map((t) => {
            const tKey = `tp-${t.topic}`;
            return (
              <div key={tKey} className="toc__group">
                <button
                  className="toc__group-head"
                  onClick={() => toggle(tKey)}
                  aria-expanded={expanded.has(tKey)}
                >
                  <span className="toc__caret">{caret(tKey)}</span> {toTitleCase(t.topic)}
                </button>
                {expanded.has(tKey) && (
                  <ul className="toc__leaves">
                    {t.items.map((item) => (
                      <li key={item.id}>
                        <WeightLink
                          text={item.title}
                          onClick={() => navigate(item, 'topic')}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const navigateBook = (item?: ContentItem): void => {
    setOpenPanel(null);
    // Close mobile menu if open.
    useStore.getState().setMenuOpen(false);
    const query = item
      ? `?view=book&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`
      : '?view=book';
    window.history.pushState(null, '', query);
    useStore.getState().setView('book');
    // Scroll to the item in book view (defer to let the view render).
    if (item) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`book-${item.id}`);
        el?.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    }
  };

  const bookSection = (
    <section className="toc__section">
      <button
        className="toc__section-head"
        onClick={() => toggle('book')}
        aria-expanded={expanded.has('book')}
      >
        <span className="toc__caret">{caret('book')}</span> As Book
      </button>
      {expanded.has('book') && (
        <div className="toc__section-body">
          {abstractItem && (
            <WeightLink text="Abstract" onClick={() => navigateBook(abstractItem)} />
          )}
          {topicGroups.map((t) => {
            const bKey = `bk-${t.topic}`;
            return (
              <div key={bKey} className="toc__group">
                <button
                  className="toc__group-head"
                  onClick={() => toggle(bKey)}
                  aria-expanded={expanded.has(bKey)}
                >
                  <span className="toc__caret">{caret(bKey)}</span> {toTitleCase(t.topic)}
                </button>
                {expanded.has(bKey) && (
                  <ul className="toc__leaves">
                    {t.items.map((item) => (
                      <li key={item.id}>
                        <WeightLink
                          text={item.title}
                          onClick={() => navigateBook(item)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  const body = (
    <div className="toc__body">
      {timelineSection}
      {topicsSection}
      {bookSection}
    </div>
  );

  if (embedded) {
    return (
      <div className="toc toc--embedded">
        <h2 className="toc__heading">Contents</h2>
        {body}
      </div>
    );
  }

  return (
    <div className={`toc chrome no-print${open ? ' toc--open' : ''}`}>
      <button
        className="toc__toggle"
        onClick={() => setOpenPanel(open ? null : 'toc')}
        aria-expanded={open}
      >
        ☰ Contents
      </button>
      {open && body}
    </div>
  );
}
