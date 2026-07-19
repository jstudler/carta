/**
 * TopicLines — renders smooth SVG curves per topic that connect all cards
 * chronologically (introduction → normal cards → conclusion). The line sits
 * behind cards in the canvas world and uses the topic's palette background colour.
 */

import { useMemo } from 'react';
import { content, itemsById, topicPalette } from '../content';
import { smoothPath } from '../../shared/curves';
import { useStore } from '../store';
import type { ViewMode } from '../lib/types';

const { lineColorForTopic } = topicPalette;

interface Props {
  view: ViewMode;
}

/**
 * Stroke width: at zoom >= 1, use 2px world space (looks thin at full zoom).
 * At zoom <= 0.5, use 2/zoom so it appears as 2px on screen.
 * Between 0.5 and 1, smoothly interpolate.
 *
 * The result is quantised to 0.25px: the camera publishes a new transform on
 * every animation frame, and this component subscribes to it. Quantising means
 * the subscription only fires on a visible change instead of ~60×/second.
 */
function strokeWidthForZoom(zoom: number): number {
  let width: number;
  if (zoom >= 1) {
    width = 2;
  } else if (zoom <= 0.5) {
    width = 2 / zoom;
  } else {
    // Linear interpolation: at zoom=0.5 → 4 (2/0.5), at zoom=1 → 2
    const t = (zoom - 0.5) / 0.5; // 0..1
    width = 4 + (2 - 4) * t; // 4..2
  }
  return Math.round(width * 4) / 4;
}

export function TopicLines({ view }: Props): React.ReactElement {
  const activeTopics = useStore((s) => s.activeTopics);
  const strokeWidth = useStore((s) => strokeWidthForZoom(s.transform.zoom));
  const linesHidden = useStore((s) => s.linesHidden);

  // Path building runs Catmull-Rom / monotone-cubic over every item in every
  // topic. It depends only on the view and the topic filter, so it must NOT be
  // redone when the camera moves.
  const paths = useMemo(() => {
    // Include general topic too.
    const allTopics = ['general', ...content.topics.filter((t) => t !== 'general')];

    return allTopics.flatMap((topic) => {
      // Skip filtered-out topics.
      if (!activeTopics.has(topic)) return [];

      // For general: always gather all items with topic='general' (clusters may
      // exclude the abstract). For others: use cluster itemIds or fall back.
      const topicItems = topic === 'general'
        ? content.items.filter((i) => i.topic === 'general')
        : (() => {
            const cluster = content.clusters.find((c) => c.topic === topic);
            const ids = cluster?.itemIds ?? content.items.filter((i) => i.topic === topic).map((i) => i.id);
            return ids.map((id) => itemsById.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
          })();

      /** Get the center point of an item's main card in the current view. */
      const cardCenter = (item: typeof topicItems[0]): { x: number; y: number } => {
        const b = item.layout[view].bounds;
        const cardW = item.textCard.width || b.width;
        const cardH = item.textCard.height || b.height;
        const cardX = b.x + item.textCard.x;
        const cardY = b.y + item.textCard.y;
        return { x: cardX + cardW / 2, y: cardY + cardH / 2 };
      };

      // Sort chronologically and compute center points.
      const points = topicItems
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(cardCenter);

      // For non-general topics in timeline view: extend the line from the general
      // abstract (start) to the general conclusion (end).
      if (topic !== 'general' && view === 'timeline') {
        const abstractItem = content.items.find((i) => i.type === 'abstract');
        const conclusionItem = content.items.find(
          (i) => i.topic === 'general' && i.type === 'conclusion',
        );
        if (abstractItem) points.unshift(cardCenter(abstractItem));
        if (conclusionItem) points.push(cardCenter(conclusionItem));
      }

      if (points.length < 2) return [];

      return [{
        topic,
        d: smoothPath(points, view === 'timeline'),
        color: lineColorForTopic(topic),
      }];
    });
  }, [view, activeTopics]);

  return (
    <svg
      className={`topic-lines${linesHidden ? ' topic-lines--hidden' : ''}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {paths.map(({ topic, d, color }) => (
        <path
          key={topic}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeOpacity={0.6}
        />
      ))}
    </svg>
  );
}
