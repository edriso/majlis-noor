import { PAGE_COUNT } from '@/data/mushaf';

/**
 * The pages drawn side by side where the room is wide, in reading order,
 * the right-hand page first: as the Mushaf opens, the odd page on the right
 * and the even on the left (page 1 right, page 2 left), the pair holding
 * the page open. A turn of exactly two pages is shown whole instead, so a
 * reader sees all they are to read, even when it starts on an even page and
 * the print would put its two pages on either side of a leaf.
 */
export function spreadOf(
  page: number,
  turn: { first: number; last: number },
): number[] {
  if (turn.last === turn.first + 1 && page >= turn.first && page <= turn.last)
    return [turn.first, turn.last];
  const right = page % 2 === 1 ? page : page - 1;
  return right + 1 <= PAGE_COUNT ? [right, right + 1] : [right];
}

/** How far a finger must travel across the page, at the least and as a
    share of the page's room, before it turns the page. */
const LEAST = 48;
const SHARE = 0.12;

/**
 * What a finger drawn across the page asks for, if anything. It turns the
 * page the way a right-to-left book turns, which is the way the arrow keys
 * go: the next page lies to the left, so the finger draws the page open to
 * the right, as a hand turns a leaf of the Mushaf, and that is forward.
 * Leftward is back. A stroke that is mostly up or down is a scroll, and a
 * short one is a tap or a slip, so neither turns anything.
 */
export function swipeOf({
  dx,
  dy,
  width,
}: {
  dx: number;
  dy: number;
  /** The width of the room the stroke was drawn in. */
  width: number;
}): 'forward' | 'back' | null {
  if (Math.abs(dx) < Math.max(LEAST, width * SHARE)) return null;
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx > 0 ? 'forward' : 'back';
}
