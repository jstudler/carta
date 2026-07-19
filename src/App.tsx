/**
 * App shell. Applies the active colour scheme to :root, keeps the viewport size
 * in the store, wires the global hooks (URL sync, keyboard), and lays out the
 * canvas plus the UI chrome — full chrome on desktop, a sandwich menu on mobile.
 */

import { useEffect } from 'react';
import { useStore } from './store';
import { colorScheme, config } from './content';
import { applyFavicon } from './lib/favicon';
import { Canvas } from './canvas/Canvas';
import { Controls } from './ui/Controls';
import { MiniMap } from './ui/MiniMap';
import { TableOfContents } from './ui/TableOfContents';
import { SearchBar } from './ui/SearchBar';
import { FilterBar } from './ui/FilterBar';
import { MobileMenu } from './ui/MobileMenu';
import { PrintView } from './ui/PrintView';
import { BookView } from './ui/BookView';
import { ShortcutsHelp } from './ui/ShortcutsHelp';
import { cornerStyle } from './ui/corners';
import { useUrlSync } from './hooks/useUrlSync';
import { useKeyboard } from './hooks/useKeyboard';
import { useMediaQuery } from './hooks/useMediaQuery';

/** Write the active colour scheme to CSS custom properties on :root. */
function applyColorScheme(): void {
  const root = document.documentElement.style;
  root.setProperty('--scheme-bg', colorScheme.background);
  root.setProperty('--scheme-axis', colorScheme.axis);
  root.setProperty('--scheme-muted', colorScheme.muted);
  root.setProperty('--scheme-accent', colorScheme.accent);
  colorScheme.cards.forEach((c, i) => {
    root.setProperty(`--card-${i + 1}-bg`, c.background);
    root.setProperty(`--card-${i + 1}-fg`, c.font);
  });
  // Render the favicon from the active scheme so the browser tab matches it.
  applyFavicon(colorScheme);
}

export function App(): React.ReactElement {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const mapVisible = useStore((s) => s.mapVisible);
  const view = useStore((s) => s.view);

  useUrlSync();
  useKeyboard();

  useEffect(() => {
    applyColorScheme();
  }, []);

  // Keep viewport size in the store.
  useEffect(() => {
    const onResize = (): void => useStore.getState().setViewport(window.innerWidth, window.innerHeight);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <>
      {view === 'book' ? (
        <>
          <BookView />
          {isMobile ? (
            <MobileMenu />
          ) : (
            <div className="chrome-cluster chrome-cluster--right no-print" style={cornerStyle(config.corners.controls)}>
              <Controls />
            </div>
          )}
        </>
      ) : (
        <>
          <Canvas />

          {isMobile ? (
            <MobileMenu />
          ) : (
            <>
              <div
                className="chrome-cluster chrome-cluster--left no-print"
                style={cornerStyle(config.corners.tableOfContents)}
              >
                <TableOfContents />
                <SearchBar />
              </div>
              <div
                className="chrome-cluster chrome-cluster--right no-print"
                style={cornerStyle(config.corners.controls)}
              >
                <Controls />
                {mapVisible && <MiniMap />}
              </div>
              <FilterBar />
            </>
          )}
        </>
      )}

      <ShortcutsHelp />
      <PrintView />
    </>
  );
}
