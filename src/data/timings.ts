/* When a reciter recites each page, each ayah and each word of his surah
   recordings. Built by scripts/build-timings.ts from Quran.com's per-ayah
   and per-word timestamps; its header documents every field.

   - src/data/timings/<id>.json, one small file per reciter, loaded only
     when a halaqa is timed by that reciter or listens to him: the address
     of his surah files, the stretch of each page (`pages`) and of each
     ayah (`ayat`, read through `ayahTimes()`).
   - public/words/<id>/<surah>.json, his words in one surah, fetched only
     when a recitation is followed word by word (`loadWords()`).

   Every time is in milliseconds from the start of the surah's file. */

import {
  decodeAyahWords,
  decodeSpans,
  surahFile,
  type FileStamp,
  type Span,
  type WordsFile,
} from './audio';
import { PAGE_COUNT } from './mushaf';

/** [surah, fromMs, toMs]: a stretch of the reciter's recording of that surah. */
export type Stretch = [surah: number, from: number, to: number];

/** A stretch of a recording to play, and the page it recites. */
export type Segment = {
  url: string;
  /** Milliseconds into the recording. */
  from: number;
  to: number;
  page: number;
};

export type Timings = {
  /** The surah file's address, with `{n}` or `{nnn}` for the surah
      number (see audio.ts). */
  audio: string;
  /** Each surah file as the host served it when these timings were made,
      index surah - 1, which scripts/check-audio.ts compares with what it
      serves now. */
  files: FileStamp[];
  /** Each surah's ayat in a compact form, index surah - 1; read them
      through `ayahTimes()`. */
  ayat: number[][];
  pages: Stretch[][];
};

const modules = import.meta.glob<{ default: Timings }>('./timings/*.json');
const cache = new Map<string, Promise<Timings>>();

export function loadTimings(reciter: string): Promise<Timings> {
  let pending = cache.get(reciter);
  if (!pending) {
    const load = modules[`./timings/${reciter}.json`];
    if (!load) return Promise.reject(new Error(`no timings for ${reciter}`));
    pending = load().then((m) => m.default);
    pending.catch(() => cache.delete(reciter));
    cache.set(reciter, pending);
  }
  return pending;
}

export const pageStretches = (t: Timings, page: number): Stretch[] =>
  t.pages[page - 1] ?? [];

/** Milliseconds the reciter takes over a page. */
export const pageDuration = (t: Timings, page: number) =>
  pageStretches(t, page).reduce((sum, [, from, to]) => sum + (to - from), 0);

/** Milliseconds over several pages, as a turn of more than one page is. */
export const pagesDuration = (t: Timings, pages: readonly number[]) =>
  pages.reduce((sum, p) => sum + pageDuration(t, p), 0);

/** The reciter's average page, for the picker: «نحو ١:٤٠ للصفحة». */
export const averagePage = (t: Timings) =>
  t.pages.reduce((s, _, i) => s + pageDuration(t, i + 1), 0) / PAGE_COUNT;

export const surahAudioUrl = (t: Timings, surah: number) =>
  surahFile(t.audio, surah);

/** A reciter's recitation of some pages, as the stretches to play in order:
    one per page, or two where a page holds the end of one surah and the
    start of the next. */
export const recitationOf = (t: Timings, pages: readonly number[]): Segment[] =>
  pages.flatMap((page) =>
    pageStretches(t, page).map(([surah, from, to]) => ({
      url: surahAudioUrl(t, surah),
      from,
      to,
      page,
    })),
  );

/** An ayah, by its verse key (`'2:255'`) or by surah and ayah
    (`[2, 255]`). */
export type AyahRef = string | readonly [surah: number, ayah: number];

/** The surah and ayah an `AyahRef` names. Throws a RangeError for
    anything that is not one, so a slip shows where it was made. */
export function ayahOf(ref: AyahRef): [surah: number, ayah: number] {
  const [surah, ayah] =
    typeof ref === 'string'
      ? (/^(\d{1,3}):(\d{1,3})$/.exec(ref)?.slice(1).map(Number) ?? [])
      : ref;
  if (
    !Number.isInteger(surah) ||
    !Number.isInteger(ayah) ||
    surah < 1 ||
    surah > 114 ||
    ayah < 1
  )
    throw new RangeError(`not an ayah: ${String(ref)}`);
  return [surah, ayah];
}

/* Decoded once per reciter and surah, as a halaqa asks again and again. */
const decoded = new WeakMap<Timings, Span[][]>();

/** The stretch of each ayah of a surah in its file, index ayah - 1. Each
    starts and ends no earlier than the one before (the build checks it),
    though one may start a little before the last has ended. */
export function ayahTimes(t: Timings, surah: number): readonly Span[] {
  let surahs = decoded.get(t);
  if (!surahs) decoded.set(t, (surahs = []));
  return (surahs[surah - 1] ??= decodeSpans(t.ayat[surah - 1] ?? []));
}

/** A run of ayat of one surah, as the stretch of its file to play. */
export type AyatSegment = {
  url: string;
  surah: number;
  /** The run's first and last ayah, numbered within the surah. */
  first: number;
  last: number;
  /** Milliseconds into the recording: the first ayah's start and the
      last one's end. */
  from: number;
  to: number;
};

function timedAyah(t: Timings, ref: AyahRef) {
  const [surah, ayah] = ayahOf(ref);
  const span = ayahTimes(t, surah)[ayah - 1];
  if (!span) throw new RangeError(`not an ayah: ${String(ref)}`);
  return [surah, ayah] as const;
}

/** A reciter's recitation of the ayat from `first` to `last`, both
    included, as the stretches to play in order: one per surah file the run
    touches. None if `last` comes before `first`. */
export function ayatRecitation(
  t: Timings,
  first: AyahRef,
  last: AyahRef = first,
): AyatSegment[] {
  const [s1, a1] = timedAyah(t, first);
  const [s2, a2] = timedAyah(t, last);
  const segments: AyatSegment[] = [];
  for (let surah = s1; surah <= s2; surah++) {
    const spans = ayahTimes(t, surah);
    const from = surah === s1 ? a1 : 1;
    const to = surah === s2 ? a2 : spans.length;
    if (to < from) continue;
    segments.push({
      url: surahAudioUrl(t, surah),
      surah,
      first: from,
      last: to,
      from: spans[from - 1][0],
      to: spans[to - 1][1],
    });
  }
  return segments;
}

/** Milliseconds the reciter takes over the ayat from `first` to `last`,
    both included: how a reader's turn of those ayat is timed. */
export const ayatDuration = (t: Timings, first: AyahRef, last = first) =>
  ayatRecitation(t, first, last).reduce((sum, s) => sum + (s.to - s.from), 0);

/** Binary search: how many items of `list` start at or before `ms`, for a
    list whose starts never go back. */
function startedBy<T>(list: readonly T[], start: (x: T) => number, ms: number) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (start(list[mid]) <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The ayah being recited `ms` into a surah's file: the last one to have
    started by then, unless it has already ended. Null before the first,
    after the last, and in a pause between two. */
export function ayahAt(t: Timings, surah: number, ms: number): number | null {
  const spans = ayahTimes(t, surah);
  const n = startedBy(spans, ([from]) => from, ms);
  return n > 0 && ms < spans[n - 1][1] ? n : null;
}

/** A word heard in a surah's recording: its ayah, its number in that ayah
    as the print counts them (from 1; the end-of-ayah marker is never one),
    and when. */
export type WordTime = { ayah: number; word: number; from: number; to: number };

/** A reciter's words in one surah. */
export type SurahWords = {
  surah: number;
  /** Per ayah, index ayah - 1: its stretch, its words in the order heard,
      and whether every one of its words is among them. Where not, the
      ayah is to be followed as a whole. */
  ayat: { from: number; to: number; full: boolean; words: WordTime[] }[];
  /** Every word of the surah in the order heard, none overlapping another.
      A reciter who goes back to take up an earlier word again is heard
      reciting it twice, so a word may appear more than once. */
  timeline: WordTime[];
};

/** A words file as the app uses it. */
export function readWords(file: WordsFile): SurahWords {
  if (!Array.isArray(file?.ayat) || !Array.isArray(file.partial))
    throw new Error('not a words file');
  const partial = new Set(file.partial);
  const ayat = file.ayat.map((entry, i) => {
    const { span, words } = decodeAyahWords(entry);
    return {
      from: span[0],
      to: span[1],
      full: !partial.has(i + 1),
      words: words.map(([word, from, to]) => ({ ayah: i + 1, word, from, to })),
    };
  });
  const timeline = ayat.flatMap((a) => a.words).sort((a, b) => a.from - b.from);
  return { surah: file.surah, ayat, timeline };
}

const words = new Map<string, Promise<SurahWords>>();

/** A reciter's words in one surah, fetched from the app's own origin
    once, and again only if that failed. */
export function loadWords(reciter: string, surah: number): Promise<SurahWords> {
  if (!modules[`./timings/${reciter}.json`])
    return Promise.reject(new Error(`no timings for ${reciter}`));
  if (!Number.isInteger(surah) || surah < 1 || surah > 114)
    return Promise.reject(new RangeError(`not a surah: ${surah}`));
  const key = `${reciter}/${surah}`;
  let pending = words.get(key);
  if (!pending) {
    const url = `${import.meta.env.BASE_URL}words/${key}.json`;
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.json() as Promise<WordsFile>;
      })
      .then((file) => {
        if (file?.surah !== surah)
          throw new Error(`${url} is not surah ${surah}`);
        return readWords(file);
      });
    // A failed load (offline, a deploy in progress) is forgotten so the
    // next attempt tries again instead of failing from the cache.
    pending.catch(() => words.delete(key));
    words.set(key, pending);
  }
  return pending;
}

/** The word being recited `ms` into the surah's file, or null between
    words. Found by time, never by number, so a word taken up again is
    found again where it is heard again. */
export function wordAt(w: SurahWords, ms: number): WordTime | null {
  const n = startedBy(w.timeline, (x) => x.from, ms);
  const word = w.timeline[n - 1];
  return word && ms < word.to ? word : null;
}

/** Whether every word of an ayah is timed; if not, the app marks the ayah
    as a whole while it is recited. */
export const wordsCovered = (w: SurahWords, ayah: number) =>
  w.ayat[ayah - 1]?.full ?? false;
