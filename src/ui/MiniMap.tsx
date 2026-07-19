/**
 * MiniMap — a thumbnail of the whole canvas for the current view with a draggable
 * viewport indicator. Dragging the indicator (or clicking outside it) pans the
 * canvas; zoom is never affected. Pinned to its configured corner.
 */

import { useRef } from 'react';
import { useStore } from '../store';
import { content, config, topicPalette } from '../content';
import { camera } from '../lib/camera';
import { centerOn } from '../../shared/geometry';
import { cornerStyle } from './corners';
import { toTitleCase } from '../lib/text';

const MAP_W = config.ui.mapWidth;
const MAP_H = config.ui.mapHeight;
const PAD = 8;

export function MiniMap({ embedded = false }: { embedded?: boolean }): React.ReactElement {
  const view = useStore((s) => s.view);
  const transform = useStore((s) => s.transform);
  const viewport = useStore((s) => s.viewport);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const bounds = content.bounds[view];
  const scale = Math.min(
    (MAP_W - PAD * 2) / Math.max(1, bounds.width),
    (MAP_H - PAD * 2) / Math.max(1, bounds.height),
  );
  const offsetX = PAD + (MAP_W - PAD * 2 - bounds.width * scale) / 2;
  const offsetY = PAD + (MAP_H - PAD * 2 - bounds.height * scale) / 2;

  const toMini = (wx: number, wy: number): { x: number; y: number } => ({
    x: (wx - bounds.x) * scale + offsetX,
    y: (wy - bounds.y) * scale + offsetY,
  });
  const toWorld = (mx: number, my: number): { x: number; y: number } => ({
    x: (mx - offsetX) / scale + bounds.x,
    y: (my - offsetY) / scale + bounds.y,
  });

  // Currently visible world rectangle, projected to mini coordinates.
  const visTL = toMini(
    (0 - transform.x) / transform.zoom,
    (0 - transform.y) / transform.zoom,
  );
  const visBR = toMini(
    (viewport.width - transform.x) / transform.zoom,
    (viewport.height - transform.y) / transform.zoom,
  );
  const viewRect = {
    x: visTL.x,
    y: visTL.y,
    w: Math.max(6, visBR.x - visTL.x),
    h: Math.max(6, visBR.y - visTL.y),
  };

  const panToMini = (clientX: number, clientY: number): void => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const world = toWorld(mx, my);
    camera.set(centerOn(world, transform.zoom, viewport.width, viewport.height));
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    panToMini(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    if (dragging.current) panToMini(e.clientX, e.clientY);
  };
  const onPointerUp = (): void => {
    dragging.current = false;
  };

  // Topic titles (topic view) sit at each cluster centre, mirroring the canvas.
  const topicLabels =
    view === 'topic'
      ? content.clusters.map((cluster) => ({
          key: cluster.topic,
          label: toTitleCase(cluster.topic),
          pos: toMini(cluster.center.x, cluster.center.y),
        }))
      : [];

  // Year labels (timeline view), centred vertically on the timeline axis.
  const yearLabels: { key: number; label: string; x: number; y: number }[] = [];
  if (view === 'timeline' && content.timeRange.max) {
    const startYear = new Date(content.timeRange.min).getFullYear();
    const endYear = new Date(content.timeRange.max).getFullYear();
    const axisY = toMini(0, 0).y;
    for (let y = startYear; y <= endYear; y += 1) {
      const ts = new Date(y, 0, 1).getTime();
      const worldX = (ts - content.timelineMinTimestamp) * content.timelineScale;
      const p = toMini(worldX, 0);
      if (p.x < PAD || p.x > MAP_W - PAD) continue;
      yearLabels.push({ key: y, label: String(y), x: p.x, y: axisY });
    }
  }

  return (
    <div
      ref={ref}
      className={`minimap${embedded ? ' minimap--embedded' : ' chrome no-print'}`}
      style={{
        width: MAP_W,
        height: MAP_H,
        ...(embedded ? {} : cornerStyle(config.corners.map, 52)),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      role="navigation"
      aria-label="Canvas minimap"
    >
      {content.items.map((item) => {
        const r = item.layout[view].bounds;
        const tl = toMini(r.x, r.y);
        // General-topic cards use a dark surface on the canvas (see Card.tsx);
        // reflect that same colour here so they read as distinct on the map too.
        const background = topicPalette.surfaceForTopic(item.topic).background;
        return (
          <div
            key={item.id}
            className="minimap__item"
            style={{
              left: tl.x,
              top: tl.y,
              width: Math.max(2, r.width * scale),
              height: Math.max(2, r.height * scale),
              background,
            }}
          />
        );
      })}
      <div
        className="minimap__viewport"
        style={{ left: viewRect.x, top: viewRect.y, width: viewRect.w, height: viewRect.h }}
      />
      {topicLabels.map((t) => (
        <div
          key={t.key}
          className="minimap__label"
          style={{ left: t.pos.x, top: t.pos.y }}
        >
          {t.label}
        </div>
      ))}
      {yearLabels.map((y) => (
        <div
          key={y.key}
          className="minimap__label minimap__label--year"
          style={{ left: y.x, top: y.y }}
        >
          {y.label}
        </div>
      ))}
    </div>
  );
}
