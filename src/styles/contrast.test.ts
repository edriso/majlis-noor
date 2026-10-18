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

const block = (selector: string) => {
  const start = tokens.indexOf(selector);
  const body = tokens.slice(
    tokens.indexOf('{', start) + 1,
    tokens.indexOf('}', start),
  );
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [
      m[1],
      m[2],
    ]),
  );
};

const root = block(':root {');
// Every theme the app offers, so a new one is measured as soon as it exists.
const themes = Object.fromEntries(
  Object.keys(THEMES).map((t) => [t, block(`:root[data-theme='${t}']`)]),
);

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(Object.entries(themes))('%s', (_, theme) => {
  const c = { ...root, ...theme };
  it.each([
    ['fg', 'bg', 4.5],
    ['fg', 'surface', 4.5],
    ['muted', 'bg', 4.5],
    ['muted', 'surface', 4.5],
    ['muted', 'surface-raised', 4.5],
    ['gold', 'bg', 4.5],
    ['gold', 'surface', 4.5],
    ['gold', 'surface-raised', 4.5],
    ['danger', 'surface', 4.5],
    ['on-gold', 'gold', 4.5],
    ['on-gold', 'gold-strong', 4.5],
    ['control-border', 'bg', 3],
    ['control-border', 'surface', 3],
  ])('--%s on --%s', (ink, ground, min) => {
    expect(c[ink], ink).toBeDefined();
    expect(c[ground], ground).toBeDefined();
    expect(ratio(c[ink], c[ground])).toBeGreaterThanOrEqual(min as number);
  });
});

it.each([
  ['ink', 'paper'],
  ['ink-soft', 'paper'],
])('--%s on --%s', (ink, ground) => {
  expect(ratio(root[ink], root[ground])).toBeGreaterThanOrEqual(4.5);
});
