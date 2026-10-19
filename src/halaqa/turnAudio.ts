/* A turn's ayat as a reciter's recording has them: what to play, whether it
   can be played, and how long a reader is given for it.

   A turn of whole pages is played page by page from the pages' stretches,
   as it always was. A turn that covers part of a page (a few ayat, a
   quarter, a surah) plays exactly its ayat, split at every page and every
   surah file, so each stretch the player queues carries the page it
   recites and the page on screen follows the recitation onto the next. */

import {
  ayatOfPage,
  isWholePages,
  pagesOfRange,
  verseKey,
  type AyahRange,
} from '@/data/mushaf';
import {
  ayatDuration,
  ayatRecitation,
  ayatTimed,
  pagesDuration,
  pageTimed,
  recitationOf,
  surahAudioUrl,
  type Segment,
  type Timings,
} from '@/data/timings';
import type { Unit } from './schedule';

/** The share of `range` printed on each of its pages, and whether that is
    the whole page. */
function perPage(range: AyahRange) {
  return pagesOfRange(range).map((page) => {
    const all = ayatOfPage(page);
    const from = Math.max(range.from, all.from);
    const to = Math.min(range.to, all.to);
    return { page, from, to, whole: from === all.from && to === all.to };
  });
}

/** Whether every ayah of `range` can be played in the reciter's voice:
    a recording that does not fit its timings is never played (see
    timings.ts), so a turn holding any of it is not recited at all. */
export function rangeTimed(t: Timings, range: AyahRange) {
  return perPage(range).every((p) =>
    p.whole
      ? pageTimed(t, p.page)
      : ayatTimed(t, verseKey(p.from), verseKey(p.to - 1)),
  );
}

/** The stretches that recite `range`, in order, each with its page. None
    for an empty range, or for one that is not timed: heard whole or not at
    all. */
export function rangeRecitation(t: Timings, range: AyahRange): Segment[] {
  if (!rangeTimed(t, range)) return [];
  return perPage(range).flatMap((p) =>
    p.whole
      ? recitationOf(t, [p.page])
      : ayatRecitation(t, verseKey(p.from), verseKey(p.to - 1)).map((s) => ({
          url: surahAudioUrl(t, s.surah),
          from: s.from,
          to: s.to,
          page: p.page,
        })),
  );
}

/**
 * Milliseconds the reciter takes over a turn, which a reader's timed turn
 * is given (before the circle's allowance). A turn of whole pages is timed
 * by its pages, as before; any other (one that begins at a surah part-way
 * down a page among them) by exactly its ayat. Where he is not
 * timed on them, the turn's whole pages stand in, which may give a reader
 * too long but never cuts one off: they say «تمّ».
 */
export function turnDuration(t: Timings, unit: Unit, range: AyahRange) {
  if (range.to <= range.from) return 0;
  const pages = pagesOfRange(range);
  if (unit === 'page' && isWholePages(range)) return pagesDuration(t, pages);
  return (
    ayatDuration(t, verseKey(range.from), verseKey(range.to - 1)) ??
    pagesDuration(t, pages)
  );
}
