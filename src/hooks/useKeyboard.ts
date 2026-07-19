/**
 * Global keyboard controls:
 *  - ← / →     : navigate to the previous / next card (no zoom change)
 *  - Space     : stop all media
 *  - Esc       : close shortcuts overlay, zoom out to fit all cards
 *  - Cmd/Ctrl+F: focus the search box
 *  - ?         : toggle the keyboard-shortcuts overlay
 */

import { useEffect } from 'react';
import { useStore } from '../store';
import { navigateStep, blurFocused, fitAll } from '../lib/navigation';
import { mediaRegistry } from '../media/mediaRegistry';
import { content } from '../content';

export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const store = useStore.getState();

      // Cmd/Ctrl+F focuses the search box (disabled in book view for native browser search).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        if (store.view === 'book') return; // Let browser handle it.
        e.preventDefault();
        store.setOpenPanel('search');
        // Defer so the panel is open before we focus its input.
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLInputElement>('.search__input');
          input?.focus();
          input?.select();
        });
        return;
      }

      // Ignore the remaining shortcuts when typing in the search box or any input.
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          navigateStep(store.view, 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          navigateStep(store.view, -1);
          break;
        case 'Escape':
          if (store.shortcutsOpen) store.setShortcutsOpen(false);
          if (store.focusedId) blurFocused();
          // Zoom out to fit all cards in the current view.
          if (store.view !== 'book') {
            fitAll(content.bounds[store.view]);
          }
          break;
        case '?':
          e.preventDefault();
          store.setShortcutsOpen(!store.shortcutsOpen);
          break;
        case ' ':
        case 'Spacebar': {
          e.preventDefault();
          // Global stop: pause all media.
          mediaRegistry.pauseAll();
          // Also pause native media in book view.
          document.querySelectorAll<HTMLMediaElement>('video, audio').forEach((el) => el.pause());
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
