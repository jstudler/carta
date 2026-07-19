/**
 * Maps-like pan/zoom input. Wires @use-gesture to the camera controller:
 *  - drag            → pan
 *  - wheel / trackpad→ zoom toward the cursor
 *  - pinch           → zoom toward the pinch centre
 *  - double click    → smooth zoom-in toward the cursor
 *
 * Any manual interaction cancels autoplay and any in-flight automated motion.
 */

import { useGesture } from '@use-gesture/react';
import { useRef, type RefObject } from 'react';
import { camera, MIN_ZOOM, MAX_ZOOM } from '../lib/camera';
import { clamp } from '../../shared/geometry';

const WHEEL_SENSITIVITY = 0.0015;

/** Zoom around a screen point, keeping the world point under it fixed. */
function zoomAround(screenX: number, screenY: number, nextZoom: number): void {
  const cur = camera.get();
  const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const worldX = (screenX - cur.x) / cur.zoom;
  const worldY = (screenY - cur.y) / cur.zoom;
  camera.set({ zoom: z, x: screenX - worldX * z, y: screenY - worldY * z });
}

export function usePanZoom(targetRef: RefObject<HTMLElement | null>): { dragging: boolean } {
  const draggingRef = useRef(false);

  const cancelAutomation = (): void => {
    camera.stop();
  };

  useGesture(
    {
      onDragStart: () => {
        draggingRef.current = true;
        cancelAutomation();
        targetRef.current?.classList.add('dragging');
      },
      onDrag: ({ delta: [dx, dy], pinching }) => {
        if (pinching) return;
        const cur = camera.get();
        camera.set({ ...cur, x: cur.x + dx, y: cur.y + dy });
      },
      onDragEnd: () => {
        draggingRef.current = false;
        targetRef.current?.classList.remove('dragging');
      },
      onWheel: ({ event, delta: [, dy], ctrlKey }) => {
        event.preventDefault();
        cancelAutomation();
        const cur = camera.get();
        // ctrlKey wheel = trackpad pinch on most browsers → same zoom path.
        const factor = Math.exp(-dy * WHEEL_SENSITIVITY * (ctrlKey ? 1.6 : 1));
        zoomAround(event.clientX, event.clientY, cur.zoom * factor);
      },
      onPinch: ({ origin: [ox, oy], movement: [ms], memo }) => {
        cancelAutomation();
        const startZoom = (memo as number | undefined) ?? camera.get().zoom;
        zoomAround(ox, oy, startZoom * ms);
        return startZoom;
      },
    },
    {
      target: targetRef as RefObject<HTMLElement>,
      eventOptions: { passive: false },
      drag: { filterTaps: true, pointer: { keys: false } },
    },
  );

  return { dragging: draggingRef.current };
}
