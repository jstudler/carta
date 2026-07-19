/**
 * TopicLabels — floating labels at each topic cluster's centre in topic view.
 * Rendered in screen space (projected from world coordinates).
 *
 * Size behaviour (configurable via app.config canvas.topicTitle):
 *  - zoom ≤ 0.5 → the title is screen-fixed (constant pixel size), like the
 *    timeline labels, so it stays legible while zoomed far out.
 *  - zoom > 0.5 → it grows with the canvas (size = base × zoom / 0.5), i.e. it
 *    behaves like a normal canvas element from the size it had at zoom 0.5.
 *
 * The glow is a configurable stack of text-shadow layers tinted with the topic's
 * own colour, radiating straight from the glyphs.
 */

import { useStore } from '../store';
import { content, colorForTopic, config } from '../content';
import { toTitleCase } from '../lib/text';

/** The zoom below which the title is screen-fixed; above it scales with canvas. */
const STATIC_BELOW = 0.5;

/** Convert a #rrggbb (or #rgb) colour to an rgba() string at the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function TopicLabels(): React.ReactElement {
  const transform = useStore((s) => s.transform);

  const { fontSize, shadow } = config.canvas.topicTitle;
  const fontScale = transform.zoom <= STATIC_BELOW ? 1 : transform.zoom / STATIC_BELOW;

  return (
    <div className="topic-labels no-print" aria-hidden>
      {content.clusters.filter((c) => c.topic !== 'general').map((cluster) => {
        // The title sits at the centre of the topic's circular collage.
        const worldX = cluster.center.x;
        const worldY = cluster.center.y;
        const screenX = worldX * transform.zoom + transform.x;
        const screenY = worldY * transform.zoom + transform.y;
        const accent = colorForTopic(cluster.topic);
        const textShadow = shadow
          .map((s) => `${s.offsetX}px ${s.offsetY}px ${s.blur}px ${hexToRgba(accent, s.opacity)}`)
          .join(', ');
        return (
          <div
            key={cluster.topic}
            className="topic-label"
            style={{
              left: screenX,
              top: screenY,
              fontSize: `${fontSize * fontScale}px`,
              textShadow,
            }}
          >
            {toTitleCase(cluster.topic)}
          </div>
        );
      })}
    </div>
  );
}
