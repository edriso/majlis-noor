/* What the service worker keeps for offline use, and how the list is
   written into it. vite.config.ts runs this over the built site after every
   build; public/sw.js is the worker that reads the list.

   The list is every file the app needs to open and read with no
   connection: the page, its scripts and styles, the Mushaf's pages, the
   fonts, the manifest and icons. Each comes with a hash of its contents, so
   a new build's worker fetches only what changed, and a file whose name
   stays the same (a page, a font) never has its new contents mistaken for
   the old. */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The placeholder in public/sw.js that the list replaces. */
export const PRECACHE_TOKEN = 'self.__PRECACHE__';

export type Precache = {
  /** Each file to keep, by its path from the worker's scope, with a hash
      of its contents; '' under assets/, whose names already carry one. */
  files: Record<string, string>;
  /** One hash over every word-timing file, '' when there are none. They are
      kept as each surah is heard rather than up front, and a change to any
      of them drops that cache. */
  words: string;
};

/** Whether a built file is kept when the worker installs. */
export function isPrecached(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  // The worker itself, which the browser keeps on its own terms.
  if (path === 'sw.js') return false;
  // The share card, which only link scrapers fetch.
  if (path === 'og.png') return false;
  // About 2 MB of word timings, kept as each surah is heard.
  if (path.startsWith('words/')) return false;
  // Reciters' photos, which a reader may hide; kept as they are seen.
  if (path.startsWith('reciters/')) return false;
  // Licences beside the fonts, read by people, never by the app.
  if (name.endsWith('.txt')) return false;
  // .DS_Store and the like, if a build machine leaves them.
  if (name.startsWith('.')) return false;
  return true;
}

/** Every file under a directory, as paths from it with forward slashes. */
export function filesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => statSync(join(dir, f)).isFile())
    .map((f) => f.split('\\').join('/'))
    .toSorted();
}

const digest = (...parts: (string | Buffer)[]) => {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest('hex').slice(0, 10);
};

/** The list for a built site. */
export function precacheManifest(dir: string): Precache {
  const all = filesIn(dir);
  const read = (f: string) => readFileSync(join(dir, f));
  const words = all.filter((f) => f.startsWith('words/'));
  const precache: Precache = {
    files: Object.fromEntries(
      all
        .filter(isPrecached)
        .map((f) => [f, f.startsWith('assets/') ? '' : digest(read(f))]),
    ),
    words: words.length
      ? digest(...words.flatMap((f) => [f, '\0', read(f), '\0']))
      : '',
  };
  if (!('index.html' in precache.files))
    throw new Error(
      `${dir} has no index.html, so the worker would have no page to open offline.`,
    );
  return precache;
}

/** The worker's source with the list written in. Fails unless the
    placeholder is there exactly once, so a worker that would keep nothing
    is never built. */
export function injectPrecache(source: string, precache: Precache): string {
  const found = source.split(PRECACHE_TOKEN).length - 1;
  if (found !== 1)
    throw new Error(
      `public/sw.js must contain ${PRECACHE_TOKEN} exactly once, and has it ${found} times, so the built worker would not know what to keep offline.`,
    );
  // A function, so a `$` in the list is never read as a replacement pattern.
  return source.replace(PRECACHE_TOKEN, () => JSON.stringify(precache));
}
