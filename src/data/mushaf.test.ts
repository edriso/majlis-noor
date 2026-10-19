import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BASMALA_GLYPHS } from '@/mushaf/MushafPage';
import {
  AYAH_COUNT,
  ayahIndex,
  ayahOfKey,
  ayatOfPage,
  firstAyahOfPage,
  juzOfAyah,
  juzOfPage,
  juzRange,
  loadedPage,
  loadPage,
  PAGE_COUNT,
  pageOfAyah,
  pagesOfRange,
  RUB_COUNT,
  rubLabel,
  rubOfAyah,
  rubOfPage,
  rubRange,
  rubStart,
  surahOfAyah,
  surahOfPage,
  surahRange,
  surahs,
  verseKey,
  verseOf,
  type Page,
} from './mushaf';

// The pages are served from public/, so they are read here as the files
// they are, exactly as the browser will fetch them. (A path, not a URL:
// jsdom's URL is not one Node's file functions accept.)
const dir = join(import.meta.dirname, '../../public/pages');
const files = readdirSync(dir);
const raw = Array.from({ length: PAGE_COUNT }, (_, i) =>
  readFileSync(join(dir, `${i + 1}.json`), 'utf8'),
);
const pages: Page[] = raw.map((text) => JSON.parse(text) as Page);

/** Every ayah's verse key on a page, in reading order, each once. */
const keysOf = (p: Page) => [
  ...new Set(
    p.lines.flatMap((l) => (l.t === 'text' ? l.w.map(([, k]) => k) : [])),
  ),
];

/** Every verse key in the Mushaf in reading order: index i is ayah i + 1. */
const order = pages.flatMap(keysOf);

/** SHA-256 of the 604 page files read in order, as built on 2026-10-04 and
    rebuilt on 2026-10-18 with 84:21's end-of-ayah mark moved from line 13
    of page 589 to its place after «يَسْجُدُونَ ۩» on line 14. */
const PAGES_SHA256 =
  'f7801618b62d81198b9f423f455268a59f66ac48d262e422196ccfa535137725';

describe('the Mushaf', () => {
  it('has exactly 604 pages', () => {
    expect(files).toHaveLength(PAGE_COUNT);
    expect(pages.map((p) => p.page)).toEqual(
      Array.from({ length: PAGE_COUNT }, (_, i) => i + 1),
    );
  });

  it('is, byte for byte, the Mushaf that was built and checked', () => {
    // Rebuilding the pages must leave every file exactly as it is. A change
    // here is a change to the Quran's pages: it needs a reason, a review of
    // every page it touches, and then this digest.
    const digest = createHash('sha256');
    for (const text of raw) digest.update(text);
    expect(digest.digest('hex')).toBe(PAGES_SHA256);
  });

  it('keeps every glyph in reading order, so no word is on the wrong line', () => {
    // A page font numbers its glyphs in reading order (a hizb quarter's ۞ is
    // written with a space between its glyphs).
    for (const p of pages) {
      const codes = p.lines.flatMap((l) =>
        l.t === 'text'
          ? l.w.flatMap(([c]) =>
              Array.from(c.replaceAll(' ', ''), (g) => g.codePointAt(0)!),
            )
          : [],
      );
      const behind = codes.findIndex((c, i) => i > 0 && c <= codes[i - 1]);
      expect(behind, `page ${p.page}`).toBe(-1);
    }
  });

  it('ends 84:21 with its mark on line 14 of page 589, as the print does', () => {
    // The API puts this one mark on line 13, before the ayah's last words;
    // scripts/build-mushaf.ts moves it.
    const [l13, l14] = [12, 13].map((i) => pages[588].lines[i]);
    if (l13.t !== 'text' || l14.t !== 'text') throw new Error('not text');
    expect(l13.x.endsWith('وَإِذَا قُرِئَ')).toBe(true);
    expect(l14.x).toContain('يَسْجُدُونَ ۩ ﴿٢١﴾ بَلِ');
  });

  it('sets every page on 15 lines, and the opening two on 8', () => {
    for (const p of pages)
      expect(p.lines, `page ${p.page}`).toHaveLength(p.page <= 2 ? 8 : 15);
  });

  it('holds all 6,236 ayat once each, in order, each ending in its mark', () => {
    const order: string[] = [];
    for (const p of pages)
      for (const l of p.lines)
        if (l.t === 'text')
          for (const [, key] of l.w)
            if (order[order.length - 1] !== key) order.push(key);
    expect(order).toHaveLength(6236);
    expect(new Set(order).size).toBe(6236);
    expect(order[0]).toBe('1:1');
    expect(order[order.length - 1]).toBe('114:6');
    for (const s of surahs)
      expect(order.filter((k) => k.startsWith(`${s.n}:`))).toHaveLength(s.ayat);
  });

  it('ends every page on a whole ayah, as the Madani print does', () => {
    const pageOf = new Map<string, number>();
    for (const p of pages)
      for (const l of p.lines)
        if (l.t === 'text')
          for (const [, key] of l.w) {
            expect(pageOf.get(key) ?? p.page, key).toBe(p.page);
            pageOf.set(key, p.page);
          }
  });

  it('opens every surah with a header, and all but two with a basmala', () => {
    const lines = pages.flatMap((p) => p.lines);
    const headers = lines.flatMap((l, i) => (l.t === 'surah' ? [i] : []));
    expect(headers).toHaveLength(114);
    for (const i of headers) {
      const s = (lines[i] as { s: number }).s;
      const next = lines[i + 1];
      if (s === 1 || s === 9) expect(next.t, `surah ${s}`).toBe('text');
      else expect(next.t, `surah ${s}`).toBe('basmala');
    }
  });

  it('draws the basmala with al-Fatihah’s own glyphs from page 1', () => {
    const first = pages[0].lines[1];
    expect(first.t).toBe('text');
    if (first.t === 'text')
      expect(first.w.slice(0, 4).map(([code]) => code)).toEqual(BASMALA_GLYPHS);
  });

  it('knows where each surah and juz begins', () => {
    expect(surahs).toHaveLength(114);
    expect(surahs[1]).toMatchObject({ name: 'البقرة', page: 2, ayat: 286 });
    expect(surahs[17].page).toBe(293);
    expect(surahs[113].page).toBe(604);
    expect(surahOfPage(24).name).toBe('البقرة');
    expect(juzOfPage(604)).toBe(30);
  });

  it('marks the fifteen prostrations of recitation', () => {
    const sajdah = pages.flatMap((p) => p.sajdah ?? []);
    expect(sajdah).toHaveLength(15);
    expect(sajdah).toContain('7:206');
    expect(sajdah).toContain('96:19');
  });

  it('names hizb quarters as the margin does', () => {
    expect(rubLabel(1)).toBe('الحزب ١');
    expect(rubLabel(2)).toBe('ربع الحزب ١');
    expect(rubLabel(7)).toBe('نصف الحزب ٢');
    expect(rubLabel(240)).toBe('ثلاثة أرباع الحزب ٦٠');
  });
});

describe('the index, checked against the pages', () => {
  it('numbers every ayah through the Mushaf, both ways', () => {
    expect(order).toHaveLength(AYAH_COUNT);
    order.forEach((key, i) => {
      expect(ayahOfKey(key), key).toBe(i + 1);
      expect(verseKey(i + 1)).toBe(key);
    });
    expect(ayahIndex(2, 255)).toBe(262);
    expect(verseOf(262)).toEqual({ surah: 2, ayah: 255 });
    expect(verseOf(1)).toEqual({ surah: 1, ayah: 1 });
    expect(verseOf(AYAH_COUNT)).toEqual({ surah: 114, ayah: 6 });
  });

  it('knows the first ayah of every page, and the page of every ayah', () => {
    for (const p of pages) {
      const keys = keysOf(p);
      expect(firstAyahOfPage(p.page), `page ${p.page}`).toBe(
        ayahOfKey(keys[0]),
      );
      const { from, to } = ayatOfPage(p.page);
      expect(order.slice(from - 1, to - 1)).toEqual(keys);
      for (const key of keys) expect(pageOfAyah(ayahOfKey(key))).toBe(p.page);
    }
    // The page after the last begins just past the end, so the last page
    // is a stretch like any other.
    expect(firstAyahOfPage(PAGE_COUNT + 1)).toBe(AYAH_COUNT + 1);
    expect(ayatOfPage(PAGE_COUNT)).toEqual({ from: 6222, to: 6237 });
  });

  it('gives each surah its ayat', () => {
    for (const s of surahs) {
      const { from, to } = surahRange(s.n);
      expect(to - from, s.name).toBe(s.ayat);
      expect(order[from - 1]).toBe(`${s.n}:1`);
      expect(surahOfAyah(from)).toBe(s.n);
      expect(surahOfAyah(to - 1)).toBe(s.n);
      // The header is on the page of the first ayah, or at the foot of the
      // page before it, where a surah begins on a new page.
      expect(pageOfAyah(from) - s.page, s.name).toBeOneOf([0, 1]);
    }
    expect(surahRange(1)).toEqual({ from: 1, to: 8 });
    expect(surahRange(114)).toEqual({ from: 6231, to: 6237 });
  });

  it('begins the hizb quarters where the print does', () => {
    /* The print sets ۞ at the head of a quarter. The pages' readable text
       is cut into ayat by the end-of-ayah marks, ﴿٧﴾, so the n-th piece is
       ayah n, and a ۞ in it marks that ayah. */
    const text = pages
      .flatMap((p) => p.lines.flatMap((l) => (l.t === 'text' ? [l.x] : [])))
      .join(' ');
    const pieces = text.split(/﴿[^﴾]+﴾/).slice(0, -1);
    expect(pieces).toHaveLength(AYAH_COUNT);
    const marked = pieces.flatMap((t, i) => (t.includes('۞') ? [i + 1] : []));
    const quarters = Array.from({ length: RUB_COUNT }, (_, i) =>
      rubStart(i + 1),
    );
    expect(quarters).toEqual([...quarters].sort((a, b) => a - b));
    expect(marked).toHaveLength(199);
    expect(marked.every((a) => quarters.includes(a))).toBe(true);
    // The other 41 open a surah, where the header stands instead of a ۞.
    const opening = quarters.filter((a) => !marked.includes(a));
    expect(opening).toHaveLength(41);
    for (const a of opening) expect(verseOf(a).ayah, verseKey(a)).toBe(1);
    expect(rubStart(RUB_COUNT + 1)).toBe(AYAH_COUNT + 1);
    for (let n = 1; n <= RUB_COUNT; n++) {
      expect(rubOfAyah(rubStart(n))).toBe(n);
      expect(rubOfAyah(rubStart(n + 1) - 1)).toBe(n);
      expect(rubRange(n)).toEqual({ from: rubStart(n), to: rubStart(n + 1) });
    }
  });

  it('agrees with every page on its surah, juz and quarters', () => {
    for (const p of pages) {
      const ayat = keysOf(p).map(ayahOfKey);
      expect(surahOfPage(p.page).n, `page ${p.page}`).toBe(p.surahs[0]);
      expect(juzOfPage(p.page), `page ${p.page}`).toBe(p.juz);
      expect(rubOfPage(p.page), `page ${p.page}`).toBe(p.rubs[0]);
      expect([...new Set(ayat.map(rubOfAyah))]).toEqual(p.rubs);
      expect([...new Set(ayat.map(surahOfAyah))]).toEqual(p.surahs);
    }
  });

  it('starts every juz on a hizb, eight quarters apart', () => {
    for (let j = 1; j <= 30; j++) {
      expect(juzRange(j).from).toBe(rubStart(8 * (j - 1) + 1));
      expect(juzOfAyah(juzRange(j).from)).toBe(j);
    }
    expect(juzRange(30).to).toBe(AYAH_COUNT + 1);
    expect(verseKey(juzRange(4).from)).toBe('3:93');
  });

  it('finds the pages a stretch of ayat is read on', () => {
    expect(pagesOfRange(surahRange(1))).toEqual([1]);
    expect(pagesOfRange({ from: 6, to: 10 })).toEqual([1, 2]);
    expect(pagesOfRange(juzRange(30))).toHaveLength(23);
    expect(pagesOfRange({ from: 9, to: 9 })).toEqual([]);
  });
});

describe('loading a page', () => {
  it('fetches each page once, sharing a request still on its way', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const first = loadPage(77);
    expect(loadPage(77)).toBe(first);
    const page = await first;
    expect(page.page).toBe(77);
    expect(loadedPage(77)).toBe(page);
    expect(loadPage(77)).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    // The address is the site's base followed by the page's own file.
    expect(fetch.mock.calls[0][0]).toBe(
      `${import.meta.env.BASE_URL}pages/77.json`,
    );
    fetch.mockRestore();
  });

  it('forgets a failed load, so the next attempt tries again', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('offline'));
    await expect(loadPage(78)).rejects.toThrow('offline');
    expect(loadedPage(78)).toBeUndefined();
    expect((await loadPage(78)).page).toBe(78);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockRestore();
  });

  it('refuses an answer that is not the page', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(loadPage(79)).rejects.toThrow('page 79: 404');
    fetch.mockRestore();
  });
});
