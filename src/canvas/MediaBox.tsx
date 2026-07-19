/**
 * MediaBox — renders a single sidecar (picture / video / audio) as one of the
 * grouped sub-boxes of an item. Pictures always render (with native lazy
 * loading); video/audio only mount their media element when the item is focused
 * (clicked to zoom in), preventing dozens of simultaneous metadata requests that
 * would throttle Cloudflare Pages. A lightweight placeholder (▶ / ♪) is shown
 * until focus.
 */

import type { Sidecar } from '../../shared/contentTypes';
import { useEffect, useRef } from 'react';
import { PlyrPlayer } from '../media/PlyrPlayer';

interface Props {
  itemId: string;
  sidecar: Sidecar;
  isMaster: boolean;
  /** True when the parent item is focused (zoomed in). */
  active: boolean;
}

export function MediaBox({ itemId, sidecar, isMaster, active }: Props): React.ReactElement {
  const playerRef = useRef<HTMLDivElement>(null);

  // Stop pointer/touch/wheel events from reaching the canvas viewport's
  // pan/zoom gesture (which is bound via NATIVE listeners on an ancestor, so a
  // React stopPropagation would fire too late). This lets the user scrub the
  // Plyr timeline and use the controls without dragging the canvas underneath.
  useEffect(() => {
    const node = playerRef.current;
    if (!node) return;
    const stop = (e: Event): void => e.stopPropagation();
    const opts = { capture: false } as const;
    node.addEventListener('pointerdown', stop, opts);
    node.addEventListener('mousedown', stop, opts);
    node.addEventListener('touchstart', stop, opts);
    node.addEventListener('wheel', stop, opts);
    return () => {
      node.removeEventListener('pointerdown', stop, opts);
      node.removeEventListener('mousedown', stop, opts);
      node.removeEventListener('touchstart', stop, opts);
      node.removeEventListener('wheel', stop, opts);
    };
  }, [active]);

  const style: React.CSSProperties = {
    left: sidecar.relX,
    top: sidecar.relY,
    width: sidecar.renderWidth,
    height: sidecar.renderHeight,
  };

  return (
    <div className={`media-box${sidecar.kind === 'text' ? ' media-box--text' : ''}`} style={style}>
      {sidecar.kind === 'text' && sidecar.html && (
        <div
          className="media-box__text card__body"
          dangerouslySetInnerHTML={{ __html: sidecar.html }}
        />
      )}

      {sidecar.kind === 'picture' && (
        <picture>
          {sidecar.sources.slice(0, -1).map((s) => (
            <source key={s.url} srcSet={s.url.replace(/ /g, '%20')} type={s.type} />
          ))}
          <img
            src={(sidecar.sources[sidecar.sources.length - 1] ?? { url: sidecar.url }).url}
            alt={sidecar.description ?? ''}
            loading="lazy"
            draggable={false}
          />
        </picture>
      )}

      {/* Video/audio: only show a static placeholder when not focused.
          No <video> element is mounted here — this avoids preload="metadata"
          requests that would flood Cloudflare Pages with simultaneous fetches.
          For video we paint the inlined LQIP still (a base64 data URI carried in
          the content index, so it costs no request either) and fall back to a
          flat tint when the media has not been through `convert:media` yet. */}
      {sidecar.kind === 'video' && !active && (
        sidecar.lqip ? (
          <img className="media-box__poster-lqip" src={sidecar.lqip} alt="" draggable={false} />
        ) : (
          <div className="media-box__poster-placeholder" />
        )
      )}

      {sidecar.kind === 'audio' && (
        <div className="media-box__audio-poster" />
      )}

      {sidecar.kind !== 'picture' && sidecar.kind !== 'text' && !active && (
        <div className="media-box__play" aria-hidden>▶</div>
      )}

      {sidecar.kind !== 'picture' && sidecar.kind !== 'text' && active && (
        <div ref={playerRef} className="media-box__player">
          <PlyrPlayer itemId={itemId} sidecar={sidecar} isMaster={isMaster} />
        </div>
      )}

      {sidecar.description && <div className="media-box__caption">{sidecar.description}</div>}
    </div>
  );
}
