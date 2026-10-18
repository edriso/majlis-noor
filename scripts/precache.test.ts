import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  injectPrecache,
  isPrecached,
  precacheManifest,
  PRECACHE_TOKEN,
} from './precache.ts';

/* The list of files the service worker installs, made from a built site. */

let dir = '';
const site = (files: Record<string, string>) => {
  dir = mkdtempSync(join(tmpdir(), 'majlis-noor-precache-'));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), contents);
  }
  return dir;
};
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

/** A built site as Vite leaves it, with the Mushaf's pages as files. */
const built = (pages = 604) => ({
  'index.html': '<!doctype html>',
  'sw.js': `const x = ${PRECACHE_TOKEN};`,
  'og.png': 'card',
  'manifest.webmanifest': '{}',
  'favicon.svg': '<svg/>',
  'icon-192.png': 'icon',
  'assets/index-AbC123.js': 'app',
  'assets/index-DeF456.css': 'css',
  'assets/husary-GhI789.js': 'timings',
  'fonts/amiri-quran/AmiriQuran.woff2': 'font',
  'fonts/amiri-quran/OFL.txt': 'licence',
  'reciters/husary.webp': 'photo',
  'words/husary/1.json': '[]',
  'words/husary/2.json': '[]',
  '.DS_Store': 'junk',
  ...Object.fromEntries(
    Array.from({ length: pages }, (_, i) => [
      `pages/${i + 1}.json`,
      `{"page":${i + 1}}`,
    ]),
  ),
});

describe('the precache list', () => {
  it('holds what the app needs to open and read, and nothing else', () => {
    const { files } = precacheManifest(site(built()));
    const paths = Object.keys(files);
    expect(paths).toContain('index.html');
    expect(paths).toContain('manifest.webmanifest');
    expect(paths).toContain('favicon.svg');
    expect(paths).toContain('icon-192.png');
    expect(paths).toContain('assets/index-AbC123.js');
    expect(paths).toContain('assets/index-DeF456.css');
    expect(paths).toContain('assets/husary-GhI789.js');
    expect(paths).toContain('fonts/amiri-quran/AmiriQuran.woff2');
    for (const left of [
      'sw.js',
      'og.png',
      'fonts/amiri-quran/OFL.txt',
      'reciters/husary.webp',
      'words/husary/1.json',
      '.DS_Store',
    ])
      expect(paths).not.toContain(left);
  });

  it('holds all 604 pages, each by its own hash', () => {
    const { files } = precacheManifest(site(built()));
    const pages = Object.keys(files).filter((p) => p.startsWith('pages/'));
    expect(pages).toHaveLength(604);
    expect(new Set(pages.map((p) => files[p])).size).toBe(604);
    for (const p of pages) expect(files[p]).toMatch(/^[0-9a-f]{10}$/);
  });

  it('hashes only what has no hash in its name', () => {
    const { files } = precacheManifest(site(built(1)));
    expect(files['assets/index-AbC123.js']).toBe('');
    expect(files['index.html']).toMatch(/^[0-9a-f]{10}$/);
  });

  it('changes a file’s hash when its contents change, and no other', () => {
    const before = precacheManifest(site(built(3))).files;
    writeFileSync(join(dir, 'pages/2.json'), '{"page":2,"fixed":true}');
    const after = precacheManifest(dir).files;
    expect(after['pages/2.json']).not.toBe(before['pages/2.json']);
    expect(after['pages/1.json']).toBe(before['pages/1.json']);
    expect(after['index.html']).toBe(before['index.html']);
  });

  it('gives the word timings one hash, which any change moves', () => {
    const before = precacheManifest(site(built(1))).words;
    expect(before).toMatch(/^[0-9a-f]{10}$/);
    writeFileSync(join(dir, 'words/husary/2.json'), '[[1,0,10]]');
    expect(precacheManifest(dir).words).not.toBe(before);
    const {
      'words/husary/1.json': _,
      'words/husary/2.json': __,
      ...rest
    } = built(1);
    expect(precacheManifest(site(rest)).words).toBe('');
  });

  it('refuses a site with no page to open', () => {
    const { 'index.html': _, ...rest } = built(1);
    expect(() => precacheManifest(site(rest))).toThrow(/index\.html/);
  });

  it.each([
    ['sw.js', false],
    ['og.png', false],
    ['words/husary/1.json', false],
    ['reciters/sudais.webp', false],
    ['fonts/reem-kufi/OFL.txt', false],
    ['assets/.DS_Store', false],
    ['pages/604.json', true],
    ['apple-touch-icon.png', true],
  ])('%s is kept: %s', (path, kept) => {
    expect(isPrecached(path)).toBe(kept);
  });
});

describe('writing the list into the worker', () => {
  const list = { files: { 'index.html': 'abc', 'a$&b.js': '' }, words: '' };

  it('replaces the placeholder with the list', () => {
    const source = `const { files } = ${PRECACHE_TOKEN};\nself.go();`;
    const out = injectPrecache(source, list);
    expect(out).not.toContain(PRECACHE_TOKEN);
    expect(out).toBe(`const { files } = ${JSON.stringify(list)};\nself.go();`);
  });

  it('fails the build without the placeholder, or with two', () => {
    expect(() => injectPrecache('const x = {};', list)).toThrow(/0 times/);
    expect(() =>
      injectPrecache(`${PRECACHE_TOKEN};${PRECACHE_TOKEN}`, list),
    ).toThrow(/2 times/);
  });

  it('finds the placeholder once in the real worker', () => {
    const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
    expect(source.split(PRECACHE_TOKEN)).toHaveLength(2);
  });
});
