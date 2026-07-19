/**
 * SearchBar — fuzzy full-text search (Fuse.js over the build-time corpus).
 * Selecting a result glides the canvas to that card.
 */

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { fuse, itemsById } from '../content';
import { focusItem } from '../lib/navigation';
import { truncate } from '../lib/text';

export function SearchBar({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const view = useStore((s) => s.view);
  const search = useStore((s) => s.search);
  const setSearch = useStore((s) => s.setSearch);
  const openPanel = useStore((s) => s.openPanel);
  const setOpenPanel = useStore((s) => s.setOpenPanel);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const results = useMemo(() => {
    if (search.trim().length < 2) return [];
    return fuse.search(search.trim()).slice(0, 8);
  }, [search]);

  // Reset selection when results change.
  useEffect(() => { setSelectedIndex(-1); }, [results]);

  // Embedded (mobile) keeps a local open flag; desktop shares the exclusive panel.
  const [embeddedActive, setEmbeddedActive] = useState(false);
  const active = embedded ? embeddedActive : openPanel === 'search';

  const go = useCallback((id: string): void => {
    const item = itemsById.get(id);
    if (item) focusItem(item, view);
    if (embedded) setEmbeddedActive(false);
    else setOpenPanel(null);
  }, [view, embedded, setOpenPanel]);

  const onFocus = (): void => {
    if (embedded) setEmbeddedActive(true);
    else setOpenPanel('search');
  };

  const onClick = (): void => {
    // Re-show results when clicking the input (even if already focused).
    if (embedded) setEmbeddedActive(true);
    else if (openPanel !== 'search') setOpenPanel('search');
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
      e.preventDefault();
      go(results[selectedIndex].item.id);
    }
  };

  // Cmd+F / Ctrl+F focuses the search input (disabled in book view to allow browser search).
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        if (useStore.getState().view === 'book') return; // Let browser handle it.
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        if (!embedded) setOpenPanel('search');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [embedded, setOpenPanel]);

  return (
    <div className={`search${embedded ? ' search--embedded' : ' chrome no-print'}`}>
      <input
        ref={inputRef}
        className="search__input"
        type="search"
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={onFocus}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label="Search content"
      />
      {active && results.length > 0 && (
        <ul className="search__results">
          {results.map((r, i) => (
            <li key={r.item.id}>
              <button
                className={i === selectedIndex ? 'search__result--active' : ''}
                onClick={() => go(r.item.id)}
              >
                <strong>{r.item.title}</strong>
                <span className="search__snippet">{truncate(r.item.text, 80)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
