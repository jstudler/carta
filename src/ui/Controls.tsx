/**
 * Controls cluster — view toggle, global pause, global mute, and share. Pinned to
 * its configured corner. Hidden inside the sandwich menu on mobile (see App).
 */

import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { content, config, colorScheme } from '../content';
import { switchView } from '../lib/navigation';
import { faviconDataUri } from '../lib/favicon';
import { mediaRegistry } from '../media/mediaRegistry';
import { cornerStyle } from './corners';
import { toKebab } from '../lib/text';

/** The app icon (favicon) for the active scheme, reused as the topic-view icon. */
const APP_ICON = faviconDataUri(colorScheme);

function StopIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

function CalendarIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function HelpIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.2a2.8 2.8 0 0 1 5.3 1.1c0 1.9-2.8 2.5-2.8 4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Controls({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const view = useStore((s) => s.view);
  const muted = useStore((s) => s.muted);
  const volume = useStore((s) => s.volume);
  const mapVisible = useStore((s) => s.mapVisible);
  const storeIsPlaying = useStore((s) => s.playingGroupId !== null);
  const [nativePlaying, setNativePlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Track native media play/pause state in book view.
  useEffect(() => {
    if (view !== 'book') { setNativePlaying(false); return; }
    const onPlay = (): void => setNativePlaying(true);
    const onPause = (): void => {
      // Check if ANY media is still playing.
      const any = Array.from(document.querySelectorAll<HTMLMediaElement>('video, audio'))
        .some((el) => !el.paused);
      setNativePlaying(any);
    };
    document.addEventListener('play', onPlay, true);
    document.addEventListener('pause', onPause, true);
    document.addEventListener('ended', onPause, true);
    return () => {
      document.removeEventListener('play', onPlay, true);
      document.removeEventListener('pause', onPause, true);
      document.removeEventListener('ended', onPause, true);
    };
  }, [view]);

  const playing = storeIsPlaying || nativePlaying;

  const setView = (to: 'timeline' | 'topic' | 'book'): void => {
    if (to === view) return;
    if (to === 'book') {
      // Push book URL with currently focused card (if any) so BookView scrolls there.
      const focusedId = useStore.getState().focusedId;
      const focusedItem = focusedId ? content.items.find((i) => i.id === focusedId) : undefined;
      const query = focusedItem
        ? `?view=book&topic=${toKebab(focusedItem.topic)}&card=${toKebab(focusedItem.title)}`
        : '?view=book';
      window.history.pushState(null, '', query);
      useStore.getState().setView('book');
    } else {
      // Switching from book to canvas view: set view then fit the canvas.
      if (view === 'book') {
        useStore.getState().setView(to);
        requestAnimationFrame(() => {
          void switchView(to, (v) => content.bounds[v]);
        });
      } else {
        void switchView(to, (v) => content.bounds[v]);
      }
    }
  };

  // Global stop: pause all media everywhere.
  const stopAll = (): void => {
    if (view === 'book') {
      document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => el.pause());
    }
    mediaRegistry.pauseAll();
  };

  const toggleMute = (): void => {
    const next = !muted;
    useStore.getState().setMuted(next);
    mediaRegistry.setMutedAll(next);
    // Also apply to native media in book view.
    document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => {
      el.muted = next;
    });
  };

  const onVolume = (value: number): void => {
    useStore.getState().setVolume(value);
    // Only adjust the groups actually playing; idle media reads the value on play.
    mediaRegistry.setVolumeActive(value);
    // Also apply to native media in book view.
    document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => {
      el.volume = value;
    });
  };

  const share = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the URL already reflects the state regardless.
      setCopied(false);
    }
  };

  return (
    <div
      className={`controls${embedded ? ' controls--embedded' : ' chrome no-print'}`}
      style={embedded ? undefined : cornerStyle(config.corners.controls)}
      role="toolbar"
      aria-label="View controls"
    >
      <div className="seg-toggle" role="group" aria-label="View">
        <button
          className={`seg-toggle__seg${view === 'timeline' ? ' active' : ''}`}
          onClick={() => setView('timeline')}
          aria-pressed={view === 'timeline'}
          title="Timeline view"
          aria-label="Timeline view"
        >
          <CalendarIcon />
        </button>
        <button
          className={`seg-toggle__seg${view === 'topic' ? ' active' : ''}`}
          onClick={() => setView('topic')}
          aria-pressed={view === 'topic'}
          title="Topic view"
          aria-label="Topic view"
        >
          <img className="seg-toggle__appicon" src={APP_ICON} alt="" />
        </button>
        <button
          className={`seg-toggle__seg${view === 'book' ? ' active' : ''}`}
          onClick={() => setView('book')}
          aria-pressed={view === 'book'}
          title="Book view"
          aria-label="Book view"
        >
          📄
        </button>
      </div>
      <button
        className="chrome-button"
        onClick={stopAll}
        title="Stop all media"
        aria-label="Stop"
        style={{ opacity: playing ? 1 : 0, pointerEvents: playing ? 'auto' : 'none' }}
      >
        <StopIcon />
      </button>
      <button
        className="chrome-button"
        onClick={toggleMute}
        aria-pressed={muted}
        title={muted ? 'Unmute' : 'Mute'}
        aria-label="Toggle mute"
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <input
        className="chrome-volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => onVolume(Number(e.target.value))}
        title="Volume (all media)"
        aria-label="Volume"
      />
      <button
        className="chrome-button"
        onClick={() => useStore.getState().toggleMap()}
        aria-pressed={mapVisible}
        title={mapVisible ? 'Hide map' : 'Show map'}
        aria-label="Toggle map"
        style={{ opacity: view !== 'book' ? 1 : 0, pointerEvents: view !== 'book' ? 'auto' : 'none' }}
      >
        🗺️
      </button>
      <button
        className="chrome-button"
        onClick={() => void share()}
        title="Copy shareable link"
        aria-label="Share"
      >
        {copied ? '✅' : '🔗'}
      </button>
      <button
        className="chrome-button"
        onClick={() => window.print()}
        title="Export / print as PDF (A4)"
        aria-label="Export PDF"
      >
        🖨️
      </button>
      <button
        className="chrome-button chrome-button--help"
        onClick={() => useStore.getState().setShortcutsOpen(true)}
        title="Help / keyboard shortcuts (?)"
        aria-label="Help"
      >
        <HelpIcon />
      </button>
    </div>
  );
}
