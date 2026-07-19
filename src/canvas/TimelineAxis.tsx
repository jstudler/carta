/**
 * TimelineAxis — the horizontal reference line and adaptive, human-readable tick
 * labels shown in timeline view. Labels are rendered in SCREEN space (constant
 * size) and their granularity adapts to the visible time span: years collapse to
 * months, days expand to weekdays, then hours and minutes as you zoom in.
 */

import { useMemo } from 'react';
import { useStore } from '../store';
import { content } from '../content';
import { generateTicks, formatTick, granularityForSpan } from '../../shared/time';

/** Convert a world X on the timeline back to a timestamp. */
function worldXToTime(worldX: number): number {
  return content.timelineMinTimestamp + worldX / content.timelineScale;
}

export function TimelineAxis(): React.ReactElement | null {
  const transform = useStore((s) => s.transform);
  const width = useStore((s) => s.viewport.width);

  const ticks = useMemo(() => {
    const leftTime = worldXToTime((0 - transform.x) / transform.zoom);
    const rightTime = worldXToTime((width - transform.x) / transform.zoom);
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return [];
    const span = Math.abs(rightTime - leftTime);
    const granularity = granularityForSpan(span);
    return generateTicks(leftTime, rightTime, 4).map((t) => {
      const worldX = (t.timestamp - content.timelineMinTimestamp) * content.timelineScale;
      const screenX = worldX * transform.zoom + transform.x;
      return { x: screenX, label: formatTick(t.timestamp, granularity) };
    });
  }, [transform, width]);

  return (
    <div className="timeline-axis no-print" aria-hidden>
      {ticks.map((tick, i) => (
        <div
          key={`${tick.label}-${i}`}
          className="timeline-axis__label"
          style={{ left: tick.x }}
        >
          <span className="timeline-axis__text">{tick.label}</span>
        </div>
      ))}
    </div>
  );
}
