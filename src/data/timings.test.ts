import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_COUNT, surahs, type Page } from './mushaf';
import { paceLabel, reciters } from './reciters';
import { decodeSpans, encodeSpans, surahFile, type Span } from './audio';
import {
  ayahAt,
  ayahOf,
  ayahTimes,
  ayatDuration,
  ayatRecitation,
  averagePage,
  pageDuration,
  pagesDuration,
  surahAudioUrl,
  type Timings,
} from './timings';

const timings = import.meta.glob<Timings>('./timings/*.json', {
  eager: true,
  import: 'default',
});
const load = (id: string) => timings[`./timings/${id}.json`];

/* The pages are read from disk rather than imported, from whichever of the
   two places they are kept in (they are moving to public/), as the build
   script reads them. */
const read = <T>(...path: string[]) =>
  JSON.parse(readFileSync(join(process.cwd(), ...path), 'utf8')) as T;
const pagesDir = ['src/data/pages', 'public/pages'].find((dir) =>
  existsSync(join(process.cwd(), dir, '1.json')),
)!;
const pages = Array.from({ length: PAGE_COUNT }, (_, i) =>
  read<Page>(pagesDir, `${i + 1}.json`),
);
const page = (n: number) => pages[n - 1];

/** The verse key of every word on a page, end-of-ayah markers included. */
const keysOf = (p: Page) =>
  p.lines.flatMap((l) => (l.t === 'text' ? l.w.map(([, key]) => key) : []));
/** The ayat on each page, in order. */
const ayatOfPage = pages.map((p) => [...new Set(keysOf(p))]);

describe.each(reciters.map((r) => [r.id, r]))('%s', (id, reciter) => {
  const t = load(id);

  it('is listed at the pace his recording actually has', () => {
    expect(reciter.secondsPerPage).toBeCloseTo(averagePage(t) / 1000, -0.5);
  });

  it('times every page', () => {
    expect(t.pages).toHaveLength(PAGE_COUNT);
    for (let p = 1; p <= PAGE_COUNT; p++) {
      const ms = pageDuration(t, p);
      // The shortest page is the opening of al-Baqarah, the longest a full
      // page read at a teaching pace; anything outside this is a bad cut.
      expect(ms, `page ${p}`).toBeGreaterThan(15_000);
      expect(ms, `page ${p}`).toBeLessThan(8 * 60_000);
    }
  });

  it('plays the surahs actually on each page', () => {
    for (const p of [1, 2, 50, 293, 534, 604])
      expect(t.pages[p - 1].map(([s]) => s)).toEqual(page(p).surahs);
  });

  it('has a believable average page', () => {
    const avg = averagePage(t);
    expect(avg).toBeGreaterThan(60_000);
    expect(avg).toBeLessThan(6 * 60_000);
  });

  it('plays from an https address with the surah in it', () => {
    expect(t.audio).toMatch(/^https:\/\/.+\/\{(n|nnn)\}\.mp3$/);
  });

  it('times every ayah of every surah, each no earlier than the last', () => {
    expect(t.ayat).toHaveLength(114);
    for (const s of surahs) {
      const spans = ayahTimes(t, s.n);
      expect(spans, `surah ${s.n}`).toHaveLength(s.ayat);
      spans.forEach(([from, to], i) => {
        const key = `${s.n}:${i + 1}`;
        expect(Number.isInteger(from) && Number.isInteger(to), key).toBe(true);
        expect(to, key).toBeGreaterThan(from);
        if (i === 0) return;
        expect(from, key).toBeGreaterThanOrEqual(spans[i - 1][0]);
        expect(to, key).toBeGreaterThanOrEqual(spans[i - 1][1]);
      });
    }
  });

  it('times each page from its first ayah to its last', () => {
    // A page holding the end of one surah and the start of the next has a
    // stretch of each surah's file, as its ayat do.
    for (let p = 1; p <= PAGE_COUNT; p++) {
      const ayat = ayatOfPage[p - 1];
      const run = ayatRecitation(t, ayat[0], ayat[ayat.length - 1]);
      expect(
        run.map((s) => [s.surah, s.from, s.to]),
        `page ${p}`,
      ).toEqual(t.pages[p - 1]);
      expect(ayatDuration(t, ayat[0], ayat[ayat.length - 1])).toBe(
        pagesDuration(t, [p]),
      );
    }
  });
});

it('starts no page before the last one ends, but where the source does', () => {
  // The player plays on from one page to the next when the next starts
  // before the last one ended, rather than seek back and repeat it. These
  // are the places it does so by more than a few milliseconds.
  const early: [string, number, number][] = [];
  for (const r of reciters) {
    const t = load(r.id);
    for (let p = 2; p <= PAGE_COUNT; p++) {
      const last = t.pages[p - 2][t.pages[p - 2].length - 1];
      const [surah, from] = t.pages[p - 1][0];
      if (surah === last[0] && last[2] - from > 10)
        early.push([r.id, p, last[2] - from]);
    }
  }
  expect(early).toEqual([['alafasy', 551, 5570]]);
});

it('names a surah file by the bare number or by three digits', () => {
  expect(surahFile('https://host/a/{n}.mp3', 68)).toBe('https://host/a/68.mp3');
  expect(surahFile('https://host/a/{nnn}.mp3', 1)).toBe(
    'https://host/a/001.mp3',
  );
  expect(surahFile('https://host/a/{nnn}.mp3', 68)).toBe(
    'https://host/a/068.mp3',
  );
  expect(surahFile('https://host/a/{nnn}.mp3', 114)).toBe(
    'https://host/a/114.mp3',
  );
});

it('plays al-Shuraim and al-Dosari from their three-digit files', () => {
  // Quran.com names these two reciters' files 001.mp3 to 114.mp3. Built as
  // 1.mp3, every surah before 100 was missing (and al-Fatiha's sample).
  for (const id of ['shuraim', 'dosari'])
    expect(surahAudioUrl(load(id), 68)).toMatch(/\/068\.mp3$/);
  expect(surahAudioUrl(load('husary'), 68)).toMatch(/\/68\.mp3$/);
});

it('lists the reciters from the most deliberate to the swiftest', () => {
  const paces = reciters.map((r) => r.secondsPerPage);
  expect(paces).toEqual([...paces].sort((a, b) => b - a));
});

it('bands the paces the way a halaqa speaks of them', () => {
  expect(paceLabel(284)).toBe('متأنٍّ جدًّا');
  expect(paceLabel(183)).toBe('متأنٍّ');
  expect(paceLabel(151)).toBe('معتدل');
  expect(paceLabel(108)).toBe('سريع');
});

describe('ayah times', () => {
  it('keeps them as gaps and lengths, which may overlap', () => {
    const spans: Span[] = [
      [0, 5220],
      [5220, 11570],
      [11560, 16140], // starts 10ms before the last one ends
      [16500, 20000], // a pause before it
    ];
    const deltas = encodeSpans(spans);
    expect(deltas).toEqual([0, 5220, 0, 6350, -10, 4580, 360, 3500]);
    expect(decodeSpans(deltas)).toEqual(spans);
    expect(decodeSpans([])).toEqual([]);
  });

  /* Two short surahs and the opening of a third, in the shape of a
     timings file: surah 1 has two ayat with a pause between them, surah 2
     three ayat of which the third starts 10ms early. */
  const fake = {
    audio: 'https://host/r/{n}.mp3',
    pages: [],
    ayat: [
      encodeSpans([
        [500, 2000],
        [2500, 4000],
      ]),
      encodeSpans([
        [0, 1000],
        [1000, 3000],
        [2990, 6000],
      ]),
      encodeSpans([[100, 900]]),
    ],
  } satisfies Timings;

  it('names an ayah by its verse key or by surah and ayah', () => {
    expect(ayahOf('2:255')).toEqual([2, 255]);
    expect(ayahOf([2, 255])).toEqual([2, 255]);
    for (const bad of [
      '',
      '2',
      '2:',
      ':5',
      '2:5:1',
      '0:1',
      '115:1',
      '2:0',
      'a:b',
    ])
      expect(() => ayahOf(bad), bad).toThrow(RangeError);
    expect(() => ayahOf([1.5, 1])).toThrow(RangeError);
  });

  it('plays one ayah, or a run of them, from its own surah file', () => {
    expect(ayatRecitation(fake, '2:2')).toEqual([
      {
        url: 'https://host/r/2.mp3',
        surah: 2,
        first: 2,
        last: 2,
        from: 1000,
        to: 3000,
      },
    ]);
    expect(ayatRecitation(fake, [2, 1], [2, 3])).toEqual([
      expect.objectContaining({
        surah: 2,
        first: 1,
        last: 3,
        from: 0,
        to: 6000,
      }),
    ]);
  });

  it('plays a run crossing surahs as a stretch of each file', () => {
    expect(
      ayatRecitation(fake, '1:2', '3:1').map((s) => [
        s.url,
        s.first,
        s.last,
        s.from,
        s.to,
      ]),
    ).toEqual([
      ['https://host/r/1.mp3', 2, 2, 2500, 4000],
      ['https://host/r/2.mp3', 1, 3, 0, 6000],
      ['https://host/r/3.mp3', 1, 1, 100, 900],
    ]);
    expect(ayatDuration(fake, '1:2', '3:1')).toBe(1500 + 6000 + 800);
  });

  it('times a run of ayat by exactly those ayat', () => {
    expect(ayatDuration(fake, '1:1')).toBe(1500);
    // The pause between them counts: the reciter takes it too.
    expect(ayatDuration(fake, '1:1', '1:2')).toBe(3500);
    expect(ayatDuration(fake, '2:2', '2:1')).toBe(0);
    expect(ayatRecitation(fake, '3:1', '1:1')).toEqual([]);
  });

  it('refuses an ayah the surah does not have', () => {
    expect(() => ayatRecitation(fake, '1:3')).toThrow(RangeError);
    expect(() => ayatRecitation(fake, '1:1', '4:1')).toThrow(RangeError);
  });

  it('finds the ayah being recited at a moment of the file', () => {
    expect(ayahAt(fake, 1, 0)).toBeNull();
    expect(ayahAt(fake, 1, 499)).toBeNull();
    expect(ayahAt(fake, 1, 500)).toBe(1);
    expect(ayahAt(fake, 1, 1999)).toBe(1);
    expect(ayahAt(fake, 1, 2000)).toBeNull(); // the pause
    expect(ayahAt(fake, 1, 2500)).toBe(2);
    expect(ayahAt(fake, 1, 4000)).toBeNull();
    expect(ayahAt(fake, 2, 1000)).toBe(2);
    // Where two overlap, the one just begun is the one recited.
    expect(ayahAt(fake, 2, 2995)).toBe(3);
    expect(ayahAt(fake, 4, 0)).toBeNull();
  });

  it('finds every ayah of a real recording at its own start and middle', () => {
    const t = load('husary');
    for (const s of [1, 2, 18, 114]) {
      ayahTimes(t, s).forEach(([from, to], i) => {
        expect(ayahAt(t, s, from)).toBe(i + 1);
        expect(ayahAt(t, s, Math.floor((from + to) / 2))).toBe(i + 1);
      });
    }
    expect(ayahAt(t, 1, 0)).toBe(1);
  });
});
