/* What scripts/build-timings.ts writes and the app reads about a reciter's
   recordings, kept apart from timings.ts because the script runs in Node
   without Vite: each form is written and read by functions that sit side
   by side here, so the two cannot drift apart.

   - The address of a surah's file. A reciter's recordings are one file per
     surah, and his timings keep one address for all of them with the surah
     number as a placeholder. Quran.com names some reciters' files by the
     bare number (68.mp3) and others by three digits (068.mp3), so the
     placeholder says which: `{n}` or `{nnn}`.
   - A surah's ayah times, in a compact form (`encodeSpans`).
   - A surah's word times: how the API's segments are cleaned
     (`cleanSegments`), and their compact form (`encodeAyahWords`).
   - How a file the host serves today differs from the one the timings
     were made from (`fileChange`), whether a file fits its timings at all
     (`endMisfit`), and which ayat are misplaced in one that does
     (`misplacedAyat`), for scripts/build-timings.ts and
     scripts/check-audio.ts. */

/** The address of a surah's file, from a reciter's address template. */
export const surahFile = (template: string, surah: number) =>
  template
    .replace('{nnn}', String(surah).padStart(3, '0'))
    .replace('{n}', String(surah));

/** A stretch of a surah file, in milliseconds from its start. */
export type Span = [from: number, to: number];

/** A surah's ayah stretches as its timings file keeps them: for each ayah
    in order, where it starts counted from where the one before ended (the
    first from 0), then how long it lasts. Most ayat start where the last
    one ended, so most of the first numbers are 0 and the whole is about
    half the size of plain times. Where an ayah starts before the last one
    ended, as al-Shuraim's do by 10ms, the first number is negative. */
export function encodeSpans(spans: readonly Span[]): number[] {
  let end = 0;
  return spans.flatMap(([from, to]) => {
    const pair = [from - end, to - from];
    end = to;
    return pair;
  });
}

export function decodeSpans(deltas: readonly number[]): Span[] {
  const spans: Span[] = [];
  let end = 0;
  for (let i = 0; i + 1 < deltas.length; i += 2) {
    const from = end + deltas[i];
    end = from + deltas[i + 1];
    spans.push([from, end]);
  }
  return spans;
}

/** A word being recited: its number in its ayah, counted from 1 as the
    print sets the ayah (the end-of-ayah marker is never one), and its
    stretch of the surah file. A reciter who stops and goes back recites a
    word twice, so one word may have several. */
export type WordSpan = [word: number, from: number, to: number];

/** Words the print and the recordings' segments count differently, by
    verse key: the segment's word number, and the printed word it is part
    of. The print sets «إِلْ يَاسِينَ» (as-Saffat 130) as one word; every
    reciter's segments time «إِلْ» and «يَاسِينَ» as words 3 and 4, which
    cleaning joins into one stretch of word 3. */
export const RENUMBERED: Readonly<
  Record<string, Readonly<Record<number, number>>>
> = {
  '37:130': { 4: 3 },
};

/** One ayah's word segments as cleaning left them, and what it dropped. */
export type Cleaned = {
  /** In time order, none overlapping another or the words before. */
  words: WordSpan[];
  /** Not three numbers, ending before they start, or numbering a word the
      ayah does not have. */
  malformed: number;
  /** Reaching outside the ayah, and cut to it. */
  clamped: number;
  /** Starting before the word before had ended, and started later. */
  trimmed: number;
  /** Left with no time at all once clamped or trimmed. */
  emptied: number;
};

/**
 * Cleans the segments the API gives for one ayah, `[[word, fromMs, toMs],
 * …]` in its surah file, into words that can be found by time.
 *
 * The API's segments are mostly right and sometimes not: a few entries
 * lack a number, end before they start, or run seconds into the next
 * ayah. Those are dropped or cut to the ayah. Times are rounded to whole
 * milliseconds. A word number going back is kept: it is the reciter
 * stopping and taking up an earlier word again (waqf and ibtida'), and
 * the words stay in the order they are heard. Two words are never heard
 * at once, so a word starting before the last one ended starts when it
 * ends, and `after`, where the previous ayah's last word ended, carries
 * that across ayat whose times overlap.
 */
export function cleanSegments(
  key: string,
  segments: unknown,
  ayah: { from: number; to: number; words: number },
  after = -Infinity,
): Cleaned {
  const renumber = RENUMBERED[key] ?? {};
  const result: Cleaned = {
    words: [],
    malformed: 0,
    clamped: 0,
    trimmed: 0,
    emptied: 0,
  };
  const found: [...WordSpan, renumbered: boolean][] = [];
  for (const entry of Array.isArray(segments) ? (segments as unknown[]) : []) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 3 ||
      !entry.every((x) => typeof x === 'number' && Number.isFinite(x))
    ) {
      result.malformed++;
      continue;
    }
    const [n, start, end] = entry as number[];
    const renumbered = n in renumber;
    const word = renumbered ? renumber[n] : n;
    if (!Number.isInteger(word) || word < 1 || word > ayah.words) {
      result.malformed++;
      continue;
    }
    if (end < start) {
      result.malformed++;
      continue;
    }
    const clamp = (ms: number) =>
      Math.min(ayah.to, Math.max(ayah.from, Math.round(ms)));
    const from = clamp(start);
    const to = clamp(end);
    if (from !== Math.round(start) || to !== Math.round(end)) result.clamped++;
    found.push([word, from, to, renumbered]);
  }
  // Sorted by start; a stable sort keeps the API's order for equal times.
  found.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  let end = after;
  for (const [word, from, to, renumbered] of found) {
    const start = Math.max(from, end);
    if (start > from) result.trimmed++;
    if (to <= start) {
      result.emptied++;
      continue;
    }
    const last = result.words[result.words.length - 1];
    // The second half of a printed word goes on from its first half.
    if (renumbered && last?.[0] === word) last[2] = to;
    else result.words.push([word, start, to]);
    end = to;
  }
  return result;
}

/** Whether every word of an ayah of `count` words is among `words`. */
export const coversAll = (words: readonly WordSpan[], count: number) =>
  new Set(words.map(([w]) => w)).size === count &&
  words.every(([w]) => w >= 1 && w <= count);

/** A surah's word timings, as public/words/<reciter>/<surah>.json holds
    them. */
export type WordsFile = {
  /** Where they come from, for whoever opens the file. */
  source: string;
  surah: number;
  /** The ayat, by number, not every word of which is timed. */
  partial: number[];
  /** Per ayah in order, `encodeAyahWords()`. */
  ayat: number[][];
};

/**
 * One ayah's entry in a words file: its stretch, then a triple per word
 * in time order,
 *
 *     [from, to, word, gap, length, word, gap, length, …]
 *
 * `from` and `to` are milliseconds in the surah file; `gap` is where the
 * word starts counted from where the word before it ended (the first word
 * from the ayah's start), and `length` how long it lasts. Most gaps are 0,
 * which keeps the files small once compressed. Cleaning leaves no gap or
 * length negative.
 */
export function encodeAyahWords(span: Span, words: readonly WordSpan[]) {
  const entry = [span[0], span[1]];
  let end = span[0];
  for (const [word, from, to] of words) {
    entry.push(word, from - end, to - from);
    end = to;
  }
  return entry;
}

export function decodeAyahWords(entry: readonly number[]): {
  span: Span;
  words: WordSpan[];
} {
  const [from, to] = entry;
  const words: WordSpan[] = [];
  let end = from;
  for (let i = 2; i + 2 < entry.length; i += 3) {
    const start = end + entry[i + 1];
    end = start + entry[i + 2];
    words.push([entry[i], start, end]);
  }
  return { span: [from, to], words };
}

/** A surah file as the host serves it: its length in bytes, and its
    `last-modified` as an ISO date to the second. */
export type FileStamp = [bytes: number, modified: string];

/** A surah file as its reciter's timings record it: its stamp, how long
    it plays in milliseconds (measured from its own frames, see
    scripts/mp3.ts), and how long the API says the file it timed plays
    (its `duration`, cut to whole seconds for every reciter but
    al-Shuraim). */
export type FileRecord = [
  bytes: number,
  modified: string,
  ms: number,
  apiMs: number,
];

/**
 * The stamp of a file from the host's answer to a HEAD request (the whole
 * length in `content-length`) or to a request for its first bytes (the
 * whole length after the slash of `content-range`). Null if either is
 * missing, which a file that is served properly never is.
 */
export function stampOf(
  status: number,
  headers: { get(name: string): string | null },
): FileStamp | null {
  const length =
    status === 206
      ? headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
      : headers.get('content-length');
  const modified = Date.parse(headers.get('last-modified') ?? '');
  if (!length || Number.isNaN(modified)) return null;
  return [
    Number(length),
    new Date(modified).toISOString().replace('.000Z', 'Z'),
  ];
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** How the file served today differs from the one recorded, or null if
    it is the same file: the same length, date and duration. */
export function fileChange(
  recorded: FileRecord,
  served: [bytes: number, modified: string, ms: number] | null,
): string | null {
  if (!served) return 'served without a length or a date';
  const changes = [];
  if (served[0] !== recorded[0])
    changes.push(`length ${recorded[0]} is now ${served[0]}`);
  if (served[1] !== recorded[1])
    changes.push(`last modified ${recorded[1]} is now ${served[1]}`);
  if (served[2] !== recorded[2])
    changes.push(
      `it played ${seconds(recorded[2])} and now plays ${seconds(served[2])}`,
    );
  return changes.length ? changes.join(', ') : null;
}

/**
 * How far a surah file's end and its timings' end may disagree, either
 * way, before the timings are taken to belong to another file.
 *
 * Measured over all 1,140 files on 2026-10-18 (the distribution is in the
 * commit that brought this in). In a file that fits, the last ayah ends
 * at most 1.2 s after the file does (the encoder's padding and the API's
 * rounding) and the file runs on after it by under 4.6 s of silence, or
 * by up to 10.4 s of the recording's own closing where the file is the
 * very one the API timed: its duration, which the API cuts to whole
 * seconds, is within 1.3 s of the file's. The files that do not fit are
 * 2.9 s past their end or more, or are 2.8 s or more off the duration of
 * the file the API timed and end 4.6 s or more before their last ayah.
 * Two seconds sits in both gaps.
 */
export const LEEWAY_MS = 2000;

/**
 * Why a surah file does not fit its timings, or null if it does, from how
 * long it plays and where its last ayah ends:
 *
 * - its last ayah ends after the file does, beyond the leeway: the timings
 *   were made from a longer recording, or are stretched;
 * - it is not the file the API timed (its duration is off the API's) and
 *   it runs on after its last ayah beyond the leeway: what is in the
 *   extra time, and where, cannot be told, so neither can whether the
 *   ayat moved. A file that is not the API's but ends with its last ayah
 *   fits all the same.
 */
export function endMisfit(file: FileRecord, lastEnd: number): string | null {
  const [, , ms, apiMs] = file;
  const over = lastEnd - ms;
  if (over > LEEWAY_MS)
    return `its last ayah ends ${seconds(over)} after the file does`;
  if (Math.abs(ms - apiMs) > LEEWAY_MS && -over > LEEWAY_MS)
    return `it plays ${seconds(ms)}, not the ${seconds(apiMs)} of the file the API timed, and runs ${seconds(-over)} past its last ayah`;
  return null;
}

/** An ayah as the check for misplaced ayat sees it: its verse key, how
    many words the print gives it, its span in the file, and where the
    API's own word segments for it begin and end (null if it has none). */
export type AyahCheck = {
  key: string;
  words: number;
  from: number;
  to: number;
  heard: Span | null;
};

/** How far an ayah's own words may reach outside it before they say its
    span is wrong: al-Rifai's ayah 27 of many a surah has a last word timed
    1.1 to 1.9 s past it, by a quirk of the segments, not of the ayah. */
const STRAY_MS = 2000;

/**
 * The ayat whose own start or end is misplaced, in a file that may fit
 * its timings otherwise, given every ayah of a reciter in order.
 *
 * It starts from the ayat that cannot be right: six words or more, timed
 * at under 0.6 of the reciter's median pace (milliseconds per word over
 * all his ayat of six words or more), with their own words more than two
 * seconds outside them. Either sign alone is found in good timings: short
 * words recited quickly (al-Husary's 3:25 and al-Dosari's 18:68 at 0.49
 * of their median, with no word outside), words timed off their ayah at a
 * pace that is the ayah's own (al-Afasy's 35:2 at 0.69, al-Minshawi's
 * 13:2 at 0.70). Together, in files that fit, they mark only al-Husary's
 * teaching 3:127, 3:177, 4:9, 4:10, 4:23, 5:64 and 43:32 and al-Rifai's
 * 8:61 (timed at 21 ms), at 0.57 of the median or under, with words 2.9 s
 * to 87 s outside.
 *
 * A misplaced ayah moves a boundary it shares, and which of its two is
 * wrong cannot be told, so both its neighbours in the surah are taken with
 * it. And where a taken ayah's own words reach more than two seconds into
 * the ayat after it (or before it), those are taken too, as far as they
 * reach: al-Husary's 4:23 is heard into 4:25.
 */
export function misplacedAyat(ayat: readonly AyahCheck[]): string[] {
  const long = ayat.filter((a) => a.words >= 6);
  const paces = long
    .map((a) => (a.to - a.from) / a.words)
    .sort((a, b) => a - b);
  const median = paces[paces.length >> 1];
  const surahOf = (i: number) => ayat[i].key.split(':')[0];
  const taken = new Set<number>();
  ayat.forEach((a, i) => {
    const stray = a.heard
      ? Math.max(a.from - a.heard[0], a.heard[1] - a.to)
      : 0;
    if (
      a.words >= 6 &&
      (a.to - a.from) / a.words < 0.6 * median &&
      stray > STRAY_MS
    )
      for (const j of [i - 1, i, i + 1])
        if (ayat[j] && surahOf(j) === surahOf(i)) taken.add(j);
  });
  // As far as the words of what is taken reach. A Set's loop goes on to
  // what is added while it runs, so this reaches every ayah that is.
  for (const i of taken) {
    const heard = ayat[i].heard;
    if (!heard) continue;
    for (const step of [1, -1])
      for (let j = i + step; ayat[j] && surahOf(j) === surahOf(i); j += step) {
        const into = step > 0 ? heard[1] - ayat[j].from : ayat[j].to - heard[0];
        if (into <= STRAY_MS) break;
        taken.add(j);
      }
  }
  return [...taken].sort((a, b) => a - b).map((i) => ayat[i].key);
}
