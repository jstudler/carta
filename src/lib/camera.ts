/**
 * Camera controller — the single owner of the live canvas transform.
 *
 * It applies the transform to the canvas element IMPERATIVELY (so pan/zoom never
 * triggers React re-renders) while mirroring it into the Zustand store so that
 * passive observers (minimap, URL sync) can react. All automated motion goes
 * through GSAP for smooth, configurable easing.
 */

import gsap from 'gsap';
import type { Transform } from './types';
import { useStore } from '../store';
import { clamp, lerp } from '../../shared/geometry';

export const MIN_ZOOM = 0.015;
export const MAX_ZOOM = 4;

let element: HTMLElement | null = null;
let current: Transform = { zoom: 1, x: 0, y: 0 };
let tween: gsap.core.Tween | null = null;

function clampTransform(t: Transform): Transform {
  return { ...t, zoom: clamp(t.zoom, MIN_ZOOM, MAX_ZOOM) };
}

function applyToDom(): void {
  if (element) {
    element.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) scale(${current.zoom})`;
  }
}

function publish(): void {
  useStore.getState().setTransform({ ...current });
}

export const camera = {
  /** Bind the controller to the canvas inner element. */
  attach(node: HTMLElement | null): void {
    element = node;
    applyToDom();
  },

  /** Current transform (defensive copy). */
  get(): Transform {
    return { ...current };
  },

  /** Set the transform instantly (used by live gestures). */
  set(t: Transform, { publishState = true }: { publishState?: boolean } = {}): void {
    tween?.kill();
    tween = null;
    current = clampTransform(t);
    applyToDom();
    if (publishState) publish();
  },

  /** Smoothly animate to a target transform. Returns a promise that resolves on completion. */
  animateTo(target: Transform, duration: number, ease = 'power3.inOut'): Promise<void> {
    tween?.kill();
    const dest = clampTransform(target);
    return new Promise((resolve) => {
      tween = gsap.to(current, {
        zoom: dest.zoom,
        x: dest.x,
        y: dest.y,
        duration,
        ease,
        onUpdate: () => {
          applyToDom();
          publish();
        },
        onComplete: () => {
          tween = null;
          resolve();
        },
      });
    });
  },

  /**
   * Glide to a target transform in a SINGLE continuous motion that arcs through
   * an overview zoom — used by autoplay so the camera never does the clumsy
   * "zoom out → pause → zoom back in" two-step. The focal point pans in a
   * straight line while the zoom dips toward an overview level at the midpoint
   * and rises into the target, all under one global ease so there are no
   * velocity seams (no sharp edges in either zooming or moving).
   */
  glide(target: Transform, duration: number, ease = 'sine.inOut'): Promise<void> {
    tween?.kill();
    const start = { ...current };
    const dest = clampTransform(target);
    const { width, height } = useStore.getState().viewport;
    const minDim = Math.min(width, height);

    // World point under the screen centre at the start and the destination.
    const startFocus = {
      x: (width / 2 - start.x) / start.zoom,
      y: (height / 2 - start.y) / start.zoom,
    };
    const endFocus = {
      x: (width / 2 - dest.x) / dest.zoom,
      y: (height / 2 - dest.y) / dest.zoom,
    };

    // A dip zoom that comfortably frames BOTH focal points, so larger jumps pull
    // back for context. For nearby items the dip is negligible and the motion is
    // a gentle pan. The geometric mean of start/end zoom bounds the dip so it can
    // only ever zoom OUT mid-flight, never bump inward.
    const span = Math.hypot(endFocus.x - startFocus.x, endFocus.y - startFocus.y);
    const fitZoom = span > 1 ? clamp((0.6 * minDim) / span, MIN_ZOOM, MAX_ZOOM) : Math.min(start.zoom, dest.zoom);
    const dipZoom = Math.min(start.zoom, dest.zoom, fitZoom);

    const logStart = Math.log(start.zoom);
    const logEnd = Math.log(dest.zoom);
    const logMid = (logStart + logEnd) / 2;
    const logDip = Math.log(dipZoom);

    const proxy = { p: 0 };
    return new Promise((resolve) => {
      tween = gsap.to(proxy, {
        p: 1,
        duration,
        ease,
        onUpdate: () => {
          const p = proxy.p;
          // Zoom: linear in log-space with a sine bow that dips to dipZoom at the
          // midpoint (bow is 0 at both ends, 1 at the centre).
          const bow = Math.sin(Math.PI * p);
          const logZoom = lerp(logStart, logEnd, p) + (logDip - logMid) * bow;
          const zoom = clamp(Math.exp(logZoom), MIN_ZOOM, MAX_ZOOM);
          // Pan: focal point travels in a straight line in world space.
          const fx = lerp(startFocus.x, endFocus.x, p);
          const fy = lerp(startFocus.y, endFocus.y, p);
          current = {
            zoom,
            x: width / 2 - fx * zoom,
            y: height / 2 - fy * zoom,
          };
          applyToDom();
          publish();
        },
        onComplete: () => {
          tween = null;
          resolve();
        },
      });
    });
  },

  /** Stop any in-flight animation. */
  stop(): void {
    tween?.kill();
    tween = null;
  },

  /** True while an automated animation is running. */
  get isAnimating(): boolean {
    return tween !== null;
  },
};
