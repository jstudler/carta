/**
 * PlyrPlayer — mounts a native <video>/<audio> element with Plyr's cross-browser
 * control bar (play/pause, scrubber, volume, time) and registers it with the
 * item's SyncGroup (global single-group playback + synced multi-video alignment).
 *
 * IMPORTANT: the media element is created IMPERATIVELY inside a host <div> that
 * React owns, rather than via JSX. Plyr wraps/moves the element into its own DOM
 * containers; if React also managed that element, unmounting would throw
 * (removeChild on a node Plyr relocated) and tear down the whole canvas. Letting
 * React own only the stable host div, and cleaning up imperatively, avoids that.
 */

import { useEffect, useRef } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';
import type { Sidecar } from '../../shared/contentTypes';
import { mediaRegistry } from './mediaRegistry';
import { useStore } from '../store';

interface Props {
  itemId: string;
  sidecar: Sidecar;
  /** Master gets full controls + is the sync clock; slaves render bare + synced. */
  isMaster: boolean;
}

export function PlyrPlayer({ itemId, sidecar, isMaster }: Props): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Create the media element ourselves so Plyr can manipulate it freely.
    const el = document.createElement(sidecar.kind === 'audio' ? 'audio' : 'video') as
      | HTMLVideoElement
      | HTMLAudioElement;
    // Provide every web encoding as a <source> (modern → fallback) so the
    // browser picks the best one it supports.
    for (const s of sidecar.sources) {
      const source = document.createElement('source');
      source.src = s.url;
      source.type = s.type;
      el.appendChild(source);
    }
    el.preload = 'metadata';
    el.muted = useStore.getState().muted || !isMaster;
    // Read the global volume once, before playback (the knob then only adjusts
    // groups that are actually playing — see mediaRegistry.setVolumeActive).
    el.volume = useStore.getState().volume;
    if (sidecar.kind !== 'audio') {
      (el as HTMLVideoElement).playsInline = true;
    }
    host.appendChild(el);

    const group = mediaRegistry.group(itemId);
    group.add(el);

    let plyr: Plyr | null = null;
    if (isMaster) {
      plyr = new Plyr(el, {
        // Volume + mute are controlled globally from the toolbar, so they are
        // intentionally omitted from the per-player control bar.
        controls: ['play', 'progress', 'current-time', 'duration', 'fullscreen'],
        clickToPlay: true,
        keyboard: { focused: true, global: false },
      });
    }

    // Keep the element's mute in sync with the GLOBAL mute flag only (slaves stay
    // muted regardless). Volume is set once above + by the live knob while playing.
    const unsubscribe = useStore.subscribe((state) => {
      el.muted = state.muted || !isMaster;
    });

    return () => {
      unsubscribe();
      group.remove(el);
      // Destroy Plyr first (restores the element), then drop our host's contents.
      try {
        plyr?.destroy();
      } catch {
        /* Plyr may already be partially torn down; ignore. */
      }
      host.replaceChildren();
    };
  }, [itemId, isMaster, sidecar.url, sidecar.kind]);

  return <div ref={hostRef} className="plyr-host" />;
}
