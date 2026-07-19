/**
 * MobileMenu — on small screens all chrome (controls, map, TOC, filter, search)
 * collapses behind a sandwich menu. The menu also exposes an info icon that
 * reveals the project abstract, as required for mobile.
 */

import { useState } from 'react';
import { useStore } from '../store';
import { content, itemsById } from '../content';
import { Controls } from './Controls';
import { MiniMap } from './MiniMap';
import { TableOfContents } from './TableOfContents';
import { FilterBar } from './FilterBar';
import { SearchBar } from './SearchBar';

export function MobileMenu(): React.ReactElement {
  const open = useStore((s) => s.menuOpen);
  const setOpen = useStore((s) => s.setMenuOpen);
  const view = useStore((s) => s.view);
  const [showAbstract, setShowAbstract] = useState(false);

  const abstract = content.abstractId ? itemsById.get(content.abstractId) : undefined;
  const isBook = view === 'book';

  return (
    <div className="mobile no-print">
      <button
        className="chrome chrome-button mobile__toggle"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? '✕' : '☰'}
      </button>

      {open && (
        <div className="mobile__panel chrome">
          <div className="mobile__row">
            <Controls embedded />
            {abstract && (
              <button
                className="chrome-button"
                aria-label="About this project"
                onClick={() => setShowAbstract((v) => !v)}
              >
                ℹ️
              </button>
            )}
          </div>

          {showAbstract && abstract && (
            <section className="mobile__abstract">
              <h2>{abstract.title}</h2>
              <div dangerouslySetInnerHTML={{ __html: abstract.html }} />
            </section>
          )}

          {!isBook && <SearchBar embedded />}
          {!isBook && <FilterBar embedded />}
          {!isBook && <MiniMap embedded />}
          <TableOfContents embedded />
        </div>
      )}
    </div>
  );
}
