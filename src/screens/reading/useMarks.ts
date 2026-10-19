import { useCallback, useMemo, useState } from 'react';
import { isWholePages, type AyahRange } from '@/data/mushaf';
import type { Prefs } from '@/halaqa/state';
import type { Turn } from './useTurn';

/** What the page follows: the recitation playing under `key`, by the
    timings of the sheikh reciting it, inside the ayat it plays. */
export type FollowSource = {
  key: string | null;
  reciter: string;
  timings: Turn['timings'][string];
  follow: Prefs['follow'];
  within: AyahRange | null;
};

/** An ayah chosen on the page, and the word tapped, if one was; and
    where the ayah bar docks, at the foot of the room or, where the ayah
    is low on the page and the bar would cover it, at its top. */
export type Chosen = {
  ayah: number;
  word: number | null;
  dock: 'top' | 'bottom';
};

/** Whether an ayah's last line is in the lower part of the room the page
    has, where a bar docked at its foot would cover it. Read from the page
    as drawn, when it is tapped. */
function lowOnPage(ayah: number) {
  const words = document.querySelectorAll(
    `.mushaf-spread [data-ayah="${ayah}"]`,
  );
  const room = document.querySelector('.mushaf-stage');
  const last = words[words.length - 1];
  if (!last || !room) return false;
  const box = room.getBoundingClientRect();
  return last.getBoundingClientRect().bottom > box.top + box.height * 0.55;
}

/**
 * What the reading screen marks on the page and what a tap on it does:
 *
 * - `turn`, the turn's ayat to underline, only where a turn of ayat, a
 *   quarter or a surah covers part of a page. A turn of whole pages would
 *   underline every line, which says nothing and crowds the page; a turn
 *   of pages begun at a surah part-way down one is not underlined either,
 *   since the surah's header already shows where it begins.
 * - `follow`, the recitation to follow: an ayah heard alone first, since it
 *   plays over the rest, then a seated sheikh's turn, then «استمع».
 * - `chosen`, the ayah tapped, for the ayah bar; it belongs to the turn and
 *   the page it was chosen on, and is gone when either changes.
 *
 * Each is the same value while it means the same, so the page, which is
 * drawn again only when what it is given changes, is not drawn for
 * nothing.
 */
export function useMarks(turn: Turn, prefs: Prefs) {
  const { range, page, unit, reciter, ayah, listen, timings } = turn;
  const config = turn.session.config;

  const whole = unit === 'page' || isWholePages(range);
  const turnFrom = whole ? 0 : range.from;
  const turnTo = whole ? 0 : range.to;
  const turnMark = useMemo(
    () => (turnTo > turnFrom ? { from: turnFrom, to: turnTo } : null),
    [turnFrom, turnTo],
  );

  const scope = `${turn.turnKey}:${page}`;
  const [picked, setPicked] = useState<(Chosen & { scope: string }) | null>(
    null,
  );
  const chosen = picked?.scope === scope ? picked : null;
  const choose = useCallback(
    (ayah: number, word: number | null) =>
      setPicked({
        ayah,
        word,
        scope,
        dock: lowOnPage(ayah) ? 'top' : 'bottom',
      }),
    [scope],
  );
  const unchoose = useCallback(() => setPicked(null), []);

  // Which recitation, by whose timings, over which ayat.
  const alone = ayah.key && chosen;
  const sheikh = alone ? config.reciter : reciter ? reciter.id : config.reciter;
  const key = alone ? ayah.key : reciter ? turn.recitation.key : listen.key;
  const from = alone ? chosen.ayah : reciter ? range.from : listen.range.from;
  const to = alone ? chosen.ayah + 1 : reciter ? range.to : listen.range.to;
  const sheikhTimings = timings[sheikh];
  const follow = useMemo<FollowSource>(
    () => ({
      key: key || null,
      reciter: sheikh,
      timings: sheikhTimings,
      follow: prefs.follow,
      within: to > from ? { from, to } : null,
    }),
    [key, sheikh, sheikhTimings, prefs.follow, from, to],
  );

  return {
    turn: turnMark,
    follow,
    chosen: chosen
      ? { ayah: chosen.ayah, word: chosen.word, dock: chosen.dock }
      : null,
    choose,
    unchoose,
    /** The page is covered on a person's turn when the circle reviews from
        memory; a new turn covers it again. */
    cover:
      config.fromMemory && !turn.end && turn.member.kind === 'person'
        ? turn.turnKey
        : null,
  };
}
