/* What scripts/build-timings.ts writes and the app reads about a reciter's
   recordings, kept apart from timings.ts because the script runs in Node
   without Vite: each form is written and read by functions that sit side
   by side here, so the two cannot drift apart.

   - The address of a surah's file. A reciter's recordings are one file per
     surah, and his timings keep one address for all of them with the surah
     number as a placeholder. Quran.com names some reciters' files by the
     bare number (68.mp3) and others by three digits (068.mp3), so the
     placeholder says which: `{n}` or `{nnn}`.
   - A surah's ayah times, in a compact form (`encodeSpans`). */

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
