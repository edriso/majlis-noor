/* The Mushaf: 604 pages of the King Fahd Complex Madani print (1421H).

   `mushaf.json` is the small index every screen needs without opening a page:
   the 114 surahs and, per page, its first surah, juz and hizb quarter. The
   pages themselves are one JSON file each in public/pages, fetched when they
   are about to be read. Both are built by scripts/build-mushaf.ts and
   committed. */

import index from './mushaf.json';
import { arabic } from './arabic';

export const PAGE_COUNT = 604;
export const LINES_PER_PAGE = 15;

export type Surah = {
  n: number;
  name: string;
  ayat: number;
  /** The page its header is on. */
  page: number;
  place: 'makkah' | 'madinah';
};

export type Line =
  | { t: 'surah'; s: number }
  | { t: 'basmala' }
  | {
      t: 'text';
      /** Each word as its glyph in this page's font, and its ayah. */
      w: [code: string, verse: string][];
      /** The line as readable Uthmani text, for screen readers and as the
          fallback when the page font cannot load. */
      x: string;
    };

export type Page = {
  page: number;
  /** Every surah with text on the page, in order. */
  surahs: number[];
  juz: number;
  /** Hizb quarters (1 to 240) the page's ayat fall in. */
  rubs: number[];
  /** Ayat on the page that carry a prostration of recitation. */
  sajdah?: string[];
  lines: Line[];
};

export const surahs = index.surahs as Surah[];
const pageMeta = index.pages as [surah: number, juz: number, rub: number][];

export const surah = (n: number) => surahs[n - 1];

export const clampPage = (p: number) =>
  Math.min(PAGE_COUNT, Math.max(1, Math.round(p) || 1));

/** The surah a page is named by: the first one with text on it. */
export const surahOfPage = (p: number) => surah(pageMeta[clampPage(p) - 1][0]);
export const juzOfPage = (p: number) => pageMeta[clampPage(p) - 1][1];
export const rubOfPage = (p: number) => pageMeta[clampPage(p) - 1][2];

/** The page each juz begins on, 1 to 30. */
export const juzStarts: number[] = Array.from(
  { length: 30 },
  (_, i) => pageMeta.findIndex(([, juz]) => juz === i + 1) + 1,
);

/**
 * Where a hizb quarter sits, as the margin of the Mushaf names it: the hizb,
 * then which quarter of it. Quarter numbers run 1 to 240, four to a hizb.
 */
export function rubLabel(rub: number) {
  const hizb = Math.ceil(rub / 4);
  const quarter = (rub - 1) % 4;
  const prefix = ['', 'ربع ', 'نصف ', 'ثلاثة أرباع '][quarter];
  return `${prefix}الحزب ${arabic(hizb)}`;
}

/** «سورة البقرة». */
export const surahTitle = (n: number) => `سورة ${surah(n).name}`;

const cache = new Map<number, Promise<Page>>();
const loaded = new Map<number, Page>();

/** A page already loaded, to draw without waiting a frame for its promise. */
export const loadedPage = (p: number) => loaded.get(p);

/* The pages are plain files in public/pages, fetched by address rather than
   bundled: a map of 604 chunk imports was a sizeable part of the main
   script, and a file whose address never changes is simple for the service
   worker to keep. The address goes through BASE_URL, since the site may be
   served from a sub-path. */
async function fetchPage(n: number): Promise<Page> {
  const res = await fetch(`${import.meta.env.BASE_URL}pages/${n}.json`);
  if (!res.ok) throw new Error(`page ${n}: ${res.status}`);
  return (await res.json()) as Page;
}

/**
 * One page, loaded once and kept: a halaqa moves forward a page or two at a
 * time and steps back as often, so nothing is ever loaded twice. A page
 * asked for again while on its way shares the same request.
 */
export function loadPage(p: number): Promise<Page> {
  const n = clampPage(p);
  let pending = cache.get(n);
  if (!pending) {
    pending = fetchPage(n).then((page) => {
      loaded.set(n, page);
      return page;
    });
    // A failed load (offline before the page was ever kept) is forgotten so
    // the next attempt tries again instead of failing from the cache.
    pending.catch(() => cache.delete(n));
    cache.set(n, pending);
  }
  return pending;
}
