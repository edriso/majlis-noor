import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEMES } from './themes';

/* Recomputes the contrast table at the head of tokens.css from the colours
   it actually declares, in every theme, so a colour changed for looks cannot
   quietly drop text below WCAG AA. */

const tokens = readFileSync(
  join(process.cwd(), 'src/styles/tokens.css'),
  'utf8',
);

type Colours = Record<string, string>;

/** The body of the first rule written with this selector. */
const body = (selector: string) => {
  const start = tokens.indexOf(selector);
  return tokens.slice(
    tokens.indexOf('{', start) + 1,
    tokens.indexOf('}', start),
  );
};

/** The plain colours a rule declares, by token name. */
const block = (selector: string): Colours =>
  Object.fromEntries(
    [...body(selector).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );

/** The colours a rule mixes from two others, as the tokens to mix and how
    much of the first. Only sRGB mixes of two opaque tokens are read; any
    other mix fails the test below rather than going unmeasured. */
const mixes = (selector: string) =>
  [...body(selector).matchAll(/--([\w-]+):\s*color-mix\(([^;]*)\);/g)].map(
    ([, name, args]) => {
      const m =
        /^in srgb,\s*var\(--([\w-]+)\)\s+(\d+(?:\.\d+)?)%,\s*var\(--([\w-]+)\)$/.exec(
          args.trim(),
        );
      return {
        name,
        args,
        mix: m && { a: m[1], share: Number(m[2]) / 100, b: m[3] },
      };
    },
  );

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** color-mix() in sRGB mixes the encoded channels, as a browser does. */
const mix = (a: string, b: string, share: number) =>
  `#${channels(a)
    .map((c, i) => Math.round(c * share + channels(b)[i] * (1 - share)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const root = block(':root {');
const rootMixes = mixes(':root {');
/** A theme's colours: its own over the root's, then the mixes resolved
    from them, since a mix declared once reads each theme's own tokens. */
const colours = (theme: string): Colours => {
  const own = `:root[data-theme='${theme}']`;
  const c = { ...root, ...block(own) };
  for (const { name, mix: m } of [...rootMixes, ...mixes(own)])
    if (m && c[m.a] && c[m.b]) c[name] = mix(c[m.a], c[m.b], m.share);
  return c;
};
// Every theme the app offers, so a new one is measured as soon as it exists.
const themes = Object.fromEntries(
  Object.keys(THEMES).map((t) => [t, colours(t)]),
);

it('can measure every colour mixed in tokens.css', () => {
  for (const { name, args, mix: m } of rootMixes)
    expect(m, `--${name}: color-mix(${args})`).toBeTruthy();
});

/** An ink on each of the eight tints a reader's face is drawn on. */
const seats = (ink: string) =>
  Array.from({ length: 8 }, (_, i) => [ink, `seat-${i + 1}`, 4.5]);

describe.each(Object.entries(themes))('%s', (_, c) => {
  it.each([
    ['fg', 'bg', 4.5],
    ['fg', 'surface', 4.5],
    ['muted', 'bg', 4.5],
    ['muted', 'surface', 4.5],
    ['muted', 'surface-raised', 4.5],
    ['gold', 'bg', 4.5],
    ['gold', 'surface', 4.5],
    ['gold', 'surface-raised', 4.5],
    ['danger', 'bg', 4.5],
    ['danger', 'surface', 4.5],
    ['on-gold', 'gold', 4.5],
    ['on-gold', 'gold-strong', 4.5],
    // The second line of a gold button, at rest and under the pointer.
    ['on-gold-muted', 'gold', 4.5],
    ['on-gold-muted', 'gold-strong', 4.5],
    ['control-border', 'bg', 3],
    ['control-border', 'surface', 3],
    // A control that cannot act now: dimmer than the rest, still legible.
    ['disabled', 'bg', 3],
    ['disabled', 'surface', 3],
    ['disabled', 'surface-raised', 3],
    // A reader's letter on their face's tint: quiet in the circle, plain
    // in the lists.
    ...seats('muted'),
    ...seats('fg'),
  ] as [string, string, number][])('--%s on --%s', (ink, ground, min) => {
    expect(c[ink], ink).toBeDefined();
    expect(c[ground], ground).toBeDefined();
    expect(ratio(c[ink], c[ground])).toBeGreaterThanOrEqual(min as number);
  });
});

/* The page is the same ivory in every theme, so what is drawn on it is
   measured once: its text, and the marks a turn and a recitation lay on
   it (text over the recitation's mark, the turn's underline against the
   paper as a graphic that must be seen, 3:1). */
describe('the page', () => {
  it('is ivory in every theme', () => {
    for (const t of Object.keys(THEMES))
      expect(block(`:root[data-theme='${t}']`).paper, t).toBeUndefined();
  });

  it.each([
    ['ink', 'paper', 4.5],
    ['ink-soft', 'paper', 4.5],
    ['ink', 'mark-recite', 4.5],
    ['ink-soft', 'mark-recite', 4.5],
    ['mark-turn', 'paper', 3],
  ])('--%s on --%s', (ink, ground, min) => {
    expect(ratio(root[ink], root[ground])).toBeGreaterThanOrEqual(
      min as number,
    );
  });
});
