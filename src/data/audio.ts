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
   - How a file the host serves today differs from the one the timings
     were made from (`fileChange`), for scripts/check-audio.ts. */

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

/** A surah file as the host serves it: its length in bytes, and its
    `last-modified` as an ISO date to the second. */
export type FileStamp = [bytes: number, modified: string];

/**
 * The stamp of a file from the host's answer to a HEAD request (the whole
 * length in `content-length`) or to a request for its first byte (the
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

/** How the file served today differs from the one timed, or null if it
    is the same file. */
export function fileChange(
  timed: FileStamp,
  served: FileStamp | null,
): string | null {
  if (!served) return 'served without a length or a date';
  const changes = [];
  if (served[0] !== timed[0])
    changes.push(`length ${timed[0]} is now ${served[0]}`);
  if (served[1] !== timed[1])
    changes.push(`last modified ${timed[1]} is now ${served[1]}`);
  return changes.length ? changes.join(', ') : null;
}
