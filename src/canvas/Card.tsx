/**
 * Card — renders one content item as a group of sub-boxes (an optional text card
 * plus media boxes), positioned at the item's pre-computed layout for the active
 * view. Clicking focuses the item (zoom-in). Every non-'normal' type renders a
 * white label box straddling the card's top border (Introduction, Conclusion,
 * Loose Ends & Unsolved Problems, Reflection, Lookout & Future Prospects,
 * Abstract); the abstract additionally uses a dark surface.
 */

import { memo } from 'react';
import type { ContentItem } from '../../shared/contentTypes';
import type { ViewMode } from '../lib/types';
import { MediaBox } from './MediaBox';
import { colorScheme, config, content, topicPalette } from '../content';
import { formatCardTimestamp } from '../../shared/time';
import { toTitleCase, toKebab } from '../lib/text';
import { goToItem, blurFocused } from '../lib/navigation';
import { faviconDataUri } from '../lib/favicon';
import { useStore } from '../store';

const APP_ICON = faviconDataUri(colorScheme);

interface Props {
  item: ContentItem;
  view: ViewMode;
  focused: boolean;
  onFocus: (item: ContentItem) => void;
}

/**
 * User-facing label shown in the white box straddling the top border of every
 * non-'normal' card type. (Plain text, not emoji, so the meaning is explicit.)
 */
const TYPE_LABEL: Record<string, string> = {
  introduction: 'Introduction',
  conclusion: 'Conclusion',
  imponderable: 'Loose Ends & Unsolved Problems',
  reflection: 'Reflection',
  lookout: 'Lookout & Future Prospects',
  abstract: 'Abstract',
};

function CardComponent({ item, view, focused, onFocus }: Props): React.ReactElement {
  const bounds = item.layout[view].bounds;
  // General-topic cards (including abstract) use a dark surface with a bright font.
  const surface = topicPalette.surfaceForTopic(item.topic);
  const masterIndex = item.sidecars.findIndex((s) => s.kind === 'video' || s.kind === 'audio');
  const hasBody = item.textCard.width > 0;
  const grouped = (hasBody ? 1 : 0) + item.sidecars.length > 1;
  // Padding scales with the card's font size so dense type keeps its margins.
  const cardPad = config.baseline.cardPadding * item.fontSize;

  const handleClick = (e: React.MouseEvent): void => {
    // Handle anchor clicks: internalref: links navigate on canvas, external links
    // open in a new tab (target=_blank is set at build time), both stop propagation
    // so the canvas doesn't blur/zoom.
    const anchor = (e.target as HTMLElement).closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href') ?? '';
      if (href.startsWith('internalref:')) {
        e.preventDefault();
        e.stopPropagation();
        const targetTitle = decodeURIComponent(href.slice('internalref:'.length));
        const target = content.items.find(
          (i) => i.title.toLowerCase() === targetTitle.toLowerCase(),
        );
        if (target) goToItem(target, useStore.getState().view);
      } else {
        // External link: let the browser follow it but stop canvas interaction.
        e.stopPropagation();
      }
      return;
    }
    // Stop the click reaching the viewport (which would blur a focused item).
    e.stopPropagation();
    if (!focused) onFocus(item);
  };

  const typeLabel = TYPE_LABEL[item.type];

  return (
    <div
      className={`item${grouped ? ' item--grouped' : ''}`}
      style={{
        // Position via transform, NOT left/top: the timeline⇄topic morph animates
        // this property, and transform is compositor-only (no layout/paint of the
        // card's markdown subtree per frame). Width/height are identical in both
        // views (see layoutTimeline/layoutTopic), so only the translation changes.
        transform: `translate3d(${bounds.x}px, ${bounds.y}px, 0)`,
        width: bounds.width,
        height: bounds.height,
        '--card-bg': surface.background,
        '--card-fg': surface.font,
        '--card-pad': `${cardPad}px`,
      } as React.CSSProperties}
      onClick={handleClick}
      data-item-id={item.id}
    >
      {hasBody && (
        <article
          className={`card card--${item.type}`}
          style={
            {
              left: item.textCard.x,
              top: item.textCard.y,
              width: item.textCard.width,
              minHeight: item.textCard.height,
              fontSize: `${config.baseline.fontSize * item.fontSize}px`,
            } as React.CSSProperties
          }
        >
          {typeLabel && (
            <span className="card__type-label">{typeLabel}</span>
          )}
          <div className="card__meta">
            <span>{formatCardTimestamp(item.timestamp, item.hasTime)}</span>
            <span>· {toTitleCase(item.topic)}</span>
            {item.category && <span>· {toTitleCase(item.category)}</span>}
            <span className="card__meta-viewlinks">
              {view !== 'topic' && (
                <a
                  href={`?view=topic&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`}
                  title="View in Topic view"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); blurFocused(); useStore.getState().setView('topic'); requestAnimationFrame(() => goToItem(item, 'topic')); }}
                >
                  <img className="card__meta-viewicon" src={APP_ICON} alt="" />
                </a>
              )}
              {view !== 'timeline' && (
                <a
                  href={`?view=timeline&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`}
                  title="View in Timeline view"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); blurFocused(); useStore.getState().setView('timeline'); requestAnimationFrame(() => goToItem(item, 'timeline')); }}
                >
                  <svg className="card__meta-viewicon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4.5" width="18" height="16" rx="2" />
                    <path d="M3 9h18M8 2.5v4M16 2.5v4" />
                  </svg>
                </a>
              )}
              <a
                href={`?view=book&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`}
                title="View in Book view"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); blurFocused(); window.history.pushState(null, '', `?view=book&topic=${toKebab(item.topic)}&card=${toKebab(item.title)}`); useStore.getState().setView('book'); }}
              >
                📄
              </a>
            </span>
          </div>
          {item.title && <h2 className="card__title">{item.title}</h2>}
          <div className="card__body" dangerouslySetInnerHTML={{ __html: item.html }} />
        </article>
      )}

      {item.sidecars.map((sidecar, i) => (
        <MediaBox
          key={sidecar.filename}
          itemId={item.id}
          sidecar={sidecar}
          isMaster={i === masterIndex}
          active={focused}
        />
      ))}
    </div>
  );
}

export const Card = memo(CardComponent);
