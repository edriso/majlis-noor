/* The theme colours that script and HTML need, in one place. tokens.css
   still defines each theme for the stylesheets; this map carries the few
   values that have to exist outside them: the ground painted before the
   bundle loads and given to the browser's own chrome, the gold the boot
   screen writes the name in, whether the theme is dark or light, and each
   theme's dot in the colour choice.
   themes.test.ts fails if a value here and its token disagree, and
   vite.config.ts writes index.html's copies from here at build time,
   with the script that paints a saved theme before the bundle loads. */

import type { Theme } from '../halaqa/state.ts';

export type ThemeColours = {
  /** `--bg`: the ground, and the `theme-color` a phone paints its bars in. */
  ground: string;
  /** `--gold`: the app's name on the boot screen. */
  gold: string;
  /** `color-scheme`: which way the browser draws its own scrollbars and
      controls, before the stylesheet says so too. */
  scheme: 'dark' | 'light';
  /** The theme's dot in the colour choice. Not a token: every dot keeps
      its own theme's colour whichever theme is on. */
  swatch: string;
};

export const THEMES: Record<Theme, ThemeColours> = {
  green: {
    ground: '#0c2019',
    gold: '#d9b469',
    scheme: 'dark',
    swatch: '#1d5a43',
  },
  burgundy: {
    ground: '#2a0f14',
    gold: '#d9b469',
    scheme: 'dark',
    swatch: '#6b1f2c',
  },
  blue: {
    ground: '#0d1729',
    gold: '#d9b469',
    scheme: 'dark',
    swatch: '#233f73',
  },
  sand: {
    ground: '#e3dccd',
    gold: '#7c5714',
    scheme: 'light',
    swatch: '#eadcc0',
  },
};

/** The theme of `:root` with no `data-theme`, of a saved halaqa that never
    chose one, and of a first visit on a dark system. */
export const DEFAULT_THEME: Theme = 'green';

/** A first visit, with nothing saved, takes the system's side: the
    courtyard by day on a light system, the carpet at night on a dark one.
    From then on the theme is saved like any other choice, and kept. */
export const FIRST_VISIT: Record<'light' | 'dark', Theme> = {
  light: 'sand',
  dark: DEFAULT_THEME,
};

/** The theme for a first visit on this device. Without `matchMedia`, the
    default, as on a dark system. */
export function systemTheme(): Theme {
  const light =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-color-scheme: light)').matches;
  return FIRST_VISIT[light ? 'light' : 'dark'];
}

/** Where the halaqa is kept: src/halaqa/storage.ts's key, which
    themes.test.ts holds this to. */
const KEY = 'majlis-noor:v1';

/** The tokens in index.html that `themeHtml` fills, so a page that lost
    one fails the build instead of shipping a theme with no colour. */
export const THEME_TOKENS = [
  '%THEME%',
  '%THEME_COLOR%',
  '%THEME_GROUNDS%',
  '%THEME_SCRIPT%',
] as const;

/**
 * The script index.html runs before the bundle, so that the first paint is
 * already in the reader's theme. It reads the theme the way the app will
 * (src/halaqa/storage.ts, then sanitizeState): the halaqa under the app's
 * key; a saved halaqa with no theme, or one it does not know, keeps the
 * default; nothing saved, or nothing readable, takes the system's side
 * (`FIRST_VISIT`). Old JavaScript, since it runs in whatever browser
 * opens the page, and it must never throw.
 */
export function bootScript(): string {
  const colours = JSON.stringify(
    Object.fromEntries(entries().map(([t, c]) => [t, c.ground])),
  );
  const q = JSON.stringify;
  return `(function () {
        var colors = ${colours};
        var theme;
        try {
          var raw = localStorage.getItem(${q(KEY)});
          if (raw !== null) {
            var saved = JSON.parse(raw);
            theme = (saved && saved.prefs && saved.prefs.theme) || ${q(DEFAULT_THEME)};
          }
        } catch (_) {}
        if (!theme)
          theme =
            typeof matchMedia === 'function' &&
            matchMedia('(prefers-color-scheme: light)').matches
              ? ${q(FIRST_VISIT.light)}
              : ${q(FIRST_VISIT.dark)};
        if (colors[theme]) {
          document.documentElement.dataset.theme = theme;
          var meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute('content', colors[theme]);
        }
      })();`;
}

/**
 * index.html with its theme colours written in: the default theme on
 * `<html>`, its ground as `theme-color`, each theme's ground, boot gold and
 * colour scheme as CSS for the boot screen, and the boot script
 * (`bootScript`). That script
 * runs before the bundle, so it cannot import this; the build hands it its
 * own copy instead.
 */
export function themeHtml(html: string): string {
  const missing = THEME_TOKENS.filter((t) => !html.includes(t));
  if (missing.length)
    throw new Error(
      `index.html no longer contains ${missing.join(', ')}, so its theme colours cannot be written in.`,
    );
  const rule = (selector: string, c: ThemeColours) =>
    `${selector} { color-scheme: ${c.scheme}; background: ${c.ground}; --boot-gold: ${c.gold}; }`;
  const grounds = [
    rule('html', THEMES[DEFAULT_THEME]),
    ...entries()
      .filter(([t]) => t !== DEFAULT_THEME)
      .map(([t, c]) => rule(`html[data-theme='${t}']`, c)),
  ].join('\n      ');
  return (
    html
      // A function, so nothing in the script is read as a `$&` pattern.
      .replaceAll('%THEME_SCRIPT%', () => bootScript())
      .replaceAll('%THEME_GROUNDS%', grounds)
      .replaceAll('%THEME_COLOR%', THEMES[DEFAULT_THEME].ground)
      .replaceAll('%THEME%', DEFAULT_THEME)
  );
}

const entries = () => Object.entries(THEMES) as [Theme, ThemeColours][];
