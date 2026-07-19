/**
 * Pure curve + colour maths shared by the browser canvas and the build-time
 * preview-image renderer. No DOM, no React, no store — safe to import from Node.
 */

/** Parse a hex color to RGB. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? parseInt(h[0] + h[0] + h[1] + h[1] + h[2] + h[2], 16)
    : parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Relative luminance (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Darken a hex colour by mixing it toward black. factor 0=unchanged, 1=black. */
export function darken(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex);
  const f = 1 - factor;
  const dr = Math.round(r * f);
  const dg = Math.round(g * f);
  const db = Math.round(b * f);
  return `#${((1 << 24) | (dr << 16) | (dg << 8) | db).toString(16).slice(1)}`;
}

/**
 * Build a smooth cubic Bézier path through a set of points.
 * - Default: Catmull-Rom spline (good for topic view's 2D scatter).
 * - monotoneX: monotone cubic (Fritsch-Carlson) — prevents vertical overshoot
 *   when points are mainly horizontal (timeline swimlanes).
 */
export function smoothPath(points: { x: number; y: number }[], monotoneX = false): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y}L${points[1].x},${points[1].y}`;
  }

  if (monotoneX) {
    // Monotone cubic interpolation (Fritsch-Carlson method).
    // Ensures the curve doesn't overshoot between data points on the Y axis.
    const n = points.length;
    const dx: number[] = [];
    const dy: number[] = [];
    const m: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      dx.push(points[i + 1].x - points[i].x);
      dy.push(points[i + 1].y - points[i].y);
      m.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
    }

    // Tangent slopes at each point.
    const tangent: number[] = new Array(n);
    tangent[0] = m[0];
    tangent[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) {
        tangent[i] = 0;
      } else {
        tangent[i] = (m[i - 1] + m[i]) / 2;
      }
    }

    // Clamp tangents for monotonicity.
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(m[i]) < 1e-10) {
        tangent[i] = 0;
        tangent[i + 1] = 0;
      } else {
        const alpha = tangent[i] / m[i];
        const beta = tangent[i + 1] / m[i];
        const s = alpha * alpha + beta * beta;
        if (s > 9) {
          const tau = 3 / Math.sqrt(s);
          tangent[i] = tau * alpha * m[i];
          tangent[i + 1] = tau * beta * m[i];
        }
      }
    }

    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const seg = dx[i] / 3;
      const cp1x = points[i].x + seg;
      const cp1y = points[i].y + tangent[i] * seg;
      const cp2x = points[i + 1].x - seg;
      const cp2y = points[i + 1].y - tangent[i + 1] * seg;
      d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${points[i + 1].x},${points[i + 1].y}`;
    }
    return d;
  }

  // Catmull-Rom to cubic Bézier conversion with tension = 0.3.
  const tension = 0.3;
  let d = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}
