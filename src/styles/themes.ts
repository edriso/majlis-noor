/* The theme colours that script and HTML need, in one place. tokens.css
   still defines each theme for the stylesheets; this map carries the few
   values that have to exist outside them: the ground painted before the
   bundle loads and given to the browser's own chrome, the gold the boot
   screen writes the name in, and each theme's dot in the colour choice.
   themes.test.ts fails if a value here and its token disagree, and
   vite.config.ts writes index.html's copies from here at build time. */

import type { Theme } from '../halaqa/state.ts';

export type ThemeColours = {
  /** `--bg`: the ground, and the `theme-color` a phone paints its bars in. */
  ground: string;
  /** `--gold`: the app's name on the boot screen. */
  gold: string;
  /** The theme's dot in the colour choice. Not a token: every dot keeps
      its own theme's colour whichever theme is on. */
  swatch: string;
};

export const THEMES: Record<Theme, ThemeColours> = {
  green: { ground: '#0c2019', gold: '#d9b469', swatch: '#1d5a43' },
  burgundy: { ground: '#2a0f14', gold: '#d9b469', swatch: '#6b1f2c' },
  blue: { ground: '#0d1729', gold: '#d9b469', swatch: '#233f73' },
  sand: { ground: '#e3dccd', gold: '#7c5714', swatch: '#eadcc0' },
};

/** The theme of a first visit, and of `:root` with no `data-theme`. */
export const DEFAULT_THEME: Theme = 'green';

/** The tokens in index.html that `themeHtml` fills, so a page that lost
    one fails the build instead of shipping a theme with no colour. */
export const THEME_TOKENS = [
  '%THEME%',
  '%THEME_COLOR%',
  '%THEME_GROUNDS%',
  '%THEME_COLORS%',
] as const;

/**
 * index.html with its theme colours written in: the default theme on
 * `<html>`, its ground as `theme-color`, each theme's ground and boot gold as
 * CSS for the boot screen, and the grounds again as the map the inline boot
 * script reads. That script runs before the bundle, so it cannot import
 * this; the build hands it its own copy instead.
 */
export function themeHtml(html: string): string {
  const missing = THEME_TOKENS.filter((t) => !html.includes(t));
  if (missing.length)
    throw new Error(
      `index.html no longer contains ${missing.join(', ')}, so its theme colours cannot be written in.`,
    );
  const rule = (selector: string, c: ThemeColours) =>
    `${selector} { background: ${c.ground}; --boot-gold: ${c.gold}; }`;
  const grounds = [
    rule('html', THEMES[DEFAULT_THEME]),
    ...entries()
      .filter(([t]) => t !== DEFAULT_THEME)
      .map(([t, c]) => rule(`html[data-theme='${t}']`, c)),
  ].join('\n      ');
  const colors = JSON.stringify(
    Object.fromEntries(entries().map(([t, c]) => [t, c.ground])),
  );
  return html
    .replaceAll('%THEME_COLORS%', colors)
    .replaceAll('%THEME_GROUNDS%', grounds)
    .replaceAll('%THEME_COLOR%', THEMES[DEFAULT_THEME].ground)
    .replaceAll('%THEME%', DEFAULT_THEME);
}

const entries = () => Object.entries(THEMES) as [Theme, ThemeColours][];
