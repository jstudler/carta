/**
 * Pure layout algorithms, run at build time so the browser never computes
 * positions on load. All functions are deterministic and unit tested.
 *
 *  - packShelf:      generic row/shelf packer (used for item parts AND clusters)
 *  - packItemParts:  arranges a text card + media sidecars into one tight group
 *  - layoutTimeline: time-proportional X with vertical lanes (no overlaps)
 *  - layoutTopic:    radial clusters around a centre, abstract in the middle
 */

import type { AppConfig } from '../../app.config';
import type { Rect } from '../../shared/contentTypes';

export interface SizedBox {
  width: number;
  height: number;
}

export interface PackedBox extends SizedBox {
  x: number;
  y: number;
}

/**
 * Shelf-pack boxes left-to-right, wrapping to a new row when `maxRowWidth` is
 * exceeded. Returns each box's top-left position plus the overall footprint.
 */
export function packShelf(
  boxes: SizedBox[],
  maxRowWidth: number,
  gap: number,
): { placements: PackedBox[]; width: number; height: number } {
  const placements: PackedBox[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  let widest = 0;

  for (const box of boxes) {
    if (cursorX > 0 && cursorX + box.width > maxRowWidth) {
      // Wrap to next row.
      cursorY += rowHeight + gap;
      cursorX = 0;
      rowHeight = 0;
    }
    placements.push({ ...box, x: cursorX, y: cursorY });
    cursorX += box.width + gap;
    rowHeight = Math.max(rowHeight, box.height);
    widest = Math.max(widest, cursorX - gap);
  }
  return { placements, width: widest, height: cursorY + rowHeight };
}

export interface ItemPartsInput {
  textCard: SizedBox | null;
  sidecars: SizedBox[];
}

export interface ItemPartsResult {
  textCard: { x: number; y: number; width: number; height: number };
  sidecars: { x: number; y: number }[];
  width: number;
  height: number;
}

/**
 * Arrange boxes into TWO columns pulled toward a virtual centre cross, so a
 * grouped item reads as one condensed cluster. Boxes fill row-major (0,1 on the
 * first row, 2,3 on the next, …). Each column is stacked vertically and centred
 * on y = 0; the left column is right-aligned against the centre line and the
 * right column left-aligned, so the inner corners of all four quadrant cards
 * meet near the middle (top-left hugs bottom-right, top-right hugs bottom-left,
 * and so on). Positions are normalised to a (0,0) origin.
 */
function packCentered(
  boxes: SizedBox[],
  gap: number,
): { placements: PackedBox[]; width: number; height: number } {
  const columns: { idx: number; box: SizedBox }[][] = [[], []];
  boxes.forEach((box, idx) => columns[idx % 2].push({ idx, box }));

  const placed: PackedBox[] = new Array(boxes.length);
  columns.forEach((col, c) => {
    const totalH = col.reduce((s, e) => s + e.box.height, 0) + gap * Math.max(0, col.length - 1);
    let y = -totalH / 2;
    for (const e of col) {
      const x = c === 0 ? -gap / 2 - e.box.width : gap / 2;
      placed[e.idx] = { x, y, width: e.box.width, height: e.box.height };
      y += e.box.height + gap;
    }
  });

  const minX = Math.min(...placed.map((p) => p.x));
  const minY = Math.min(...placed.map((p) => p.y));
  let maxX = -Infinity;
  let maxY = -Infinity;
  const norm = placed.map((p) => {
    const np = { ...p, x: p.x - minX, y: p.y - minY };
    maxX = Math.max(maxX, np.x + np.width);
    maxY = Math.max(maxY, np.y + np.height);
    return np;
  });
  return { placements: norm, width: maxX, height: maxY };
}

/**
 * Arrange an item's sub-boxes (text card first, then sidecars) into a single
 * tightly grouped footprint that is as close to SQUARE as possible. Sub-cards are
 * attracted toward the GROUP CENTER (like a magnet): inner gaps between adjacent
 * cards are small and constant, while outer gaps (to the bounding box edge) are
 * larger. The strategy:
 *
 * 1. If one box is significantly taller than the others, place it on one side
 *    and stack the remaining boxes vertically on the other side.
 * 2. Otherwise, try multiple row-wrap widths and pick the arrangement whose
 *    aspect ratio is closest to 1:1.
 * 3. Post-process: pull every box toward the group centre so inner edges are
 *    tight and outer edges absorb the slack.
 */
export function packItemParts(input: ItemPartsInput, config: AppConfig): ItemPartsResult {
  const gap = config.baseline.groupGap;
  const boxes: SizedBox[] = [];
  if (input.textCard) boxes.push(input.textCard);
  boxes.push(...input.sidecars);

  if (boxes.length === 0) {
    return { textCard: { x: 0, y: 0, width: 0, height: 0 }, sidecars: [], width: 0, height: 0 };
  }

  let packed: { placements: PackedBox[]; width: number; height: number };

  if (boxes.length === 1) {
    packed = { placements: [{ ...boxes[0], x: 0, y: 0 }], width: boxes[0].width, height: boxes[0].height };
  } else if (boxes.length >= 2) {
    // Strategy: try different arrangements and pick the most square one.
    const candidates: { placements: PackedBox[]; width: number; height: number }[] = [];

    // Candidate 1: tallest box on the left, rest stacked on the right.
    const tallIdx = boxes.reduce((ti, b, i) => (b.height > boxes[ti].height ? i : ti), 0);
    const tallBox = boxes[tallIdx];
    const otherBoxes = boxes.filter((_, i) => i !== tallIdx);

    if (otherBoxes.length > 0) {
      // Stack others vertically, tight together.
      const stackH = otherBoxes.reduce((s, b) => s + b.height, 0) + gap * (otherBoxes.length - 1);
      const stackW = Math.max(...otherBoxes.map((b) => b.width));
      const totalW = tallBox.width + gap + stackW;
      const totalH = Math.max(tallBox.height, stackH);

      const pls: PackedBox[] = new Array(boxes.length);
      // Tall box on left, aligned to RIGHT edge of its column (pulled toward center).
      // Vertically centred within the group.
      pls[tallIdx] = { ...tallBox, x: 0, y: (totalH - tallBox.height) / 2 };
      // Stack on right, each aligned to LEFT edge (pulled toward center).
      // Stack centred vertically as a block.
      const stackStartY = (totalH - stackH) / 2;
      let sy = stackStartY;
      for (let i = 0; i < boxes.length; i++) {
        if (i === tallIdx) continue;
        // Left-align within right column (inner edge toward center).
        pls[i] = { ...boxes[i], x: tallBox.width + gap, y: sy };
        sy += boxes[i].height + gap;
      }
      candidates.push({ placements: pls, width: totalW, height: totalH });
    }

    // Candidate 2: tallest box on the right, rest stacked on the left.
    if (otherBoxes.length > 0) {
      const stackH = otherBoxes.reduce((s, b) => s + b.height, 0) + gap * (otherBoxes.length - 1);
      const stackW = Math.max(...otherBoxes.map((b) => b.width));
      const totalW = stackW + gap + tallBox.width;
      const totalH = Math.max(tallBox.height, stackH);

      const pls: PackedBox[] = new Array(boxes.length);
      // Tall box on right, left-aligned in its column (pulled toward center).
      pls[tallIdx] = { ...tallBox, x: stackW + gap, y: (totalH - tallBox.height) / 2 };
      // Stack on left, each right-aligned (inner edge toward center).
      const stackStartY = (totalH - stackH) / 2;
      let sy = stackStartY;
      for (let i = 0; i < boxes.length; i++) {
        if (i === tallIdx) continue;
        // Right-align within left column (inner edge toward center).
        pls[i] = { ...boxes[i], x: stackW - boxes[i].width, y: sy };
        sy += boxes[i].height + gap;
      }
      candidates.push({ placements: pls, width: totalW, height: totalH });
    }

    // Candidate 3+: shelf packing at various widths, pick most square.
    const totalArea = boxes.reduce((s, b) => s + b.width * b.height, 0);
    const idealSide = Math.sqrt(totalArea);
    const widest = Math.max(...boxes.map((b) => b.width));
    const widths = [
      widest,
      idealSide,
      idealSide * 1.3,
      idealSide * 0.8,
      widest * 2 + gap,
    ].filter((w) => w >= widest);

    for (const w of widths) {
      candidates.push(packShelf(boxes, w, gap));
    }

    // Also try the centred packer for 4+ boxes.
    if (boxes.length >= 4) {
      candidates.push(packCentered(boxes, gap));
    }

    // Pick the candidate with aspect ratio closest to 1:1.
    packed = candidates.reduce((best, c) => {
      const ratio = c.width > 0 && c.height > 0
        ? Math.max(c.width / c.height, c.height / c.width)
        : Infinity;
      const bestRatio = best.width > 0 && best.height > 0
        ? Math.max(best.width / best.height, best.height / best.width)
        : Infinity;
      return ratio < bestRatio ? c : best;
    });
  } else {
    packed = packShelf(boxes, 9999, gap);
  }

  // Post-process: for shelf-packed results, align rows toward the vertical centre
  // and boxes toward the horizontal centre within their row. This is safe because
  // it only moves boxes within their already-allocated row space.
  if (packed.placements.length > 1) {
    packed = alignRowsTowardCenter(packed, gap);
  }

  let cursor = 0;
  let textCard = { x: 0, y: 0, width: 0, height: 0 };
  if (input.textCard) {
    const p = packed.placements[0];
    textCard = { x: p.x, y: p.y, width: p.width, height: p.height };
    cursor = 1;
  }
  const sidecars = input.sidecars.map((_, i) => {
    const p = packed.placements[cursor + i];
    return { x: p.x, y: p.y };
  });
  return { textCard, sidecars, width: packed.width, height: packed.height };
}

/**
 * Align boxes toward the group centre WITHOUT risking overlaps. Groups boxes into
 * rows (by shared Y-band) and columns (by shared X-band), then:
 *  - Rows in the top half shift DOWN; rows in the bottom half shift UP.
 *  - Within each row, boxes in the left half shift RIGHT; right half shift LEFT.
 * Shifts never move a box past its neighbor (gap preserved).
 */
function alignRowsTowardCenter(
  packed: { placements: PackedBox[]; width: number; height: number },
  gap: number,
): { placements: PackedBox[]; width: number; height: number } {
  const { placements, width, height } = packed;
  const result = placements.map((p) => ({ ...p }));
  const cy = height / 2;
  const cx = width / 2;

  // Group into rows: boxes whose Y ranges overlap are in the same row.
  const rows: number[][] = [];
  const assigned = new Set<number>();
  for (let i = 0; i < result.length; i++) {
    if (assigned.has(i)) continue;
    const row = [i];
    assigned.add(i);
    for (let j = i + 1; j < result.length; j++) {
      if (assigned.has(j)) continue;
      // Same row if they vertically overlap.
      const a = result[i], b = result[j];
      if (a.y < b.y + b.height && a.y + a.height > b.y) {
        row.push(j);
        assigned.add(j);
      }
    }
    rows.push(row);
  }

  // Vertical: shift entire rows toward the vertical centre.
  // Sort rows by their vertical midpoint.
  rows.sort((a, b) => {
    const midA = Math.min(...a.map((i) => result[i].y)) + (Math.max(...a.map((i) => result[i].y + result[i].height)) - Math.min(...a.map((i) => result[i].y))) / 2;
    const midB = Math.min(...b.map((i) => result[i].y)) + (Math.max(...b.map((i) => result[i].y + result[i].height)) - Math.min(...b.map((i) => result[i].y))) / 2;
    return midA - midB;
  });

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const rowTop = Math.min(...row.map((i) => result[i].y));
    const rowBot = Math.max(...row.map((i) => result[i].y + result[i].height));
    const rowMid = (rowTop + rowBot) / 2;

    let dy = 0;
    if (rowMid < cy) {
      // Row is above centre — push down. Limited by the next row below.
      const nextRow = rows[ri + 1];
      const maxDown = nextRow
        ? Math.min(...nextRow.map((i) => result[i].y)) - gap - rowBot
        : height - rowBot;
      dy = Math.min(Math.max(0, cy - rowMid), Math.max(0, maxDown));
    } else if (rowMid > cy) {
      // Row is below centre — push up. Limited by the previous row above.
      const prevRow = rows[ri - 1];
      const maxUp = prevRow
        ? rowTop - gap - Math.max(...prevRow.map((i) => result[i].y + result[i].height))
        : rowTop;
      dy = -Math.min(Math.max(0, rowMid - cy), Math.max(0, maxUp));
    }
    for (const i of row) result[i].y += dy;
  }

  // Horizontal: within each row, shift boxes toward the horizontal centre.
  for (const row of rows) {
    // Sort row boxes left-to-right.
    row.sort((a, b) => result[a].x - result[b].x);

    for (let bi = 0; bi < row.length; bi++) {
      const box = result[row[bi]];
      const boxMid = box.x + box.width / 2;
      if (boxMid < cx) {
        // Left of centre — push right. Limited by next box in row.
        const nextBox = bi < row.length - 1 ? result[row[bi + 1]] : null;
        const maxRight = nextBox
          ? nextBox.x - gap - (box.x + box.width)
          : width - (box.x + box.width);
        const shift = Math.min(Math.max(0, cx - boxMid), Math.max(0, maxRight));
        box.x += shift;
      } else if (boxMid > cx) {
        // Right of centre — push left. Limited by previous box in row.
        const prevBox = bi > 0 ? result[row[bi - 1]] : null;
        const maxLeft = prevBox
          ? box.x - gap - (prevBox.x + prevBox.width)
          : box.x;
        const shift = Math.min(Math.max(0, boxMid - cx), Math.max(0, maxLeft));
        box.x -= shift;
      }
    }
  }

  return { placements: result, width, height };
}

export interface TimelineItem {
  id: string;
  timestamp: number;
  width: number;
  height: number;
  isAbstract: boolean;
  /** Topic slug — used for swimlane grouping. */
  topic: string;
  /** Topic introduction — centred on the axis (like the abstract). */
  isIntro?: boolean;
  /** Topic conclusion — centred on the axis (like the abstract). */
  isConclusion?: boolean;
}

export interface TimelinePlacement {
  id: string;
  bounds: Rect;
  below: boolean;
}

/**
 * Place items along a horizontal axis at y = 0 using TOPIC SWIMLANES.
 *
 * Each topic gets its own horizontal lane. General items sit centred on the axis;
 * the first non-general topic is placed above the axis, the second below, the
 * third further above, and so on.  Within a lane, cards are placed left-to-right
 * (never stacked vertically); the timeline stretches horizontally to make room
 * when items on the same day would overlap.
 */
export function layoutTimeline(
  items: TimelineItem[],
  config: AppConfig,
): { placements: TimelinePlacement[]; bounds: Rect; scale: number; minTimestamp: number } {
  const gap = config.baseline.itemGap;
  const nonAbstract = items.filter((i) => !i.isAbstract).sort((a, b) => a.timestamp - b.timestamp);
  const abstract = items.find((i) => i.isAbstract);

  if (nonAbstract.length === 0 && !abstract) {
    return { placements: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, scale: 1, minTimestamp: 0 };
  }

  const minT = nonAbstract.length ? nonAbstract[0].timestamp : 0;
  const maxT = nonAbstract.length ? nonAbstract[nonAbstract.length - 1].timestamp : 1;
  const span = Math.max(1, maxT - minT);
  const avgWidth = nonAbstract.reduce((s, i) => s + i.width, 0) / Math.max(1, nonAbstract.length);
  const baseScale = (nonAbstract.length * (avgWidth + gap) * 1.5) / span;

  // Discover unique non-general topics in order of first appearance.
  const topicOrder: string[] = [];
  const seen = new Set<string>();
  for (const item of nonAbstract) {
    if (item.topic !== 'general' && !seen.has(item.topic)) {
      topicOrder.push(item.topic);
      seen.add(item.topic);
    }
  }

  // Group items by topic.
  const byTopic = new Map<string, TimelineItem[]>();
  for (const item of nonAbstract) {
    const list = byTopic.get(item.topic) ?? [];
    list.push(item);
    byTopic.set(item.topic, list);
  }

  // Phase 1: compute initial X for ALL items proportional to time.
  const itemX = new Map<string, number>();
  for (const item of nonAbstract) {
    itemX.set(item.id, (item.timestamp - minT) * baseScale);
  }

  // Phase 2: within each topic lane, ensure no horizontal overlap by stretching.
  for (const [, topicItems] of byTopic) {
    const sorted = [...topicItems].sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const prevRight = itemX.get(prev.id)! + prev.width + gap * 1.5;
      const currX = itemX.get(curr.id)!;
      if (currX < prevRight) {
        const shift = prevRight - currX;
        for (let j = i; j < sorted.length; j++) {
          itemX.set(sorted[j].id, itemX.get(sorted[j].id)! + shift);
        }
      }
    }
  }

  // Phase 2b: general cross-topic overlap resolution. Items from different topics
  // at the same X can overlap horizontally. Scan ALL items sorted by X and push
  // later items right if they collide with any earlier item in a different lane
  // at the same Y band. Since lanes don't share Y bands, we only need to resolve
  // within the same lane — which is already done above. But items sharing a lane
  // (general) or barely fitting need a final check.
  const allSorted = [...nonAbstract].sort((a, b) => itemX.get(a.id)! - itemX.get(b.id)!);
  for (let i = 1; i < allSorted.length; i++) {
    const curr = allSorted[i];
    const currX = itemX.get(curr.id)!;
    // Check against all previous items in the SAME topic lane.
    for (let j = i - 1; j >= 0; j--) {
      const prev = allSorted[j];
      if (prev.topic !== curr.topic) continue;
      const prevRight = itemX.get(prev.id)! + prev.width + gap;
      if (currX >= prevRight) break;
      // Still overlapping — push curr and everything after it in this topic.
      const shift = prevRight - currX;
      const topicItems = byTopic.get(curr.topic) ?? [];
      const topicSorted = [...topicItems].sort((a, b) => itemX.get(a.id)! - itemX.get(b.id)!);
      const idx = topicSorted.findIndex((t) => t.id === curr.id);
      for (let k = idx; k < topicSorted.length; k++) {
        itemX.set(topicSorted[k].id, itemX.get(topicSorted[k].id)! + shift);
      }
      break;
    }
  }

  // Phase 3: assign Y positions based on topic swimlanes.
  // Compute the max card height per topic for lane sizing.
  const laneHeight = new Map<string, number>();
  for (const [topic, topicItems] of byTopic) {
    laneHeight.set(topic, Math.max(...topicItems.map((i) => i.height)));
  }

  // The general lane's half-height determines the starting offset for other lanes.
  const generalHalfH = ((laneHeight.get('general') ?? 0) / 2) + gap;

  // Compute Y centre for each lane. General sits at y=0; others stack outward
  // starting BEYOND the general lane's extent.
  const laneCenterY = new Map<string, number>();
  laneCenterY.set('general', 0);

  let aboveY = -generalHalfH;
  let belowY = generalHalfH;
  for (let i = 0; i < topicOrder.length; i++) {
    const topic = topicOrder[i];
    const h = laneHeight.get(topic) ?? 100;
    const isAbove = i % 2 === 0;
    if (isAbove) {
      aboveY -= h + gap;
      laneCenterY.set(topic, aboveY + h / 2);
    } else {
      laneCenterY.set(topic, belowY + h / 2);
      belowY += h + gap;
    }
  }

  // Phase 4: build placements.
  const placements: TimelinePlacement[] = [];

  for (const item of nonAbstract) {
    const x = itemX.get(item.id)!;
    const centerY = laneCenterY.get(item.topic) ?? 0;
    const below = centerY > 0;
    placements.push({
      id: item.id,
      bounds: {
        x: x - item.width / 2,
        y: centerY - item.height / 2,
        width: item.width,
        height: item.height,
      },
      below,
    });
  }

  // Abstract: a box at the very start, centred on the axis.
  if (abstract) {
    const startX = Math.min(0, ...placements.map((p) => p.bounds.x));
    placements.unshift({
      id: abstract.id,
      bounds: {
        x: startX - abstract.width - gap * 2,
        y: -abstract.height / 2,
        width: abstract.width,
        height: abstract.height,
      },
      below: false,
    });
  }

  const bounds = boundsOfPlacements(placements);
  return { placements, bounds, scale: baseScale, minTimestamp: minT };
}

export interface TopicItem {
  id: string;
  topic: string;
  timestamp: number;
  width: number;
  height: number;
  /** The topic's introduction (oldest) card — pinned just below the title. */
  isIntro?: boolean;
  /** The topic's conclusion (newest) card — pinned just below the title. */
  isConclusion?: boolean;
}

export interface TopicLayoutResult {
  placements: { id: string; bounds: Rect }[];
  clusters: {
    topic: string;
    center: { x: number; y: number };
    bounds: Rect;
    itemIds: string[];
  }[];
  abstractBounds: Rect | null;
  bounds: Rect;
}

/**
 * Arrange each topic as a CONDENSED CIRCULAR COLLAGE around its own centre (where
 * the topic title sits). Cards are placed in chronological order along an
 * Archimedean spiral that starts at the top (12 o'clock) and winds clockwise, so
 * the reading order is preserved while the radius is free to vary. Each card is
 * pushed just far enough out to clear the central title area and avoid its
 * already-placed neighbours (with only a small gap), which yields a tight,
 * collage-like cluster rather than a perfect ring — bigger cards naturally peek
 * out. The clusters themselves are then spread around the general centre (which
 * holds the abstract) so no two clusters overlap.
 */
export function layoutTopic(
  items: TopicItem[],
  topics: string[],
  abstract: SizedBox | null,
  config: AppConfig,
): TopicLayoutResult {
  // Small intra-cluster gap so clusters stay condensed yet readable when zoomed
  // out; a slightly larger gap keeps whole clusters apart on the general ring.
  const cardGap = Math.max(12, Math.round(config.baseline.groupGap * 1.5));
  const clusterGap = Math.max(cardGap * 2, Math.round(config.baseline.itemGap * 0.5));
  const placements: { id: string; bounds: Rect }[] = [];
  const clusters: TopicLayoutResult['clusters'] = [];

  // 1. Pack each topic into a spiral collage around its own local origin (0,0).
  const local = topics.map((topic) => {
    const members = items
      .filter((i) => i.topic === topic)
      .sort((a, b) => a.timestamp - b.timestamp);

    const extentsAll = members.map((m) => Math.hypot(m.width, m.height));
    const maxDiag = Math.max(1, ...extentsAll);
    // Central keep-out radius for the title label (or the abstract for "general").
    let titleR = topic === 'general' && abstract
      ? Math.hypot(abstract.width, abstract.height) / 2 + cardGap
      : Math.max(70, maxDiag * 0.35);

    const placedRects: Rect[] = [];
    const positioned: { id: string; rect: Rect }[] = [];

    // For the "general" topic, register the abstract as an obstacle so spiral
    // cards never overlap it. Also pin the conclusion right next to the abstract
    // (side by side, top-aligned) so the two most important general cards read
    // as a pair — mirroring how non-general topics pin intro/conclusion together.
    const intro = members.find((m) => m.isIntro);
    const conclusion = members.find((m) => m.isConclusion && !m.isIntro);

    if (topic === 'general' && abstract) {
      const absRect: Rect = {
        x: -abstract.width / 2,
        y: -abstract.height / 2,
        width: abstract.width,
        height: abstract.height,
      };
      placedRects.push(absRect);

      // Pin conclusion to the right of the abstract, top-aligned.
      if (conclusion) {
        const concRect: Rect = {
          x: absRect.x + absRect.width + cardGap,
          y: absRect.y,
          width: conclusion.width,
          height: conclusion.height,
        };
        placedRects.push(concRect);
        positioned.push({ id: conclusion.id, rect: concRect });

        // Update the keep-out radius to encompass both abstract + conclusion.
        const combinedRight = concRect.x + concRect.width;
        const combinedBottom = Math.max(absRect.y + absRect.height, concRect.y + concRect.height);
        titleR = Math.max(titleR,
          Math.hypot(combinedRight, combinedBottom) + cardGap,
          Math.hypot(combinedRight, absRect.y) + cardGap,
          Math.hypot(absRect.x, combinedBottom) + cardGap,
        );
      }
    }

    // Pin the introduction (oldest) + conclusion (newest) cards directly under
    // the title, closer to the centre than any other card. Their TOP borders
    // share one horizontal line just below the title's bottom edge (at zoom 1),
    // and the row is centred horizontally on the title — introduction left,
    // conclusion right. They are then registered as obstacles so the half-circle
    // cards flow around them.
    const specials = topic === 'general'
      ? [conclusion].filter((m): m is TopicItem => !!m)
      : [intro, conclusion].filter((m): m is TopicItem => !!m);
    const specialIds = new Set(specials.map((m) => m.id));
    if (specials.length > 0 && topic !== 'general') {
      // Leave a generous gap below the title — at least two extra lines of title
      // text as seen at zoom 0.5 (where the title is screen-fixed). One title
      // line spans fontSize/0.5 world px (×1.3 line-height); clear half the title
      // plus two such lines so the title never crowds the intro/conclusion.
      const titleLineWorld = (config.canvas.topicTitle.fontSize / 0.5) * 1.3;
      const titleClearance = titleLineWorld * 0.5 + titleLineWorld * 2;
      const totalW =
        specials.reduce((s, m) => s + m.width, 0) + cardGap * (specials.length - 1);
      let sx = -totalW / 2;
      for (const m of specials) {
        const rect = { x: sx, y: titleClearance, width: m.width, height: m.height };
        placedRects.push(rect);
        positioned.push({ id: m.id, rect });
        sx += m.width + cardGap;
      }
    }

    // Place remaining items in a half-circle ABOVE the title (from left → top →
    // right) with varying radii so they're not all on one arc line. Items are
    // distributed evenly across the angular range [π, 0] (left-to-right in screen
    // coords where y-down) and placed at alternating closer/farther radii.
    const spiralled = members.filter((m) => !specialIds.has(m.id));

    if (spiralled.length > 0) {
      const extents = spiralled.map((m) => Math.hypot(m.width, m.height));
      const avgExtent = extents.length
        ? extents.reduce((a, b) => a + b, 0) / extents.length
        : Math.max(1, ...extents);

      // Base radius: far enough that items clear the title area.
      const baseR = titleR + avgExtent * 0.5 + cardGap;
      // Radius variation: alternate between inner and outer arcs.
      const radiusStep = avgExtent * 0.6 + cardGap;

      // Distribute angles evenly across the top half-circle [π..0] (above center).
      const n = spiralled.length;
      const angleStart = Math.PI;  // left
      const angleEnd = 0;          // right (in screen coords, both above center since we use -sin)

      for (let i = 0; i < n; i++) {
        const m = spiralled[i];
        // Evenly spaced angle across the half-circle.
        const t = n > 1 ? i / (n - 1) : 0.5;
        const angle = angleStart + (angleEnd - angleStart) * t;

        // Alternate radii: even indices closer, odd indices farther.
        const ringIndex = i % 3;
        const radius = baseR + ringIndex * radiusStep;

        // Position: use -sin for Y so items go above (negative Y = up).
        const cx = Math.cos(angle) * radius;
        const cy = -Math.sin(angle) * radius;

        let rect: Rect = { x: cx - m.width / 2, y: cy - m.height / 2, width: m.width, height: m.height };

        // Nudge outward if overlapping any previously placed card.
        let nudge = 0;
        for (let guard = 0; guard < 200; guard++) {
          const clearsTitle = !circleIntersectsRect(0, 0, titleR, rect);
          const free = placedRects.every((p) => !rectsIntersectPadded(p, rect, cardGap));
          if (clearsTitle && free) break;
          nudge += cardGap * 0.5;
          const r2 = radius + nudge;
          const nx = Math.cos(angle) * r2;
          const ny = -Math.sin(angle) * r2;
          rect = { x: nx - m.width / 2, y: ny - m.height / 2, width: m.width, height: m.height };
        }

        placedRects.push(rect);
        positioned.push({ id: m.id, rect });
      }
    }

    // Farthest corner from the local centre — used to keep clusters apart.
    let outerRadius = titleR;
    for (const r of placedRects) {
      const corners = [
        Math.hypot(r.x, r.y),
        Math.hypot(r.x + r.width, r.y),
        Math.hypot(r.x, r.y + r.height),
        Math.hypot(r.x + r.width, r.y + r.height),
      ];
      outerRadius = Math.max(outerRadius, ...corners);
    }
    return { topic, positioned, outerRadius };
  });

  // 2. Separate "general" topic (centred alongside the abstract) from other
  //    clusters which are spread on the radial ring.
  const generalCluster = local.find((c) => c.topic === 'general');
  const ringClusters = local.filter((c) => c.topic !== 'general');

  // Place the "general" cluster at the origin (same centre as the abstract).
  if (generalCluster) {
    const itemIds: string[] = [];
    const memberRects: Rect[] = [];
    generalCluster.positioned.forEach((p) => {
      const rect = { x: p.rect.x, y: p.rect.y, width: p.rect.width, height: p.rect.height };
      placements.push({ id: p.id, bounds: rect });
      memberRects.push(rect);
      itemIds.push(p.id);
    });
    clusters.push({
      topic: generalCluster.topic,
      center: { x: 0, y: 0 },
      bounds: boundsOfRects(memberRects),
      itemIds,
    });
  }

  const maxOuter = Math.max(1, ...ringClusters.map((c) => c.outerRadius));
  const generalOuter = generalCluster ? generalCluster.outerRadius : 0;
  const m = Math.max(1, ringClusters.length);
  const globalStep = (2 * Math.PI) / m;
  const minChord = 2 * maxOuter + clusterGap * 2;
  const globalRadius = Math.max(
    // Ring clusters must clear each other.
    maxOuter + clusterGap,
    minChord / (2 * Math.sin(Math.min(Math.PI / 2, globalStep / 2)) || 1),
    // Ring clusters must also clear the general cluster at the origin.
    generalOuter + maxOuter + clusterGap,
  );

  ringClusters.forEach((cluster, index) => {
    const angle = -Math.PI / 2 + index * globalStep;
    const cx = Math.cos(angle) * globalRadius;
    const cy = Math.sin(angle) * globalRadius;

    const itemIds: string[] = [];
    const memberRects: Rect[] = [];
    cluster.positioned.forEach((p) => {
      const rect = { x: cx + p.rect.x, y: cy + p.rect.y, width: p.rect.width, height: p.rect.height };
      placements.push({ id: p.id, bounds: rect });
      memberRects.push(rect);
      itemIds.push(p.id);
    });

    clusters.push({
      topic: cluster.topic,
      center: { x: cx, y: cy },
      bounds: boundsOfRects(memberRects),
      itemIds,
    });
  });

  // 3. Abstract in the dead centre.
  let abstractBounds: Rect | null = null;
  if (abstract) {
    abstractBounds = {
      x: -abstract.width / 2,
      y: -abstract.height / 2,
      width: abstract.width,
      height: abstract.height,
    };
  }

  const allRects = [
    ...placements.map((p) => p.bounds),
    ...(abstractBounds ? [abstractBounds] : []),
  ];
  return { placements, clusters, abstractBounds, bounds: boundsOfRects(allRects) };
}

/** AABB intersection test with both rects inflated by `pad`. */
function rectsIntersectPadded(a: Rect, b: Rect, pad: number): boolean {
  return (
    a.x - pad < b.x + b.width &&
    a.x + a.width + pad > b.x &&
    a.y - pad < b.y + b.height &&
    a.y + a.height + pad > b.y
  );
}

/** True when the circle (cx,cy,r) overlaps the rectangle. */
function circleIntersectsRect(cx: number, cy: number, r: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
  return Math.hypot(cx - nearestX, cy - nearestY) < r;
}

function boundsOfRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function boundsOfPlacements(placements: { bounds: Rect }[]): Rect {
  return boundsOfRects(placements.map((p) => p.bounds));
}
