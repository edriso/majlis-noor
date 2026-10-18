/* Who reads what, worked out from nothing but a turn number.

   A halaqa is a circle of readers taking turns; a reader may be a person or
   a recorded reciter, but here they are only seats. Turn `t` belongs to
   reader `t % readers`, always, so the circle goes round in the order it was
   set up and wraps back to the first reader.

   A turn reads a number of units: pages, ayat, hizb quarters or surahs.
   Each unit has its own numbers (pages 1 to 604, ayat 1 to 6236 through the
   whole Mushaf, quarters 1 to 240, surahs 1 to 114), and a turn is a run of
   them. What a turn covers depends on the mode:

     continue  every turn reads the units after the last turn's
               (reader 1: 20, reader 2: 21, reader 3: 22, reader 1: 23 …)
     repeat    every reader reads the same units before the circle moves on
               (reader 1: 20, reader 2: 20, reader 3: 20, reader 1: 21 …)

   Both are counted from an anchor, a turn whose first unit is known.
   Starting a halaqa anchors turn 0 at the chosen place; jumping, or
   changing the settings mid-way, re-anchors the current turn at its new
   place, so the turns before it keep what they were read on and every turn
   after follows on from the new one. Nothing else is stored.

   Whatever the unit, a turn's ayat are a half-open stretch of ayah numbers
   (`rangeOf`), and its pages are the pages that stretch is printed on. The
   Madani print ends every page on a whole ayah, so a turn of whole pages is
   whole ayat too; a turn of a few ayat may run onto the next page, and then
   it has two. */

import {
  AYAH_COUNT,
  firstAyahOfPage,
  PAGE_COUNT,
  pageOfAyah,
  pagesOfRange,
  RUB_COUNT,
  rubOfAyah,
  rubStart,
  SURAH_COUNT,
  surahOfAyah,
  surahRange,
  type AyahRange,
} from '@/data/mushaf';

export type Mode = 'continue' | 'repeat';
export type Unit = 'page' | 'ayah' | 'rub' | 'surah';
/** Whether the seat that starts moves on with each new page or surah. */
export type Rotate = 'none' | 'page' | 'surah';

export type Plan = {
  readers: number;
  mode: Mode;
  unit: Unit;
  /** How many units a turn reads. */
  size: number;
  /** Who starts each page or surah: see `rotates()`. None when left out. */
  rotate?: Rotate;
};

/** A turn and the unit it begins on, from which every other turn is
    counted. `at` is in the plan's unit. */
export type Anchor = { turn: number; at: number };

/** A half-open run of a unit's numbers, `from` read and `to` not. */
export type UnitRange = { from: number; to: number };

/** Just past the last ayah: the end of the Mushaf, as an exclusive end. */
export const END = AYAH_COUNT + 1;

export const UNIT_COUNT: Record<Unit, number> = {
  page: PAGE_COUNT,
  ayah: AYAH_COUNT,
  rub: RUB_COUNT,
  surah: SURAH_COUNT,
};

/** The first ayah of unit `n`, for `n` from 1 to one past the last, which
    begins at the end of the Mushaf. */
export function unitStart(unit: Unit, n: number) {
  const k = Math.min(Math.max(n, 1), UNIT_COUNT[unit] + 1);
  switch (unit) {
    case 'ayah':
      return k;
    case 'page':
      return firstAyahOfPage(k);
    case 'rub':
      return rubStart(k);
    case 'surah':
      return surahRange(k).from;
  }
}

/** The unit that holds ayah `a`; the end of the Mushaf is one past the
    last unit. */
export function unitOf(unit: Unit, a: number) {
  if (a > AYAH_COUNT) return UNIT_COUNT[unit] + 1;
  const k = Math.max(a, 1);
  switch (unit) {
    case 'ayah':
      return k;
    case 'page':
      return pageOfAyah(k);
    case 'rub':
      return rubOfAyah(k);
    case 'surah':
      return surahOfAyah(k);
  }
}

/** The first unit that begins at ayah `a` or after it. */
export function unitAfter(unit: Unit, a: number) {
  const n = unitOf(unit, a);
  return unitStart(unit, n) < a ? n + 1 : n;
}

export const readerOf = (plan: Plan, turn: number) =>
  ((turn % plan.readers) + plan.readers) % plan.readers;

/** Which round of the circle a turn falls in; in repeat mode, a round is
    everyone reading the same units once. */
export const roundOf = (plan: Plan, turn: number) =>
  Math.floor(turn / plan.readers);

/* Swapping who starts. Two readers alternating single ayat would otherwise
   have the same reader open every page whose ayat come out even, so the
   circle may ask for the seat after the last page's first reader to open
   the next page (or surah). That is the one rule that the reader of a turn
   cannot follow from `turn % readers` alone, so the turn counter skips
   forward instead: at the first turn that begins on a new page, it jumps to
   the next number that belongs to the seat that should start, and the
   numbers passed over belong to nobody. The reader is still the turn modulo
   the circle, and the turns before stay exactly as they were read, so
   stepping back across the line returns to them.

   It is worked out here, from the anchor, rather than by re-anchoring at
   every page, so that nothing about the past has to be stored: the turns
   since the anchor fall into stretches, one per page (or surah), and each
   stretch's first turn says who starts the next. The anchor's own turn
   opens the first stretch, so a jump or a change to the circle starts the
   alternation afresh from whoever has the turn. */

/** Whether the plan swaps who starts: only when turns follow on (repeat
    mode reads the same ayat in a fixed order anyway), with someone to swap
    with, and with turns smaller than the page or surah they cross. */
export const rotates = (plan: Plan) =>
  plan.mode === 'continue' &&
  plan.readers > 1 &&
  plan.rotate !== undefined &&
  plan.rotate !== 'none';

/** The page or surah a unit begins in, as rotation counts them. */
function lineOf(plan: Plan, at: number) {
  const a = unitStart(plan.unit, at);
  return plan.rotate === 'page' ? pageOfAyah(a) : surahOfAyah(a);
}

/** The first unit that begins past the page or surah `line`. */
function pastLine(plan: Plan, line: number) {
  const last = plan.rotate === 'page' ? PAGE_COUNT : SURAH_COUNT;
  if (line >= last) return UNIT_COUNT[plan.unit] + 1;
  const a =
    plan.rotate === 'page'
      ? firstAyahOfPage(line + 1)
      : surahRange(line + 1).from;
  return unitAfter(plan.unit, a);
}

type Stretch = {
  /** The turn that opens the stretch, and the unit it begins on. */
  first: number;
  at: number;
  /** How many turns begin within it. */
  count: number;
  /** The turn and unit that open the next one. */
  nextFirst: number;
  nextAt: number;
};

function stretchFrom(plan: Plan, first: number, at: number): Stretch {
  // Past the end of the Mushaf nobody reads, and nobody needs to swap.
  if (at > UNIT_COUNT[plan.unit])
    return { first, at, count: Infinity, nextFirst: Infinity, nextAt: at };
  const count = Math.ceil((pastLine(plan, lineOf(plan, at)) - at) / plan.size);
  const nextAt = at + count * plan.size;
  const following = first + count;
  if (nextAt > UNIT_COUNT[plan.unit])
    return { first, at, count, nextFirst: following, nextAt };
  // The seat after the one that opened this stretch opens the next.
  const want = readerOf(plan, first + 1);
  const skip = (want - readerOf(plan, following) + plan.readers) % plan.readers;
  return { first, at, count, nextFirst: following + skip, nextAt };
}

type Located = {
  /** The unit the turn begins on, or null for a number nobody reads. */
  at: number | null;
  /** The turn read before it, and the one after. */
  previous: number;
  next: number;
};

function locate(plan: Plan, anchor: Anchor, turn: number): Located {
  if (!rotates(plan) || turn < anchor.turn) {
    const steps =
      plan.mode === 'continue'
        ? turn - anchor.turn
        : roundOf(plan, turn) - roundOf(plan, anchor.turn);
    return {
      at: anchor.at + steps * plan.size,
      previous: turn - 1,
      next: turn + 1,
    };
  }
  let previous = anchor.turn - 1;
  let s = stretchFrom(plan, anchor.turn, anchor.at);
  for (;;) {
    const last = s.first + s.count - 1;
    if (turn < s.first) return { at: null, previous, next: s.first };
    if (turn <= last)
      return {
        at: s.at + (turn - s.first) * plan.size,
        previous: turn === s.first ? previous : turn - 1,
        next: turn === last ? s.nextFirst : turn + 1,
      };
    previous = last;
    s = stretchFrom(plan, s.nextFirst, s.nextAt);
  }
}

/**
 * The first unit a turn reads. May fall outside the Mushaf: past the end is
 * how the end shows itself, and the caller decides what to do with a turn
 * there. Null for a turn number skipped when the starter swaps.
 */
export const startOf = (plan: Plan, anchor: Anchor, turn: number) =>
  locate(plan, anchor, turn).at;

/** The turn after this one: the next number, unless swapping who starts
    skips some. */
export const turnAfter = (plan: Plan, anchor: Anchor, turn: number) =>
  locate(plan, anchor, turn).next;

/** The turn before this one, across any numbers skipped to swap who
    starts, so stepping back returns to exactly the turn that was read. */
export const turnBefore = (plan: Plan, anchor: Anchor, turn: number) =>
  locate(plan, anchor, turn).previous;

/**
 * The units a turn reads, cut short at the start and the end of the Mushaf
 * and at `end`, an exclusive ayah where the sitting stops: a unit counts if
 * it begins before it. Empty (`from === to`) for a turn with nothing left.
 */
export function unitsOf(
  plan: Plan,
  anchor: Anchor,
  turn: number,
  end = END,
): UnitRange {
  const at = startOf(plan, anchor, turn);
  if (at === null || end <= 1) return { from: 0, to: 0 };
  const limit = Math.min(
    UNIT_COUNT[plan.unit] + 1,
    unitOf(plan.unit, Math.min(end, END) - 1) + 1,
  );
  const from = Math.max(at, 1);
  const to = Math.min(at + plan.size, limit);
  return to > from ? { from, to } : { from, to: from };
}

/**
 * The ayat a turn reads, as a half-open range of ayah numbers through the
 * whole Mushaf, cut as `unitsOf` cuts it and, inside a unit, at `end`.
 */
export function rangeOf(
  plan: Plan,
  anchor: Anchor,
  turn: number,
  end = END,
): AyahRange {
  const units = unitsOf(plan, anchor, turn, end);
  const from = Math.min(unitStart(plan.unit, units.from), end);
  if (units.to <= units.from) return { from, to: from };
  return { from, to: Math.min(unitStart(plan.unit, units.to), end) };
}

/** The pages a turn's ayat are printed on, in order. */
export const pagesOf = (plan: Plan, anchor: Anchor, turn: number, end = END) =>
  pagesOfRange(rangeOf(plan, anchor, turn, end));

/** A turn that would end before the first unit, which cannot be stepped
    back to. */
export function isBeforeStart(plan: Plan, anchor: Anchor, turn: number) {
  const at = startOf(plan, anchor, turn);
  return at !== null && at + plan.size <= 1;
}

/** Re-anchors a halaqa so that `turn` begins on unit `at`. */
export const anchorAt = (turn: number, at: number): Anchor => ({ turn, at });

export type RoundSeat = {
  turn: number;
  reader: number;
  state: 'done' | 'now' | 'waiting' | 'skipped';
};

/**
 * Repeat mode's round: every reader against the units this round is on, as
 * the circle marks them. A reader whose turn in this round came before the
 * anchor did not read them (the halaqa jumped here after them), so they are
 * shown as skipped rather than ticked.
 */
export function round(plan: Plan, anchor: Anchor, turn: number): RoundSeat[] {
  const start = roundOf(plan, turn) * plan.readers;
  return Array.from({ length: plan.readers }, (_, i) => {
    const t = start + i;
    const state =
      t === turn
        ? 'now'
        : t > turn
          ? 'waiting'
          : t < anchor.turn
            ? 'skipped'
            : 'done';
    return { turn: t, reader: i, state };
  });
}

/** Whether finishing this turn completes a round, which in repeat mode is
    when the circle moves on to new units. */
export const endsRound = (plan: Plan, turn: number) =>
  readerOf(plan, turn) === plan.readers - 1;
