import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ayahIndex, PAGE_COUNT, surahs, verseKey, type Page } from './mushaf';
import { paceLabel, reciters } from './reciters';
import {
  cleanSegments,
  coversAll,
  decodeAyahWords,
  decodeSpans,
  encodeAyahWords,
  encodeSpans,
  endMisfit,
  fileChange,
  LEEWAY_MS,
  misplacedAyat,
  stampOf,
  surahFile,
  type AyahCheck,
  type FileRecord,
  type Span,
  type WordsFile,
} from './audio';
import {
  ayahAt,
  ayahOf,
  ayahTimed,
  ayahTimes,
  ayatDuration,
  ayatRecitation,
  ayatTimed,
  averagePage,
  isTimed,
  loadWords,
  pageDuration,
  pagesDuration,
  pageStretches,
  pageTimed,
  readWords,
  recitationOf,
  surahAudioUrl,
  wordAt,
  wordsCovered,
  type Timings,
} from './timings';

const timings = import.meta.glob<Timings>('./timings/*.json', {
  eager: true,
  import: 'default',
});
const load = (id: string) => timings[`./timings/${id}.json`];

/* The pages are read from disk, where the app serves them from, as the
   build script reads them. */
const read = <T>(...path: string[]) =>
  JSON.parse(readFileSync(join(process.cwd(), ...path), 'utf8')) as T;
const pages = Array.from({ length: PAGE_COUNT }, (_, i) =>
  read<Page>('public/pages', `${i + 1}.json`),
);
const page = (n: number) => pages[n - 1];

/** The verse key of every word on a page, end-of-ayah markers included. */
const keysOf = (p: Page) =>
  p.lines.flatMap((l) => (l.t === 'text' ? l.w.map(([, key]) => key) : []));
/** The ayat on each page, in order. */
const ayatOfPage = pages.map((p) => [...new Set(keysOf(p))]);
/** How many words the print gives each ayah: its entries on the page, less
    its end-of-ayah marker. */
const wordCount = new Map<string, number>();
for (const p of pages)
  for (const key of keysOf(p))
    wordCount.set(key, (wordCount.get(key) ?? 0) + 1);
for (const [key, n] of wordCount) wordCount.set(key, n - 1);

/** A reciter's median milliseconds per word, over his ayat of six words
    or more, as misplacedAyat() measures it. */
const medianPace = (t: Timings) => {
  const paces = surahs
    .flatMap((s) =>
      ayahTimes(t, s.n).map(([from, to], i) => {
        const words = wordCount.get(`${s.n}:${i + 1}`)!;
        return words >= 6 ? (to - from) / words : null;
      }),
    )
    .filter((x) => x !== null)
    .sort((a, b) => a - b);
  return paces[paces.length >> 1];
};

const wordsFile = (id: string, surah: number) =>
  read<WordsFile>('public/words', id, `${surah}.json`);

/* The ayat each reciter's words cover entirely, as built on 2026-10-18.
   A rebuild may raise these; one that lowers them has lost words. */
const fullyTimed: Record<string, number> = {
  'husary-muallim': 6209,
  husary: 6215,
  abdulbasit: 6013,
  alafasy: 5993,
  minshawi: 6190,
  dosari: 6222,
  shatri: 6008,
  rifai: 6170,
  sudais: 6196,
  shuraim: 6177,
};

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
      const ayat = ayatOfPage[p - 1].map((key) => key.split(':').map(Number));
      const bySurah = Map.groupBy(ayat, ([surah]) => surah);
      expect(
        [...bySurah].map(([surah, run]) => [
          surah,
          ayahTimes(t, surah)[run[0][1] - 1][0],
          ayahTimes(t, surah)[run[run.length - 1][1] - 1][1],
        ]),
        `page ${p}`,
      ).toEqual(t.pages[p - 1]);
      // And the same through the helpers, where the page may be played.
      const [first, last] = [ayatOfPage[p - 1][0], ayatOfPage[p - 1].at(-1)!];
      const run = ayatRecitation(t, first, last);
      if (!pageTimed(t, p)) {
        expect(run, `page ${p}`).toEqual([]);
        expect(ayatDuration(t, first, last), `page ${p}`).toBeNull();
        continue;
      }
      expect(run.map((s) => [s.surah, s.from, s.to])).toEqual(t.pages[p - 1]);
      expect(ayatDuration(t, first, last)).toBe(pagesDuration(t, [p]));
    }
  });

  it('records the length, date and duration of every surah file', () => {
    expect(t.files).toHaveLength(114);
    for (const [bytes, modified, ms, apiMs] of t.files) {
      expect(Number.isInteger(bytes) && bytes > 10_000).toBe(true);
      expect(modified).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      // Al-Shuraim's al-Kawthar is the shortest, at 9.2 s.
      expect(Number.isInteger(ms) && ms > 9_000).toBe(true);
      expect(Number.isInteger(apiMs) && apiMs > 9_000).toBe(true);
    }
  });

  it('marks untimed exactly the surahs whose file does not fit them', () => {
    expect(t.untimed).toEqual(
      surahs
        .filter((s) =>
          endMisfit(t.files[s.n - 1], ayahTimes(t, s.n).at(-1)![1]),
        )
        .map((s) => s.n),
    );
  });

  it('marks misplaced only ayat of surahs whose file fits', () => {
    const misplaced = t.misplaced ?? [];
    expect(misplaced).toEqual([...new Set(misplaced)].sort((a, b) => a - b));
    for (const n of misplaced) {
      const [surah] = verseKey(n).split(':').map(Number);
      expect(isTimed(t, surah), verseKey(n)).toBe(true);
    }
    // Each run of them holds the ayah that set it off, timed at under 0.6
    // of his pace, which the pages bear out (that its own words stray too,
    // only the API's segments can tell).
    const median = medianPace(t);
    const runs: number[][] = [];
    for (const n of misplaced)
      if (runs.at(-1)?.at(-1) === n - 1) runs.at(-1)!.push(n);
      else runs.push([n]);
    for (const run of runs) {
      const hurried = run.some((n) => {
        const key = verseKey(n);
        const [surah, ayah] = key.split(':').map(Number);
        const [from, to] = ayahTimes(t, surah)[ayah - 1];
        const words = wordCount.get(key)!;
        return words >= 6 && (to - from) / words < 0.6 * median;
      });
      expect(hurried, run.map(verseKey).join(' ')).toBe(true);
    }
  });

  // Reads every word of the Mushaf: slow when the machine is busy.
  it('times words in order, inside their ayah, and says where it cannot', () => {
    let full = 0;
    for (const s of surahs) {
      const file = wordsFile(id, s.n);
      expect(file.surah).toBe(s.n);
      expect(file.source).toMatch(/^Quran\.com recitation \d+, /);
      const w = readWords(file);
      const spans = ayahTimes(t, s.n);
      expect(w.ayat, `surah ${s.n}`).toHaveLength(s.ayat);
      let heard = -Infinity;
      w.ayat.forEach((a, i) => {
        const key = `${s.n}:${i + 1}`;
        const count = wordCount.get(key)!;
        expect([a.from, a.to], key).toEqual(spans[i]);
        for (const word of a.words) {
          expect(word.from, key).toBeGreaterThanOrEqual(
            Math.max(a.from, heard),
          );
          expect(word.to, key).toBeGreaterThan(word.from);
          expect(word.to, key).toBeLessThanOrEqual(a.to);
          expect(word.word >= 1 && word.word <= count, key).toBe(true);
          heard = word.to;
        }
        const covered = new Set(a.words.map((x) => x.word)).size === count;
        expect(a.full, key).toBe(covered);
        if (covered) full++;
      });
    }
    expect(full).toBeGreaterThanOrEqual(fullyTimed[id]);
  }, 30_000);
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

describe('surah files that do not fit their timings', () => {
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const stretched = (t: Timings, page: number) =>
    t.pages[page - 1].reduce((sum, [, from, to]) => sum + (to - from), 0);

  it('are the ones measured on 2026-10-18', () => {
    expect(
      Object.fromEntries(reciters.map((r) => [r.id, load(r.id).untimed])),
    ).toEqual({
      'husary-muallim': [],
      husary: [52],
      abdulbasit: [2],
      alafasy: [14, 82],
      minshawi: [],
      dosari: [20, 50, 92],
      shatri: [10, 17, 59],
      rifai: [],
      sudais: [3, 4, 5, 28, 29],
      shuraim: [],
    });
  });

  it('leave misplaced, where the file fits, only the ayat around a bad one', () => {
    const misplaced = (id: string) => (load(id).misplaced ?? []).map(verseKey);
    // al-Husary's teaching 3:127, 3:177, 4:9, 4:10, 4:23, 5:64 and 43:32,
    // each with its neighbours and the ayat its words run into.
    expect(misplaced('husary-muallim').join(' ')).toBe(
      '3:126 3:127 3:128 3:176 3:177 3:178 4:8 4:9 4:10 4:11 4:12 ' +
        '4:22 4:23 4:24 4:25 5:63 5:64 5:65 5:66 43:31 43:32 43:33',
    );
    // al-Rifai's 8:61, timed at 21 ms, its words heard into 8:63.
    expect(misplaced('rifai')).toEqual(['8:60', '8:61', '8:62', '8:63']);
    for (const r of reciters)
      if (r.id !== 'husary-muallim' && r.id !== 'rifai')
        expect(misplaced(r.id), r.id).toEqual([]);
  });

  it('cost the teaching recording a few pages, not four surahs', () => {
    const t = load('husary-muallim');
    expect(range(1, PAGE_COUNT).filter((p) => !pageTimed(t, p))).toEqual([
      66, 73, 78, 79, 81, 82, 118, 119, 491,
    ]);
    expect(
      range(1, PAGE_COUNT).filter((p) => !pageTimed(load('rifai'), p)),
    ).toEqual([184, 185]);
    expect(recitationOf(t, [65, 66, 67]).map((s) => s.page)).toEqual([65, 67]);
    expect(pageDuration(t, 66)).toBe(
      Math.max(stretched(t, 66), averagePage(t)),
    );
    expect(pageDuration(t, 67)).toBe(stretched(t, 67));
  });

  it('play no ayah misplaced, nor any run that holds one', () => {
    const t = load('husary-muallim');
    expect(ayahTimed(t, '3:127')).toBe(false);
    expect(ayahTimed(t, '3:126')).toBe(false); // its neighbour
    // On the same page, but its own span is sound.
    expect(ayahTimed(t, '3:125')).toBe(true);
    expect(ayatRecitation(t, '3:125')).toHaveLength(1);
    expect(ayatRecitation(t, '3:120', '3:130')).toEqual([]);
    expect(ayatDuration(t, '3:120', '3:130')).toBeNull();
    expect(ayatRecitation(t, '3:129', '3:130')).toHaveLength(1);
    // By their numbers through the Mushaf, as the halaqa's ranges count.
    expect(ayahIndex(3, 127)).toBe(420);
    expect(ayatTimed(t, 420)).toBe(false);
    expect(ayatTimed(t, 421 + 1, 421 + 5)).toBe(true);
    // Nothing is marked as recited inside one, and its neighbours' times
    // are not trusted either.
    const mid = ([from, to]: Span) => (from + to) / 2;
    expect(ayahAt(t, 3, mid(ayahTimes(t, 3)[126]))).toBeNull();
    expect(ayahAt(t, 3, mid(ayahTimes(t, 3)[127]))).toBeNull();
    expect(ayahAt(t, 3, mid(ayahTimes(t, 3)[124]))).toBe(125);
  });

  it('are never played, page by page', () => {
    // Abdul Basit's al-Baqarah plays 17 minutes longer than the file timed.
    const t = load('abdulbasit');
    expect([isTimed(t, 1), isTimed(t, 2), isTimed(t, 3)]).toEqual([
      true,
      false,
      true,
    ]);
    // Al-Baqarah has pages 2 to 49 to itself, and only those.
    expect(range(1, 50).filter((p) => !pageTimed(t, p))).toEqual(range(2, 49));
    expect(pageStretches(t, 2)).toEqual([]);
    expect(recitationOf(t, [1, 2, 49, 50]).map((s) => s.page)).toEqual([1, 50]);
  });

  it('take with them a page they share with a surah that is timed', () => {
    // Al-Dosari's al-Layl ends on the page where ad-Duha begins.
    const t = load('dosari');
    const shared = pages.filter(
      (p) => p.surahs.includes(92) && p.surahs.length > 1,
    );
    expect(shared.length).toBeGreaterThan(0);
    for (const { page: p, surahs: on } of shared) {
      expect(on.some((s) => isTimed(t, s))).toBe(true);
      expect(pageTimed(t, p)).toBe(false);
      expect(recitationOf(t, [p])).toEqual([]);
    }
  });

  it('time a reader by the average page where their own falls short', () => {
    const t = load('abdulbasit');
    // Page 9's ayat (2:58 to 2:61) are timed at about ten seconds each, a
    // quarter of what the page takes; a reader's clock is not cut to it.
    expect(stretched(t, 9)).toBeLessThan(averagePage(t) / 2);
    expect(pageDuration(t, 9)).toBe(averagePage(t));
    // Where an untimed page's own stretches are longer, they stand.
    const long = range(2, 49).find((p) => stretched(t, p) > averagePage(t))!;
    expect(pageDuration(t, long)).toBe(stretched(t, long));
    // A timed page keeps its own, short or long.
    expect(pageDuration(t, 50)).toBe(stretched(t, 50));
    expect(pagesDuration(t, [9, 50])).toBe(averagePage(t) + stretched(t, 50));
  });

  it('are never played, ayah by ayah', () => {
    // Al-Sudais's an-Nisa ends 99 s before its timings do.
    const t = load('sudais');
    expect(ayatTimed(t, '4:1')).toBe(false);
    expect(ayatRecitation(t, '4:1')).toEqual([]);
    expect(ayatDuration(t, '4:1', '4:5')).toBeNull();
    // A run that crosses into one is not heard in part either.
    expect(ayatTimed(t, '2:286', '3:1')).toBe(false);
    expect(ayatRecitation(t, '2:280', '3:2')).toEqual([]);
    expect(ayatDuration(t, '2:280', '3:2')).toBeNull();
    // Al-Baqarah is timed, and plays.
    expect(ayatTimed(t, '2:280', '2:286')).toBe(true);
    expect(ayatRecitation(t, '2:280', '2:286')).toHaveLength(1);
    expect(ayatDuration(t, '2:280', '2:286')).toBeGreaterThan(0);
    // And nothing is marked as recited in it.
    const [from, to] = ayahTimes(t, 4)[0];
    expect(ayahAt(t, 4, (from + to) / 2)).toBeNull();
    const [from2, to2] = ayahTimes(t, 2)[0];
    expect(ayahAt(t, 2, (from2 + to2) / 2)).toBe(1);
  });
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
    files: [],
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

  it('names an ayah by its verse key, by surah and ayah, or by number', () => {
    expect(ayahOf('2:255')).toEqual([2, 255]);
    expect(ayahOf([2, 255])).toEqual([2, 255]);
    expect(ayahOf(262)).toEqual([2, 255]);
    expect(ayahOf(1)).toEqual([1, 1]);
    expect(ayahOf(6236)).toEqual([114, 6]);
    for (const bad of [0, 6237, 1.5, Number.NaN])
      expect(() => ayahOf(bad), String(bad)).toThrow(RangeError);
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
    expect(ayahAt(fake, 0, 600)).toBeNull();
    expect(ayahTimes(fake, 0)).toEqual([]);
    expect(ayahTimes(fake, 1)).toBe(ayahTimes(fake, 1)); // decoded once
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

describe('cleaning word segments', () => {
  const ayah = { from: 1000, to: 5000, words: 4 };

  it('keeps well-formed words as they are', () => {
    const segments = [
      [1, 1000, 1500],
      [2, 1500, 2600],
      [3, 2600, 3900],
      [4, 3900, 5000],
    ];
    const clean = cleanSegments('9:9', segments, ayah);
    expect(clean.words).toEqual(segments);
    expect(clean).toMatchObject({
      malformed: 0,
      clamped: 0,
      trimmed: 0,
      emptied: 0,
    });
    expect(coversAll(clean.words, 4)).toBe(true);
  });

  it('drops what is not a word with a time', () => {
    const clean = cleanSegments(
      '9:9',
      [
        [1, 1000],
        [2],
        [1, 1000, 1500, 9],
        [1, '1000', 1500],
        [1, 1000, Number.NaN],
        null,
        [3, 2600, 2590], // ends before it starts
        [0, 1000, 1200], // there is no word 0
        [5, 4000, 4500], // nor a word 5 in an ayah of four
        [2.5, 2000, 2100],
        [2, 1500, 2600],
      ],
      ayah,
    );
    expect(clean.words).toEqual([[2, 1500, 2600]]);
    expect(clean.malformed).toBe(10);
    expect(coversAll(clean.words, 4)).toBe(false);
    expect(cleanSegments('9:9', undefined, ayah).words).toEqual([]);
  });

  it('rounds times and cuts them to the ayah', () => {
    const clean = cleanSegments(
      '9:9',
      [
        [1, 990.4, 1499.6],
        [2, 1499.6, 2600],
        [3, 2600, 3900],
        [4, 3900, 5040],
        [4, 6000, 7000], // wholly after the ayah: nothing left of it
      ],
      ayah,
    );
    expect(clean.words).toEqual([
      [1, 1000, 1500],
      [2, 1500, 2600],
      [3, 2600, 3900],
      [4, 3900, 5000],
    ]);
    expect(clean).toMatchObject({ clamped: 3, emptied: 1 });
  });

  it('keeps a word taken up again in the order it is heard', () => {
    // Waqf and ibtida': the reciter stops after word 3 and starts again at 2.
    const segments = [
      [1, 1000, 1400],
      [2, 1400, 1900],
      [3, 1900, 2500],
      [2, 2800, 3200],
      [3, 3200, 3800],
      [4, 3800, 4600],
    ];
    // Given out of order, they are put back in order of time.
    const clean = cleanSegments('9:9', [...segments].reverse(), ayah);
    expect(clean.words).toEqual(segments);
    expect(coversAll(clean.words, 4)).toBe(true);
  });

  it('never lets two words be heard at once', () => {
    const clean = cleanSegments(
      '9:9',
      [
        [1, 1000, 2000],
        [2, 1800, 2600], // starts before word 1 ends
        [3, 2000, 2400], // wholly inside word 2
        [4, 2600, 3000],
      ],
      ayah,
    );
    expect(clean.words).toEqual([
      [1, 1000, 2000],
      [2, 2000, 2600],
      [4, 2600, 3000],
    ]);
    expect(clean).toMatchObject({ trimmed: 2, emptied: 1 });
    // Nor across ayat whose times overlap: the last ayah's words ended at 1200.
    expect(cleanSegments('9:9', [[1, 1000, 1500]], ayah, 1200).words).toEqual([
      [1, 1200, 1500],
    ]);
  });

  it('drops a word with no length', () => {
    const clean = cleanSegments('9:9', [[1, 2000, 2000]], ayah);
    expect(clean.words).toEqual([]);
    expect(clean.emptied).toBe(1);
  });

  it('joins the two halves of «إِلْ يَاسِينَ» into its one printed word', () => {
    const clean = cleanSegments(
      '37:130',
      [
        [1, 1000, 1800],
        [2, 1800, 2400],
        [3, 2400, 2800],
        [4, 2810, 3900],
      ],
      { from: 1000, to: 5000, words: 3 },
    );
    expect(clean.words).toEqual([
      [1, 1000, 1800],
      [2, 1800, 2400],
      [3, 2400, 3900],
    ]);
    expect(clean.malformed).toBe(0);
    // Anywhere else a fourth word in an ayah of three is no word.
    expect(
      cleanSegments('9:9', [[4, 2810, 3900]], {
        from: 1000,
        to: 5000,
        words: 3,
      }).malformed,
    ).toBe(1);
  });

  it('counts the words of as-Saffat 130 as the print does', () => {
    expect(wordCount.get('37:130')).toBe(3);
  });

  it('writes an ayah as its stretch and a gap and length per word', () => {
    const words: [number, number, number][] = [
      [1, 1000, 1400],
      [2, 1400, 1900],
      [2, 2800, 3200],
    ];
    const entry = encodeAyahWords([1000, 5000], words);
    expect(entry).toEqual([1000, 5000, 1, 0, 400, 2, 0, 500, 2, 900, 400]);
    expect(decodeAyahWords(entry)).toEqual({ span: [1000, 5000], words });
    expect(decodeAyahWords([1000, 5000])).toEqual({
      span: [1000, 5000],
      words: [],
    });
  });
});

describe('the files the timings were made from', () => {
  const headers = (h: Record<string, string>) => ({
    get: (name: string) => h[name] ?? null,
  });

  it('reads a length and a date from a HEAD or a first-byte request', () => {
    const modified = 'Fri, 06 Jan 2023 01:08:47 GMT';
    expect(
      stampOf(
        200,
        headers({ 'content-length': '386026', 'last-modified': modified }),
      ),
    ).toEqual([386026, '2023-01-06T01:08:47Z']);
    expect(
      stampOf(
        206,
        headers({
          'content-length': '1',
          'content-range': 'bytes 0-0/386026',
          'last-modified': modified,
        }),
      ),
    ).toEqual([386026, '2023-01-06T01:08:47Z']);
    expect(stampOf(200, headers({ 'content-length': '386026' }))).toBeNull();
    expect(stampOf(200, headers({ 'last-modified': modified }))).toBeNull();
    expect(
      stampOf(
        206,
        headers({ 'content-length': '1', 'last-modified': modified }),
      ),
    ).toBeNull();
  });

  it('says how a file changed, and nothing if it did not', () => {
    const date = '2023-01-06T01:08:47Z';
    const timed: FileRecord = [386026, date, 48_000, 48_000];
    expect(fileChange(timed, [386026, date, 48_000])).toBeNull();
    expect(fileChange(timed, [390000, date, 48_000])).toBe(
      'length 386026 is now 390000',
    );
    expect(fileChange(timed, [386026, '2026-09-08T01:47:18Z', 48_000])).toBe(
      'last modified 2023-01-06T01:08:47Z is now 2026-09-08T01:47:18Z',
    );
    expect(fileChange(timed, [386026, date, 39_100])).toBe(
      'it played 48.0 s and now plays 39.1 s',
    );
    expect(fileChange(timed, [1, '2026-09-08T01:47:18Z', 1])).toContain(', ');
    expect(fileChange(timed, null)).toBe('served without a length or a date');
  });

  it('takes a file that ends with its last ayah, give or take, to fit', () => {
    // As built: al-Husary's al-Fatiha ends 0.6 s after its last ayah.
    expect(endMisfit([1, '', 48_600, 48_000], 48_000)).toBeNull();
    // Abdul Basit's al-Ankabut ends 1.2 s before its last ayah does.
    expect(endMisfit([1, '', 1_000_000, 1_000_000], 1_001_180)).toBeNull();
    // A closing after the last ayah, in the very file the API timed.
    expect(endMisfit([1, '', 2_254_200, 2_254_000], 2_243_800)).toBeNull();
    // Another file than the API's, but one that ends with the timings.
    expect(endMisfit([1, '', 980_800, 974_000], 981_200)).toBeNull();
    expect(LEEWAY_MS).toBe(2000);
  });

  it('takes a file to be another recording when it does not end with them', () => {
    // al-Dosari's al-Layl, replaced on 2026-09-08 by a shorter recording.
    expect(endMisfit([1, '', 78_600, 88_000], 87_470)).toBe(
      'its last ayah ends 8.9 s after the file does',
    );
    // Abdul Basit's al-Baqarah, 17 minutes longer than the one timed.
    expect(endMisfit([1, '', 9_684_900, 8_655_000], 8_655_990)).toBe(
      'it plays 9684.9 s, not the 8655.0 s of the file the API timed, and runs 1028.9 s past its last ayah',
    );
    // Just past the leeway either way.
    expect(endMisfit([1, '', 100_000, 100_000], 102_001)).not.toBeNull();
    expect(endMisfit([1, '', 100_000, 97_999], 97_999)).not.toBeNull();
  });

  /** Ayat of ten words at a second a word, one after another from 0 s,
      their words heard where they are, unless given otherwise. */
  const recited = (
    keys: string[],
    odd: Record<string, { words?: number; ms?: number; heard?: Span }> = {},
  ) => {
    let at = 0;
    return keys.map((key): AyahCheck => {
      const { words = 10, ms = 10_000, heard } = odd[key] ?? {};
      const from = at;
      at += ms;
      return { key, words, from, to: at, heard: heard ?? [from, at] };
    });
  };
  const keys = (surah: number, count: number) =>
    Array.from({ length: count }, (_, i) => `${surah}:${i + 1}`);

  it('finds an ayah timed far too fast whose words stray, and its neighbours', () => {
    expect(
      misplacedAyat(
        recited(keys(2, 12), {
          // 59 words in 10 s (a sixth of the pace), its words heard for
          // 40 s, on into 2:6, 2:7 and 2:8.
          '2:5': { words: 59, heard: [40_000, 80_000] },
        }),
      ),
    ).toEqual(['2:4', '2:5', '2:6', '2:7', '2:8']);
  });

  it('follows the words of what it takes as far as they reach', () => {
    // 2:5's words run 15 s past it, into 2:6 and 2:7, and 2:7's own words
    // run on 5 s into 2:8.
    const ayat = recited(keys(2, 12), {
      '2:5': { words: 30, heard: [40_000, 65_000] },
      '2:7': { heard: [60_000, 75_000] },
    });
    expect(misplacedAyat(ayat)).toEqual(['2:4', '2:5', '2:6', '2:7', '2:8']);
  });

  it('takes no neighbour from another surah', () => {
    const ayat = [
      ...recited(keys(1, 7)),
      ...recited(keys(2, 7), { '2:1': { words: 30, heard: [0, 30_000] } }),
    ];
    expect(misplacedAyat(ayat)).toEqual(['2:1', '2:2', '2:3']);
  });

  it('leaves an ayah that is only quick, or only strays', () => {
    expect(
      misplacedAyat(
        recited(keys(3, 12), {
          // Quick, but its words are where it says: short words, quickly.
          '3:3': { words: 20 },
          // Words outside, but at a believable pace: a word timed early.
          '3:6': { heard: [42_000, 60_000] },
          // Quick, with words only just outside: al-Rifai's ayah 27.
          '3:11': { words: 20, heard: [100_000, 111_900] },
          // Too short an ayah to judge by its pace.
          '3:12': { words: 4, ms: 1_000, heard: [110_000, 120_000] },
        }),
      ),
    ).toEqual([]);
  });
});

describe('word times', () => {
  afterEach(() => vi.unstubAllGlobals());

  /* Surah 9 of a made-up reciter: ayah 1 read through, ayah 2 with its
     words 2 and 3 taken up again after a pause, ayah 3 missing word 2. */
  const file: WordsFile = {
    source: 'test',
    surah: 9,
    partial: [3],
    ayat: [
      encodeAyahWords(
        [0, 1000],
        [
          [1, 0, 400],
          [2, 400, 1000],
        ],
      ),
      encodeAyahWords(
        [1000, 4000],
        [
          [1, 1000, 1500],
          [2, 1500, 2000],
          [3, 2000, 2500],
          [2, 2800, 3200],
          [3, 3200, 4000],
        ],
      ),
      encodeAyahWords([4000, 5000], [[1, 4100, 4500]]),
    ],
  };
  const w = readWords(file);

  it('finds the word heard at a moment, by time and not by number', () => {
    expect(wordAt(w, 0)).toEqual({ ayah: 1, word: 1, from: 0, to: 400 });
    expect(wordAt(w, 400)).toMatchObject({ ayah: 1, word: 2 });
    expect(wordAt(w, 1999)).toMatchObject({ ayah: 2, word: 2, from: 1500 });
    expect(wordAt(w, 2600)).toBeNull(); // the pause before taking up again
    expect(wordAt(w, 2800)).toMatchObject({ ayah: 2, word: 2, from: 2800 });
    expect(wordAt(w, 3500)).toMatchObject({ ayah: 2, word: 3, from: 3200 });
    expect(wordAt(w, 4050)).toBeNull();
    expect(wordAt(w, 5000)).toBeNull();
    expect(wordAt(w, -1)).toBeNull();
  });

  it('says which ayat have every word timed', () => {
    expect([1, 2, 3, 4].map((a) => wordsCovered(w, a))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(w.ayat[1].words.map((x) => x.word)).toEqual([1, 2, 3, 2, 3]);
  });

  it('finds the words of a real recording', async () => {
    const husary = readWords(wordsFile('husary', 1));
    expect(wordAt(husary, 0)).toMatchObject({ ayah: 1, word: 1 });
    expect(wordAt(husary, 600)).toMatchObject({ ayah: 1, word: 2 });
    expect(wordsCovered(husary, 7)).toBe(true);
  });

  const respond = (body: unknown, status = 200) =>
    ({ ok: status === 200, status, json: async () => body }) as Response;

  it("fetches a surah's words from the app's own address, once", async () => {
    const fetch = vi.fn(async () => respond(file));
    vi.stubGlobal('fetch', fetch);
    const [a, b] = await Promise.all([
      loadWords('husary', 9),
      loadWords('husary', 9),
    ]);
    expect(a).toBe(b);
    expect(await loadWords('husary', 9)).toBe(a);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      `${import.meta.env.BASE_URL}words/husary/9.json`,
    );
    expect(wordAt(a, 3500)).toMatchObject({ ayah: 2, word: 3 });
  });

  it('asks again after a load that failed', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(respond(null, 404))
      .mockResolvedValueOnce(respond(file));
    vi.stubGlobal('fetch', fetch);
    await expect(loadWords('sudais', 9)).rejects.toThrow('404');
    await expect(loadWords('sudais', 9)).resolves.toMatchObject({ surah: 9 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('refuses a file for another surah, a surah that is not, and a stranger', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respond(file)),
    );
    await expect(loadWords('shatri', 10)).rejects.toThrow('not surah 10');
    await expect(loadWords('shatri', 0)).rejects.toThrow(RangeError);
    await expect(loadWords('shatri', 115)).rejects.toThrow(RangeError);
    await expect(loadWords('nobody', 1)).rejects.toThrow('no timings');
  });
});
