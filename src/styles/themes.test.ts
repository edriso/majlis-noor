import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultPrefs } from '@/halaqa/state';
import { DEFAULT_THEME, THEME_TOKENS, THEMES, themeHtml } from './themes';

/* themes.ts carries the theme colours that script and HTML need, and
   tokens.css defines the themes for the stylesheets. These tests keep the
   two from drifting, and check that the HTML written from themes.ts still
   paints a saved theme before the bundle loads. */

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

  it('agree on the default, which is also a first visit’s', () => {
    expect(DEFAULT_THEME).toBe(defaultPrefs.theme);
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

  it('paints every theme’s ground and gold before the bundle loads', () => {
    const style = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('head style')?.textContent;
    for (const [theme, c] of Object.entries(THEMES)) {
      const selector =
        theme === DEFAULT_THEME ? 'html' : `html[data-theme='${theme}']`;
      expect(style).toContain(
        `${selector} { background: ${c.ground}; --boot-gold: ${c.gold}; }`,
      );
    }
    expect(style).toContain('color: var(--boot-gold)');
  });

  /** Runs the inline boot script against this document, as the browser
      runs it before the bundle. */
  const boot = () => {
    const page = new DOMParser().parseFromString(html, 'text/html');
    const script = [...page.querySelectorAll('head script')].find(
      (s) => !s.getAttribute('src'),
    )?.textContent;
    expect(script).toBeTruthy();
    document.head.innerHTML = `<meta name="theme-color" content="${THEMES[DEFAULT_THEME].ground}">`;
    // Nothing but what a page has before any of its bundle has run.
    runInNewContext(script!, { document, localStorage });
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

  it('leaves the default for a theme it does not know, or no theme', () => {
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({ prefs: { theme: 'neon' } }),
    );
    expect(boot()).toEqual({
      theme: undefined,
      color: THEMES[DEFAULT_THEME].ground,
    });
    localStorage.setItem('majlis-noor:v1', '{not json');
    expect(boot().color).toBe(THEMES[DEFAULT_THEME].ground);
  });

  it('fails the build if index.html loses a token', () => {
    expect(() =>
      themeHtml(read('index.html').replace('%THEME_COLORS%', '{}')),
    ).toThrow(/%THEME_COLORS%/);
  });
});
