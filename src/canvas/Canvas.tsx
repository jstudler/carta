/**
 * Canvas — the single GPU-composited world surface. Holds every card, wires up
 * maps-like pan/zoom, projects the screen-space overlays (timeline axis / topic
 * labels), and handles "click empty space to zoom back out".
 *
 * Panning/zooming is applied to `.canvas-world` imperatively by the camera
 * controller, so this component only re-renders on discrete state changes
 * (view, focus, category filter).
 */

import { useCallback, useEffect, useRef } from 'react';
import { useStore, isItemVisible } from '../store';
import { content, config } from '../content';
import { camera } from '../lib/camera';
import { focusItem, blurFocused } from '../lib/navigation';
import { usePanZoom } from './usePanZoom';
import { Card } from './Card';
import { TopicLines } from './TopicLines';
import { TimelineAxis } from './TimelineAxis';
import { TopicLabels } from './TopicLabels';
import type { ContentItem } from '../../shared/contentTypes';

const TAP_THRESHOLD = 6; // px of movement below which a pointer up counts as a tap

export function Canvas(): React.ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const view = useStore((s) => s.view);
  const focusedId = useStore((s) => s.focusedId);
  const activeCategories = useStore((s) => s.activeCategories);
  const activeTopics = useStore((s) => s.activeTopics);
  const activeTypes = useStore((s) => s.activeTypes);
  const transitioning = useStore((s) => s.transitioning);

  usePanZoom(viewportRef);

  useEffect(() => {
    camera.attach(worldRef.current);
  }, []);

  const handlePointerDown = (e: React.PointerEvent): void => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  // Tapping empty canvas while an item is focused zooms back out.
  const handlePointerUp = (e: React.PointerEvent): void => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || !focusedId) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (moved > TAP_THRESHOLD) return;
    // Ignore taps on cards — the card's click handler manages focus transitions.
    if ((e.target as HTMLElement).closest('[data-item-id]')) return;
    blurFocused();
  };

  // Stable identity: Card is memo'd, and a fresh closure here would defeat it,
  // re-rendering every card whenever any canvas state (transition, filters, …)
  // changes.
  const handleFocus = useCallback(
    (item: ContentItem): void => {
      focusItem(item, view);
    },
    [view],
  );

  // Book view has its own rendering — no canvas needed.
  if (view === 'book') return <></>;

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      style={{
        ['--view-morph' as string]: `${config.animation.viewTransition}s`,
        ['--corner-scale' as string]: config.canvas.cornerRadiusScale,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <div
        ref={worldRef}
        className={`canvas-world${transitioning ? ' canvas-world--morphing' : ''}`}
      >
        <TopicLines view={view} />
        {content.items.map((item) => {
          const visible = isItemVisible(item, activeCategories, activeTopics, activeTypes);
          if (!visible) return null;
          return (
            <Card
              key={item.id}
              item={item}
              view={view}
              focused={focusedId === item.id}
              onFocus={handleFocus}
            />
          );
        })}
      </div>

      {view === 'timeline' ? <TimelineAxis /> : <TopicLabels />}
    </div>
  );
}
