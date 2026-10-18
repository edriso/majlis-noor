import { useEffect, useMemo, useState } from 'react';
import { ayahIndex, type AyahRange } from '@/data/mushaf';
import {
  ayahAt,
  ayahTimes,
  loadWords,
  surahAudioUrl,
  wordAt,
  wordsCovered,
  type SurahWords,
  type Timings,
} from '@/data/timings';
import type { Follow } from '@/halaqa/state';
import { usePlaybackPosition } from '@/halaqa/usePlaybackPosition';
import type { Recited } from './MushafPage';

/** How far ahead of the recording the mark moves. Timings are good to
    about 300ms either way; a mark a moment early, fading in over 160ms
    (marks.css), is fully drawn as the word is heard, where one a moment
    late reads as the page lagging behind the voice. */
export const LEAD_MS = 150;

/** Where in a list whose starts never go back the items started by `ms`
    end: how many have. */
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

/** The ayah of a surah recited `ms` into its file, and in the pause
    between two ayat the one just recited, so the mark stays where the
    reader's eye is until the next begins. Null before the first, after
    the last, and wherever `ayahAt` will not say (a surah not timed, an
    ayah misplaced). */
function heldAyah(t: Timings, surah: number, ms: number) {
  const n = ayahAt(t, surah, ms);
  if (n !== null) return n;
  const spans = ayahTimes(t, surah);
  const started = startedBy(spans, ([from]) => from, ms);
  if (started === 0 || started === spans.length) return null;
  return ayahAt(t, surah, spans[started - 1][0]);
}

/** The word of ayah `n` heard by `ms`: the one being recited, or between
    two the last one heard, or before the first its first. */
function heldWord(words: SurahWords, n: number, ms: number) {
  const now = wordAt(words, ms);
  if (now?.ayah === n) return now.word;
  const last = words.timeline[startedBy(words.timeline, (x) => x.from, ms) - 1];
  if (last?.ayah === n) return last.word;
  return words.ayat[n - 1]?.words[0]?.word ?? null;
}

/**
 * What is being recited `ms` into a surah's file, a moment ahead
 * (`LEAD_MS`): the ayah, by its number through the whole Mushaf, and with
 * `words` (the reciter's words in that surah) the word, where every word
 * of the ayah is timed; elsewhere the ayah whole.
 *
 * `within`, the ayat being played, keeps the lead from reaching an ayah
 * after them in the last moment of the last one.
 */
export function recitedAt(
  t: Timings,
  surah: number,
  ms: number,
  words: SurahWords | null = null,
  within: AyahRange | null = null,
): Recited | null {
  const inside = (n: number | null) =>
    n !== null &&
    (!within ||
      (ayahIndex(surah, n) >= within.from && ayahIndex(surah, n) < within.to));
  let at = ms + LEAD_MS;
  let n = heldAyah(t, surah, at);
  if (!inside(n)) {
    at = ms;
    n = heldAyah(t, surah, at);
    if (!inside(n)) return null;
  }
  const ayah = n!;
  const word =
    words?.surah === surah && wordsCovered(words, ayah)
      ? heldWord(words, ayah, at)
      : null;
  return { ayah: ayahIndex(surah, ayah), word };
}

/* Which surah each address is, per reciter, worked out once. */
const surahsByUrl = new WeakMap<Timings, Map<string, number>>();

/** The surah whose file `url` is, by these timings, or null. */
export function surahOfUrl(t: Timings, url: string) {
  let map = surahsByUrl.get(t);
  if (!map) {
    map = new Map(
      Array.from({ length: 114 }, (_, i) => [surahAudioUrl(t, i + 1), i + 1]),
    );
    surahsByUrl.set(t, map);
  }
  return map.get(url) ?? null;
}

/** A reciter's words in one surah, once loaded; null until then, and for
    good if they cannot load, which leaves the ayah marked whole. */
function useSurahWords(reciter: string | null, surah: number | null) {
  const [loaded, setLoaded] = useState<{
    key: string;
    words: SurahWords;
  } | null>(null);
  const key = reciter && surah ? `${reciter}/${surah}` : null;
  useEffect(() => {
    if (!reciter || !surah) return;
    let live = true;
    loadWords(reciter, surah).then(
      (words) => live && setLoaded({ key: `${reciter}/${surah}`, words }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [reciter, surah]);
  return loaded && loaded.key === key ? loaded.words : null;
}

/**
 * The ayah, or the word, the recitation `key` is reciting, for the page to
 * mark (`MushafPage`'s `recited`): a seated reciter's turn
 * (`recitation.key`), «استمع» (`listen.key`) or an ayah heard alone
 * (`ayah.key`), each with the timings of the reciter it plays. Null while
 * nothing plays under that key, while it is paused, and where the timings
 * cannot say.
 *
 * With `follow` set to 'word' it loads the reciter's words in the surah
 * being recited and gives the word, falling back to the ayah where his
 * timings do not hold all of its words, and until they have loaded.
 *
 * The position moves on every frame, and so is drawn again whatever calls
 * this (`usePlaybackPosition`): call it in a small component that draws
 * the page and nothing else. What it returns is the same object until the
 * ayah or the word changes, and the page compares it by value, so the page
 * itself is drawn again only then.
 */
export function useFollow({
  key,
  reciter,
  timings,
  follow,
  within = null,
}: {
  /** The recitation to follow; null or empty follows nothing. */
  key: string | null;
  /** Whose words to load when following the word. */
  reciter: string | null;
  timings: Timings | null | undefined;
  follow: Follow;
  /** The ayat being played, if not whole pages. */
  within?: AyahRange | null;
}): Recited | null {
  const position = usePlaybackPosition(key && timings ? key : null);
  const surah = position && timings ? surahOfUrl(timings, position.url) : null;
  const words = useSurahWords(follow === 'word' ? reciter : null, surah);
  const now =
    position && timings && surah
      ? recitedAt(timings, surah, position.ms, words, within)
      : null;
  const ayah = now?.ayah ?? null;
  const word = now?.word ?? null;
  return useMemo(() => (ayah === null ? null : { ayah, word }), [ayah, word]);
}
