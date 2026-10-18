import { describe, expect, it } from 'vitest';
import {
  AYAH_COUNT,
  ayahIndex,
  firstAyahOfPage,
  surahRange,
} from '@/data/mushaf';
import {
  endsRound,
  isBeforeStart,
  pagesOf,
  rangeOf,
  readerOf,
  round,
  unitAfter,
  unitOf,
  unitsOf,
  unitStart,
  type Plan,
  type Unit,
} from './schedule';

const start = { turn: 0, at: 20 };

describe('continue mode', () => {
  const plan: Plan = { readers: 3, mode: 'continue', unit: 'page', size: 1 };

  it('gives every turn the page after the last, round the circle', () => {
    const turns = [0, 1, 2, 3, 4, 5].map((t) => [
      readerOf(plan, t),
      pagesOf(plan, start, t),
    ]);
    expect(turns).toEqual([
      [0, [20]],
      [1, [21]],
      [2, [22]],
      [0, [23]],
      [1, [24]],
      [2, [25]],
    ]);
  });

  it('reads several pages a turn', () => {
    const two = { ...plan, size: 2 };
    expect([0, 1, 2].map((t) => pagesOf(two, start, t))).toEqual([
      [20, 21],
      [22, 23],
      [24, 25],
    ]);
  });

  it('cuts the last turn short at page 604, and knows when it is over', () => {
    const three = { ...plan, size: 3 };
    const end = { turn: 0, at: 602 };
    expect(pagesOf(three, end, 0)).toEqual([602, 603, 604]);
    expect(pagesOf(three, end, 1)).toEqual([]);
    expect(rangeOf(three, end, 1)).toEqual({
      from: AYAH_COUNT + 1,
      to: AYAH_COUNT + 1,
    });
    const near = { turn: 0, at: 603 };
    expect(pagesOf(three, near, 0)).toEqual([603, 604]);
  });

  it('cannot step back before page 1', () => {
    expect(isBeforeStart(plan, { turn: 1, at: 1 }, 0)).toBe(true);
    expect(isBeforeStart(plan, { turn: 1, at: 2 }, 0)).toBe(false);
  });

  it('cuts a turn that begins before page 1 to the pages there are', () => {
    const three = { ...plan, size: 3 };
    const anchor = { turn: 1, at: 2 };
    expect(isBeforeStart(three, anchor, 0)).toBe(false);
    expect(pagesOf(three, anchor, 0)).toEqual([1]);
  });
});

describe('repeat mode', () => {
  const plan: Plan = { readers: 3, mode: 'repeat', unit: 'page', size: 1 };

  it('has everyone read the same page before moving on', () => {
    const turns = [0, 1, 2, 3, 4, 5].map((t) => [
      readerOf(plan, t),
      pagesOf(plan, start, t)[0],
    ]);
    expect(turns).toEqual([
      [0, 20],
      [1, 20],
      [2, 20],
      [0, 21],
      [1, 21],
      [2, 21],
    ]);
  });

  it('ends a round on the last reader', () => {
    expect([0, 1, 2, 3].map((t) => endsRound(plan, t))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });

  it('marks who has read in this round', () => {
    expect(round(plan, start, 1).map((s) => s.state)).toEqual([
      'done',
      'now',
      'waiting',
    ]);
  });

  it('does not tick a reader who read before the halaqa jumped here', () => {
    const jumped = { turn: 1, at: 50 };
    expect(round(plan, jumped, 1).map((s) => s.state)).toEqual([
      'skipped',
      'now',
      'waiting',
    ]);
    expect(pagesOf(plan, jumped, 3)).toEqual([51]);
  });
});

it('wraps a single reader back to themself', () => {
  const plan: Plan = { readers: 1, mode: 'continue', unit: 'page', size: 1 };
  expect([0, 1, 2].map((t) => readerOf(plan, t))).toEqual([0, 0, 0]);
  expect(pagesOf(plan, start, 2)).toEqual([22]);
});

describe('units', () => {
  it('numbers each unit and finds the one an ayah is in', () => {
    const cases: [Unit, number, number][] = [
      ['page', 3, 13],
      ['ayah', 262, 262],
      ['rub', 2, 33],
      ['surah', 3, 294],
    ];
    for (const [unit, n, first] of cases) {
      expect(unitStart(unit, n), unit).toBe(first);
      expect(unitOf(unit, first), unit).toBe(n);
      expect(unitOf(unit, first - 1), unit).toBe(n - 1);
    }
    // One past the last unit begins at the end of the Mushaf, and the end
    // is in no unit but the one past the last.
    expect(unitStart('page', 605)).toBe(AYAH_COUNT + 1);
    expect(unitOf('rub', AYAH_COUNT + 1)).toBe(241);
    expect(unitOf('surah', AYAH_COUNT)).toBe(114);
    expect(unitAfter('page', 14)).toBe(4);
    expect(unitAfter('page', 13)).toBe(3);
  });

  describe('ayat', () => {
    const plan: Plan = { readers: 2, mode: 'continue', unit: 'ayah', size: 3 };
    const baqarah = { turn: 0, at: ayahIndex(2, 1) };

    it('reads a few ayat a turn, onto the next page when they run on', () => {
      expect(rangeOf(plan, baqarah, 0)).toEqual({ from: 8, to: 11 });
      expect(pagesOf(plan, baqarah, 0)).toEqual([2]);
      // Al-Baqarah 4 to 6: page 2 ends on 5, so the turn has two pages.
      expect(rangeOf(plan, baqarah, 1)).toEqual({ from: 11, to: 14 });
      expect(pagesOf(plan, baqarah, 1)).toEqual([2, 3]);
      expect(unitsOf(plan, baqarah, 1)).toEqual({ from: 11, to: 14 });
    });

    it('carries on across the end of a surah, since ayat are counted through', () => {
      const fatihah = { turn: 0, at: 6 };
      expect(rangeOf(plan, fatihah, 0)).toEqual({ from: 6, to: 9 });
      expect(pagesOf(plan, fatihah, 0)).toEqual([1, 2]);
    });

    it('cuts the last turn at an-Nas 6', () => {
      const end = { turn: 0, at: AYAH_COUNT - 1 };
      expect(rangeOf(plan, end, 0)).toEqual({
        from: AYAH_COUNT - 1,
        to: AYAH_COUNT + 1,
      });
      expect(pagesOf(plan, end, 1)).toEqual([]);
    });

    it('repeats the same ayat round the circle', () => {
      const repeat = { ...plan, mode: 'repeat' as const };
      expect([0, 1, 2].map((t) => rangeOf(repeat, baqarah, t))).toEqual([
        { from: 8, to: 11 },
        { from: 8, to: 11 },
        { from: 11, to: 14 },
      ]);
    });

    it('cannot step back before al-Fatihah 1', () => {
      expect(isBeforeStart(plan, { turn: 1, at: 1 }, 0)).toBe(true);
      expect(rangeOf(plan, { turn: 1, at: 1 }, 0)).toEqual({ from: 1, to: 1 });
      // A turn that would begin before al-Fatihah 1 keeps the ayat there are.
      expect(isBeforeStart(plan, { turn: 1, at: 2 }, 0)).toBe(false);
      expect(rangeOf(plan, { turn: 1, at: 2 }, 0)).toEqual({ from: 1, to: 2 });
    });
  });

  it('reads a hizb quarter a turn, over the pages it spans', () => {
    const plan: Plan = { readers: 2, mode: 'continue', unit: 'rub', size: 1 };
    const first = { turn: 0, at: 1 };
    expect(rangeOf(plan, first, 0)).toEqual({ from: 1, to: 33 });
    expect(pagesOf(plan, first, 0)).toEqual([1, 2, 3, 4, 5]);
    // The second quarter begins on page 5, where the first ends.
    expect(pagesOf(plan, first, 1)[0]).toBe(5);
    expect(pagesOf(plan, { turn: 0, at: 240 }, 1)).toEqual([]);
  });

  it('reads a surah a turn', () => {
    const plan: Plan = { readers: 2, mode: 'continue', unit: 'surah', size: 1 };
    const mulk = { turn: 0, at: 67 };
    expect(rangeOf(plan, mulk, 0)).toEqual(surahRange(67));
    expect(pagesOf(plan, mulk, 0)).toEqual([562, 563, 564]);
    expect(rangeOf(plan, mulk, 1)).toEqual(surahRange(68));
    expect(pagesOf(plan, { turn: 0, at: 114 }, 1)).toEqual([]);
  });

  describe('cut at an end the sitting set itself', () => {
    // The end of al-Isra, part-way down page 293, where al-Kahf begins.
    const end = surahRange(17).to;

    it('cuts a turn of pages inside its last page', () => {
      const plan: Plan = {
        readers: 1,
        mode: 'continue',
        unit: 'page',
        size: 2,
      };
      const anchor = { turn: 0, at: 292 };
      expect(rangeOf(plan, anchor, 0, end)).toEqual({
        from: firstAyahOfPage(292),
        to: end,
      });
      expect(pagesOf(plan, anchor, 0, end)).toEqual([292, 293]);
      expect(unitsOf(plan, anchor, 0, end)).toEqual({ from: 292, to: 294 });
      // The next turn begins past the end: nothing is left before it.
      expect(pagesOf(plan, anchor, 1, end)).toEqual([]);
    });

    it('cuts a turn of ayat at the ayah', () => {
      const plan: Plan = {
        readers: 2,
        mode: 'continue',
        unit: 'ayah',
        size: 5,
      };
      const anchor = { turn: 0, at: end - 3 };
      expect(rangeOf(plan, anchor, 0, end)).toEqual({ from: end - 3, to: end });
      expect(rangeOf(plan, anchor, 1, end)).toEqual({ from: end, to: end });
    });

    it('cuts a quarter that runs past it', () => {
      const plan: Plan = { readers: 2, mode: 'continue', unit: 'rub', size: 1 };
      const anchor = { turn: 0, at: unitOf('rub', end - 1) };
      const range = rangeOf(plan, anchor, 0, end);
      expect(range.to).toBe(end);
      expect(range.from).toBe(unitStart('rub', anchor.at));
    });
  });
});
