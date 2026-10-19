import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '@/App';
import { defaultPrefs } from '@/halaqa/state';
import { LEGACY_KEYS, STORAGE_KEY } from '@/halaqa/storage';
import {
  bootScript,
  DEFAULT_THEME,
  FIRST_VISIT,
  systemTheme,
  THEME_TOKENS,
  THEMES,
  themeHtml,
} from './themes';

/* themes.ts carries the theme colours that script and HTML need, and
   tokens.css defines the themes for the stylesheets. These tests keep the
   two from drifting, and check that the HTML written from themes.ts still
   paints a saved theme before the bundle loads, and a first visit in the
   system's light or dark, as the app itself then opens. */

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const tokens = read('src/styles/tokens.css');

/** The colours one rule of tokens.css declares, by token name. */
const declared = (selector: string) => {
  const start = tokens.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  const body = tokens.slice(
    tokens.indexOf('{', start) + 1,
    tokens.indexOf('}', start),
  );
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
      m[1],
      m[2].toLowerCase(),
    ]),
  );
};

describe('themes.ts and tokens.css', () => {
  it('name the same themes', () => {
    const inCss = [...tokens.matchAll(/:root\[data-theme='([\w-]+)'\]/g)].map(
      (m) => m[1],
    );
    expect(inCss.toSorted()).toEqual(Object.keys(THEMES).toSorted());
  });

  it.each(Object.entries(THEMES))(
    '%s: the ground is --bg and the gold is --gold',
    (theme, colours) => {
      const root = declared(':root {');
      const own = declared(`:root[data-theme='${theme}']`);
      expect(colours.ground).toBe(own.bg);
      expect(colours.gold).toBe(own.gold ?? root.gold);
    },
  );

  it.each(Object.entries(THEMES))(
    '%s: the scheme is its color-scheme',
    (theme, colours) => {
      const start = tokens.indexOf(`:root[data-theme='${theme}']`);
      const body = tokens.slice(start, tokens.indexOf('}', start));
      expect(body).toContain(`color-scheme: ${colours.scheme};`);
    },
  );

  it('agree on the default, which a dark system’s first visit takes', () => {
    expect(DEFAULT_THEME).toBe(defaultPrefs.theme);
    expect(FIRST_VISIT.dark).toBe(DEFAULT_THEME);
    // The default theme's rule is the one that also styles a bare :root.
    expect(tokens).toContain(`:root,\n:root[data-theme='${DEFAULT_THEME}'] {`);
  });

  it('give the web manifest the default ground', () => {
    // Vite copies the manifest without reading it, so it keeps literal
    // colours; this is what keeps them right.
    const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
      theme_color: string;
      background_color: string;
    };
    expect(manifest.theme_color).toBe(THEMES[DEFAULT_THEME].ground);
    expect(manifest.background_color).toBe(THEMES[DEFAULT_THEME].ground);
  });

  it('give every swatch a colour of its own', () => {
    const swatches = Object.values(THEMES).map((c) => c.swatch);
    expect(new Set(swatches).size).toBe(swatches.length);
    for (const s of swatches) expect(s).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('index.html as the build writes it', () => {
  const html = themeHtml(read('index.html'));

  afterEach(() => {
    document.head.innerHTML = '';
    delete document.documentElement.dataset.theme;
  });

  it('is left with none of the tokens', () => {
    for (const token of THEME_TOKENS) expect(html).not.toContain(token);
  });

  it('starts in the default theme', () => {
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(page.documentElement.dataset.theme).toBe(DEFAULT_THEME);
    expect(
      page.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    ).toBe(THEMES[DEFAULT_THEME].ground);
  });

  it('paints every theme’s ground, gold and scheme before the bundle loads', () => {
    const style = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('head style')?.textContent;
    for (const [theme, c] of Object.entries(THEMES)) {
      const selector =
        theme === DEFAULT_THEME ? 'html' : `html[data-theme='${theme}']`;
      expect(style).toContain(
        `${selector} { color-scheme: ${c.scheme}; background: ${c.ground}; --boot-gold: ${c.gold}; }`,
      );
    }
    expect(style).toContain('color: var(--boot-gold)');
  });

  /** A system that prefers light or dark, as `matchMedia` answers it. */
  const system = (scheme: 'light' | 'dark') => (query: string) =>
    ({
      matches: query === `(prefers-color-scheme: ${scheme})`,
    }) as MediaQueryList;

  /** Runs the inline boot script against this document, as the browser
      runs it before the bundle, on a system that prefers `scheme`, or on
      one that cannot say. */
  const boot = (scheme?: 'light' | 'dark') => {
    const page = new DOMParser().parseFromString(html, 'text/html');
    const script = [...page.querySelectorAll('head script')].find(
      (s) => !s.getAttribute('src'),
    )?.textContent;
    expect(script).toBeTruthy();
    document.head.innerHTML = `<meta name="theme-color" content="${THEMES[DEFAULT_THEME].ground}">`;
    // Nothing but what a page has before any of its bundle has run.
    runInNewContext(script!, {
      document,
      localStorage,
      ...(scheme ? { matchMedia: system(scheme) } : {}),
    });
    return {
      theme: document.documentElement.dataset.theme,
      color: document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    };
  };

  it('paints the theme saved under the app’s key', () => {
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({ prefs: { theme: 'sand' } }),
    );
    expect(boot()).toEqual({ theme: 'sand', color: THEMES.sand.ground });
  });

  it('paints the theme saved under the old name’s key', () => {
    localStorage.setItem(
      'majlis-ayah:v1',
      JSON.stringify({ prefs: { theme: 'burgundy' } }),
    );
    expect(boot()).toEqual({
      theme: 'burgundy',
      color: THEMES.burgundy.ground,
    });
  });

  it('leaves the default for a theme it does not know', () => {
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({ prefs: { theme: 'neon' } }),
    );
    expect(boot('light')).toEqual({
      theme: undefined,
      color: THEMES[DEFAULT_THEME].ground,
    });
  });

  it('paints a first visit in the system’s light or dark', () => {
    expect(boot('light')).toEqual({
      theme: FIRST_VISIT.light,
      color: THEMES[FIRST_VISIT.light].ground,
    });
    expect(boot('dark')).toEqual({
      theme: FIRST_VISIT.dark,
      color: THEMES[FIRST_VISIT.dark].ground,
    });
    // A browser that cannot say keeps the default.
    expect(boot().color).toBe(THEMES[DEFAULT_THEME].ground);
  });

  it('takes the system’s side for a saved value it cannot read, as the app does', () => {
    localStorage.setItem('majlis-noor:v1', '{not json');
    expect(boot('light').theme).toBe(FIRST_VISIT.light);
  });

  it('never lets the system outweigh a saved halaqa', () => {
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({ prefs: { theme: 'green' } }),
    );
    expect(boot('light').theme).toBe('green');
    // Saved before themes could be chosen: the default, as the app reads it.
    localStorage.setItem('majlis-ayah:v1', JSON.stringify({ readers: ['أ'] }));
    localStorage.removeItem('majlis-noor:v1');
    expect(boot('light').color).toBe(THEMES[DEFAULT_THEME].ground);
  });

  it('fails the build if index.html loses a token', () => {
    expect(() =>
      themeHtml(read('index.html').replace('%THEME_SCRIPT%', '')),
    ).toThrow(/%THEME_SCRIPT%/);
  });
});

describe('a first visit', () => {
  const original = window.matchMedia;
  afterEach(() => {
    window.matchMedia = original;
    delete document.documentElement.dataset.theme;
  });
  const prefer = (scheme: 'light' | 'dark') => {
    window.matchMedia = ((query: string) => ({
      matches: query === `(prefers-color-scheme: ${scheme})`,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };

  it('is sand by day and green by night', () => {
    prefer('light');
    expect(systemTheme()).toBe('sand');
    prefer('dark');
    expect(systemTheme()).toBe('green');
  });

  it('opens the app in the system’s theme with nothing saved', () => {
    prefer('light');
    render(createElement(App));
    expect(document.documentElement.dataset.theme).toBe('sand');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).prefs.theme).toBe(
      'sand',
    );
  });

  it('opens it in the saved theme whatever the system says', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ prefs: { theme: 'blue' } }),
    );
    prefer('light');
    render(createElement(App));
    expect(document.documentElement.dataset.theme).toBe('blue');
  });

  it('reads the halaqa under the keys the app keeps it under', () => {
    expect(bootScript()).toContain(
      JSON.stringify([STORAGE_KEY, ...LEGACY_KEYS]),
    );
  });
});

/* Each theme tells the browser whether it is light or dark, so its own
   controls, scrollbars and form fields follow the ground. */
it.each(Object.keys(THEMES))('%s says whether it is light or dark', (theme) => {
  const rule = tokens.slice(tokens.indexOf(`:root[data-theme='${theme}']`));
  const scheme = /color-scheme:\s*(light|dark)/.exec(
    rule.slice(0, rule.indexOf('}')),
  )?.[1];
  expect(scheme).toBe(theme === 'sand' ? 'light' : 'dark');
});
