/** Runtime-only shared types. */

export type ViewMode = 'timeline' | 'topic' | 'book';

/** Camera transform: canvas origin is translated by (x,y) screen px then scaled. */
export interface Transform {
  zoom: number;
  x: number;
  y: number;
}
