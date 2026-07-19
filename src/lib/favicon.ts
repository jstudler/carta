/**
 * App icon / favicon generator.
 *
 * The app has no fixed logo — its identity IS the active colour scheme. This
 * builds a small SVG mark from the scheme (a rounded canvas in the scheme
 * background with a 2×2 cluster of cards in the palette colours), used both as
 * the browser favicon (#2) and as the "topic view" icon in the view toggle (#13)
 * so the two always match.
 */

import type { ColorScheme } from '../../app.config';

/** Build the app-icon SVG markup for a colour scheme. */
export function appIconSvg(scheme: ColorScheme): string {
  // Up to four palette colours arranged as a little cluster of cards.
  const dots = scheme.cards.slice(0, 4).map((c) => c.background);
  while (dots.length < 4) dots.push(scheme.accent);
  const [a, b, c, d] = dots;
  // Two card sizes/positions, slightly overlapping, echoing the canvas layout.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect x="2" y="2" width="60" height="60" rx="14" fill="${scheme.background}"/>`,
    `<rect x="11" y="11" width="20" height="26" rx="4" fill="${a}"/>`,
    `<rect x="34" y="14" width="19" height="18" rx="4" fill="${b}"/>`,
    `<rect x="12" y="40" width="18" height="13" rx="4" fill="${c}"/>`,
    `<rect x="33" y="35" width="20" height="18" rx="4" fill="${d}"/>`,
    `</svg>`,
  ].join('');
}

/** A `data:` URI for the app icon, suitable for <link rel="icon"> or <img src>. */
export function faviconDataUri(scheme: ColorScheme): string {
  return `data:image/svg+xml,${encodeURIComponent(appIconSvg(scheme))}`;
}

/** Set (or create) the document favicon from the colour scheme. */
export function applyFavicon(scheme: ColorScheme): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.type = 'image/svg+xml';
  link.href = faviconDataUri(scheme);
}
