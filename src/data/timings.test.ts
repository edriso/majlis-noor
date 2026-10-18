import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAGE_COUNT, surahs, type Page } from './mushaf';
import { paceLabel, reciters } from './reciters';
import {
  cleanSegments,
  coversAll,
  decodeAyahWords,
  decodeSpans,
  encodeAyahWords,
  encodeSpans,
  fileChange,
  stampOf,
  surahFile,
  type FileRecord,
  type Span,
  type WordsFile,
} from './audio';
import {
  ayahAt,
  ayahOf,
  ayahTimes,
  ayatDuration,
  ayatRecitation,
  averagePage,
  loadWords,
  pageDuration,
  pagesDuration,
  readWords,
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
