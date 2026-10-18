import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { BASMALA_GLYPHS } from '@/mushaf/MushafPage';
import {
  juzOfPage,
  juzStarts,
  loadedPage,
  loadPage,
  PAGE_COUNT,
  rubLabel,
  surahOfPage,
  surahs,
  type Page,
} from './mushaf';

// The pages are served from public/, so they are read here as the files
// they are, exactly as the browser will fetch them. (A path, not a URL:
// jsdom's URL is not one Node's file functions accept.)
const dir = join(import.meta.dirname, '../../public/pages');
const files = readdirSync(dir);
const pages: Page[] = Array.from(
  { length: PAGE_COUNT },
  (_, i) =>
    JSON.parse(readFileSync(join(dir, `${i + 1}.json`), 'utf8')) as Page,
);

describe('the Mushaf', () => {
  it('has exactly 604 pages', () => {
    expect(files).toHaveLength(PAGE_COUNT);
    expect(pages.map((p) => p.page)).toEqual(
      Array.from({ length: PAGE_COUNT }, (_, i) => i + 1),
    );
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
    expect(juzStarts[0]).toBe(1);
    expect(juzStarts[29]).toBe(582);
    expect(juzStarts).toEqual([...juzStarts].sort((a, b) => a - b));
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
