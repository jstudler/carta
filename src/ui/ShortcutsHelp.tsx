/**
 * ShortcutsHelp — a modal overlay with app introduction, UI guide, keyboard
 * shortcuts, and build info. Toggled by the `?` key or the controls-bar help
 * button (see useKeyboard / Controls).
 */

import { useStore } from '../store';

/* ------------------------------------------------------------------ */
/*  Static data                                                       */
/* ------------------------------------------------------------------ */

const SHORTCUTS: ReadonlyArray<{ keys: string; action: string }> = [
  { keys: '← / →', action: 'Previous / next card' },
  { keys: 'Space', action: 'Stop all media' },
  { keys: 'Esc', action: 'Close overlay · zoom out to fit all' },
  { keys: '⌘/Ctrl + F', action: 'Focus the search box' },
  { keys: '?', action: 'Toggle this help' },
];

const COMMIT = __COMMIT_HASH__;

/* ------------------------------------------------------------------ */
/*  Inline SVG icons (matching Controls.tsx)                          */
/* ------------------------------------------------------------------ */

function CalendarIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function HelpIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.8 2.8 0 0 1 5.3 1.1c0 1.9-2.8 2.5-2.8 4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Static UI previews                                                */
/* ------------------------------------------------------------------ */

/** Non-interactive miniature of the Contents panel. */
function TocPreview(): React.ReactElement {
  return (
    <div className="help-preview help-preview--toc" aria-hidden="true">
      <div className="help-preview__chrome">
        <button className="help-preview__section-head" tabIndex={-1}>▸ As Timeline</button>
        <button className="help-preview__section-head help-preview__section-head--active" tabIndex={-1}>▾ As Topics</button>
        <div className="help-preview__indent">
          <span className="help-preview__group">Topic A</span>
          <div className="help-preview__indent">
            <span className="help-preview__leaf">Entry 1</span>
            <span className="help-preview__leaf">Entry 2</span>
          </div>
          <span className="help-preview__group">Topic B</span>
          <div className="help-preview__indent">
            <span className="help-preview__leaf">Entry 3</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Non-interactive miniature of the Search panel. */
function SearchPreview(): React.ReactElement {
  return (
    <div className="help-preview help-preview--search" aria-hidden="true">
      <div className="help-preview__chrome">
        <div className="help-preview__search-input">
          <span className="help-preview__placeholder">Search…</span>
        </div>
        <div className="help-preview__search-result">
          <span className="help-preview__result-title">Result title</span>
          <span className="help-preview__result-snippet">…matched text snippet…</span>
        </div>
        <div className="help-preview__search-result">
          <span className="help-preview__result-title">Another result</span>
          <span className="help-preview__result-snippet">…more context…</span>
        </div>
      </div>
    </div>
  );
}

/** Non-interactive miniature of the Controls bar. */
function ControlsPreview(): React.ReactElement {
  return (
    <div className="help-preview help-preview--controls" aria-hidden="true">
      <div className="help-preview__chrome help-preview__controls-row">
        <span className="help-preview__seg-toggle">
          <span className="help-preview__seg"><CalendarIcon /></span>
          <span className="help-preview__seg help-preview__seg--active">◆</span>
          <span className="help-preview__seg">📄</span>
        </span>
        <span className="help-preview__btn">■</span>
        <span className="help-preview__btn">🔊</span>
        <span className="help-preview__btn">🗺️</span>
        <span className="help-preview__btn">🔗</span>
        <span className="help-preview__btn">🖨️</span>
        <span className="help-preview__btn help-preview__btn--help"><HelpIcon /></span>
      </div>
    </div>
  );
}

/** Non-interactive miniature of the Map. */
function MapPreview(): React.ReactElement {
  return (
    <div className="help-preview help-preview--map" aria-hidden="true">
      <div className="help-preview__chrome help-preview__map-area">
        {/* Fake card dots */}
        <span className="help-preview__map-dot" style={{ top: '20%', left: '15%' }} />
        <span className="help-preview__map-dot" style={{ top: '35%', left: '30%' }} />
        <span className="help-preview__map-dot" style={{ top: '50%', left: '50%' }} />
        <span className="help-preview__map-dot" style={{ top: '65%', left: '70%' }} />
        <span className="help-preview__map-dot" style={{ top: '30%', left: '80%' }} />
        <span className="help-preview__map-dot" style={{ top: '70%', left: '25%' }} />
        {/* Viewport indicator */}
        <span className="help-preview__map-viewport" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ShortcutsHelp(): React.ReactElement | null {
  const open = useStore((s) => s.shortcutsOpen);
  const setOpen = useStore((s) => s.setShortcutsOpen);
  if (!open) return null;

  return (
    <div
      className="shortcuts-overlay no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Help"
      onClick={() => setOpen(false)}
    >
      <div className="shortcuts-panel" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-panel__header">
          <h2>Help</h2>
          <button
            className="chrome-button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* ---- Introduction ----------------------------------------- */}
        <section className="help-section">
          <h3 className="help-section__title">Getting started</h3>
          <p className="help-section__text">
            Carta presents artistic research on an interactive, zoomable canvas.
            Cards are arranged by time or by topic — zoom, pan, and click to explore.
            Three views are available: <strong>Timeline</strong> (chronological),{' '}
            <strong>Topic</strong> (grouped by subject), and <strong>Book</strong>{' '}
            (a scrollable reading view). Use the controls described below to
            navigate, search, and filter the content.
          </p>
        </section>

        {/* ---- UI sections ------------------------------------------ */}
        <section className="help-section">
          <h3 className="help-section__title">Interface</h3>

          <div className="help-ui-grid">
            <div className="help-ui-card">
              <h4>Contents</h4>
              <p>Browse all entries organised as a timeline or by topic. Click an entry to navigate to it on the canvas.</p>
              <TocPreview />
            </div>

            <div className="help-ui-card">
              <h4>Search</h4>
              <p>Fuzzy full-text search across all cards. Select a result to jump to it.</p>
              <SearchPreview />
            </div>

            <div className="help-ui-card">
              <h4>Navigation</h4>
              <p>Switch between views, stop or mute media, toggle the map, share links, and export to PDF.</p>
              <ControlsPreview />
            </div>

            <div className="help-ui-card">
              <h4>Map</h4>
              <p>A minimap thumbnail of the full canvas. Drag the viewport indicator to pan; click anywhere to jump there.</p>
              <MapPreview />
            </div>
          </div>
        </section>

        {/* ---- Keyboard shortcuts ----------------------------------- */}
        <section className="help-section">
          <h3 className="help-section__title">Keyboard shortcuts</h3>
          <dl className="shortcuts-list">
            {SHORTCUTS.map((s) => (
              <div className="shortcuts-list__row" key={s.keys}>
                <dt>
                  <kbd>{s.keys}</kbd>
                </dt>
                <dd>{s.action}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---- Footer ----------------------------------------------- */}
        <footer className="help-footer">
          This website was built using{' '}
          <a href="https://github.com/jstudler/carta" target="_blank" rel="noopener noreferrer">
            carta
          </a>{' '}
          (commit{' '}
          <a
            href={`https://github.com/jstudler/carta/commit/${COMMIT}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {COMMIT}
          </a>
          ).{' '}
          <a
            href="https://github.com/jstudler/carta/issues/new?template=bug_report.yml"
            target="_blank"
            rel="noopener noreferrer"
          >
            Report a bug
          </a>
        </footer>
      </div>
    </div>
  );
}
