import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ayahIndex,
  ayatOfPage,
  PAGE_COUNT,
  pageOfAyah,
  verseKey,
} from '@/data/mushaf';
import { reciters } from '@/data/reciters';
import {
  ayahTimes,
  ayatDuration,
  pageDuration,
  pagesDuration,
  pageTimed,
  recitationOf,
  type Timings,
} from '@/data/timings';
import { rangeRecitation, rangeTimed, turnDuration } from './turnAudio';

const read = (id: string) =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, `../data/timings/${id}.json`),
      'utf8',
    ),
  ) as Timings;

const minshawi = read('minshawi');
/** Al-Kahf `a` to `b`, as a half-open range. */
const kahf = (a: number, b: number) => ({
  from: ayahIndex(18, a),
  to: ayahIndex(18, b) + 1,
});
const span = (t: Timings, s: number, a: number) => ayahTimes(t, s)[a - 1];

describe('a turn of pages', () => {
  it('plays its pages as they always played', () => {
    const range = { from: ayatOfPage(293).from, to: ayatOfPage(294).to };
    expect(rangeRecitation(minshawi, range)).toEqual(
      recitationOf(minshawi, [293, 294]),
    );
    expect(turnDuration(minshawi, 'page', range)).toBe(
      pagesDuration(minshawi, [293, 294]),
    );
  });

  it('takes as long as its ayat, for every reciter on every page', () => {
    // The two ways of timing a turn must agree, or a turn of a page and a
    // turn of that page's ayat would be given different times.
    for (const { id } of reciters) {
      const t = read(id);
      for (let page = 1; page <= PAGE_COUNT; page++) {
        if (!pageTimed(t, page)) continue;
        const { from, to } = ayatOfPage(page);
        expect(
          ayatDuration(t, verseKey(from), verseKey(to - 1)),
          `${id} ${page}`,
        ).toBe(pageDuration(t, page));
      }
    }
  });
});

describe('a turn of ayat', () => {
  it('plays exactly its ayat, and names the page it recites', () => {
    const range = kahf(5, 9);
    const page = pageOfAyah(range.from);
    expect(rangeRecitation(minshawi, range)).toEqual([
      {
        url: expect.stringMatching(/18\.mp3$/),
        from: span(minshawi, 18, 5)[0],
        to: span(minshawi, 18, 9)[1],
        page,
      },
    ]);
    expect(turnDuration(minshawi, 'ayah', range)).toBe(
      span(minshawi, 18, 9)[1] - span(minshawi, 18, 5)[0],
    );
  });

  it('turns the page with the recitation when its ayat run onto the next', () => {
    // Al-Kahf 15 ends page 294 and 16 begins page 295.
    expect(pageOfAyah(ayahIndex(18, 15)) + 1).toBe(
      pageOfAyah(ayahIndex(18, 16)),
    );
    const queue = rangeRecitation(minshawi, kahf(14, 17));
    expect(queue.map((s) => s.page)).toEqual([294, 295]);
    expect(queue[0]).toMatchObject({
      from: span(minshawi, 18, 14)[0],
      to: span(minshawi, 18, 15)[1],
    });
    expect(queue[1]).toMatchObject({
      from: span(minshawi, 18, 16)[0],
      to: span(minshawi, 18, 17)[1],
    });
    expect(queue[0].url).toBe(queue[1].url);
  });

  it('moves from one surah’s file to the next', () => {
    const range = { from: ayahIndex(1, 7), to: ayahIndex(2, 2) + 1 };
    const queue = rangeRecitation(minshawi, range);
    expect(queue.map((s) => [s.url.match(/(\d+)\.mp3$/)?.[1], s.page])).toEqual(
      [
        ['1', 1],
        ['2', 2],
      ],
    );
  });

  it('plays nothing it is not timed on, and gives a reader the pages', () => {
    const t = { ...minshawi, untimed: [18] };
    const range = kahf(5, 9);
    expect(rangeTimed(t, range)).toBe(false);
    expect(rangeRecitation(t, range)).toEqual([]);
    expect(turnDuration(t, 'ayah', range)).toBe(
      pagesDuration(t, [pageOfAyah(range.from)]),
    );
    expect(rangeTimed(minshawi, range)).toBe(true);
  });

  it('plays the ayat around one misplaced in a file that fits', () => {
    // Only the turn holding it, and the page it is on, are left unplayed.
    const t = { ...minshawi, misplaced: [ayahIndex(18, 7)] };
    expect(rangeTimed(t, kahf(5, 9))).toBe(false);
    expect(rangeRecitation(t, kahf(5, 9))).toEqual([]);
    expect(rangeTimed(t, kahf(8, 9))).toBe(true);
    expect(rangeRecitation(t, kahf(8, 9))).toHaveLength(1);
    expect(rangeTimed(t, ayatOfPage(295))).toBe(true);
    expect(rangeTimed(t, ayatOfPage(294))).toBe(false);
  });

  it('is nothing for a turn with nothing left', () => {
    expect(rangeRecitation(minshawi, { from: 9, to: 9 })).toEqual([]);
    expect(turnDuration(minshawi, 'ayah', { from: 9, to: 9 })).toBe(0);
  });
});
