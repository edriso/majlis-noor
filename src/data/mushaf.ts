/* The Mushaf: 604 pages of the King Fahd Complex Madani print (1421H).

   `mushaf.json` is the small index every screen needs without opening a page:
   the 114 surahs, and where every surah, juz, hizb quarter and page begins,
   as the number of its first ayah through the whole Mushaf. The pages
   themselves are one JSON file each in public/pages, fetched when they
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

export const surah = (n: number) => surahs[n - 1];

export const clampPage = (p: number) =>
  Math.min(PAGE_COUNT, Math.max(1, Math.round(p) || 1));

/* Every ayah has a number through the whole Mushaf, 1 (al-Fatihah 1) to
   6236 (an-Nas 6), and the index gives the first ayah of every surah, juz,
   hizb quarter and page in those numbers. Each is then a half-open stretch,
   [its first ayah, the next one's first ayah), with nothing left between
   them, because the Madani print ends every page on a whole ayah. */

export const AYAH_COUNT = 6236;
export const RUB_COUNT = 240;
export const JUZ_COUNT = 30;
export const SURAH_COUNT = 114;

/** A half-open stretch of global ayah numbers, `from` read and `to` not:
    {from: 8, to: 11} is al-Baqarah 1 to 3. Empty when `to <= from`. */
export type AyahRange = { from: number; to: number };

/** Where a surah's ayah is: al-Baqarah 255 is {surah: 2, ayah: 255}. */
export type Verse = { surah: number; ayah: number };

const starts = index.starts;

/** The number of the stretch that holds `n`: the last start not after it.
    `list` rises from 1, so a binary search finds it; numbers before or
    after the Mushaf answer the first or last stretch. */
function stretchOf(list: readonly number[], n: number) {
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid] <= n) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** The first ayah of stretch `n` of `list`, where the one after the last
    begins just past the end of the Mushaf. */
const startOf = (list: readonly number[], n: number) =>
  n > list.length ? AYAH_COUNT + 1 : list[n - 1];

const stretchRange = (list: readonly number[], n: number): AyahRange => ({
  from: startOf(list, n),
  to: startOf(list, n + 1),
});

/** An ayah's number through the whole Mushaf: ayahIndex(2, 255) is 262. */
export const ayahIndex = (s: number, ayah: number) =>
  starts.surahs[s - 1] + ayah - 1;

/** The surah and ayah of a global ayah number: the reverse of ayahIndex. */
export function verseOf(index: number): Verse {
  const s = stretchOf(starts.surahs, index);
  return { surah: s, ayah: index - starts.surahs[s - 1] + 1 };
}

/** «2:255», the verse key the page data and the timings use. */
export function verseKey(index: number) {
  const { surah: s, ayah } = verseOf(index);
  return `${s}:${ayah}`;
}

/** The global number of a verse key such as «2:255». */
export function ayahOfKey(key: string) {
  const [s, ayah] = key.split(':').map(Number);
  return ayahIndex(s, ayah);
}

export const surahOfAyah = (index: number) => stretchOf(starts.surahs, index);
export const juzOfAyah = (index: number) => stretchOf(starts.juz, index);
export const rubOfAyah = (index: number) => stretchOf(starts.rubs, index);
export const pageOfAyah = (index: number) => stretchOf(starts.pages, index);

/** The first ayah on a page; page 605 answers the end of the Mushaf. */
export const firstAyahOfPage = (p: number) => startOf(starts.pages, p);
/** The first ayah of a hizb quarter, 1 to 240; 241 is the end. */
export const rubStart = (n: number) => startOf(starts.rubs, n);

export const ayatOfPage = (p: number) => stretchRange(starts.pages, p);
export const surahRange = (s: number) => stretchRange(starts.surahs, s);
export const juzRange = (j: number) => stretchRange(starts.juz, j);
export const rubRange = (n: number) => stretchRange(starts.rubs, n);

/** The pages an ayah range is read on, in order: none for an empty one. */
export function pagesOfRange({ from, to }: AyahRange) {
  if (to <= from) return [];
  const first = pageOfAyah(from);
  const last = pageOfAyah(to - 1);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** The surah a page is named by: the first one with text on it, which is
    the surah of its first ayah, since no page begins inside one. */
export const surahOfPage = (p: number) =>
  surah(surahOfAyah(firstAyahOfPage(clampPage(p))));
/** The juz of a page's first ayah, as its margin names it. */
export const juzOfPage = (p: number) =>
  juzOfAyah(firstAyahOfPage(clampPage(p)));
export const rubOfPage = (p: number) =>
  rubOfAyah(firstAyahOfPage(clampPage(p)));

/** The first page whose first ayah is in each juz, 1 to 30. Four juz begin
    part-way down a page (4, 7, 11 and 26); this names the page after it,
    the first one the margin gives to the juz. `juzRange` has the ayah. */
export const juzStarts: number[] = Array.from({ length: JUZ_COUNT }, (_, i) => {
  const first = pageOfAyah(starts.juz[i]);
  return firstAyahOfPage(first) === starts.juz[i] ? first : first + 1;
});

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
