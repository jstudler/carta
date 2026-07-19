/** Map a configurable corner to fixed-position CSS, with optional stacking. */

import type { Corner } from '../../app.config';

const MARGIN = 14;

/**
 * Build absolute-position CSS for a chrome element pinned to a corner.
 * `offset` shifts the element along the corner's primary (vertical) axis so
 * multiple widgets can share a corner without overlapping.
 */
export function cornerStyle(corner: Corner, offset = 0): React.CSSProperties {
  const vertical = MARGIN + offset;
  const style: React.CSSProperties = {};
  if (corner.startsWith('top')) style.top = vertical;
  else style.bottom = vertical;
  if (corner.endsWith('left')) style.left = MARGIN;
  else style.right = MARGIN;
  return style;
}
