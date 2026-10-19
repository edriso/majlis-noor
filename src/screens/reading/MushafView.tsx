import { memo, useEffect, useRef, type PointerEvent } from 'react';
import { arabic } from '@/data/arabic';
import type { AyahRange } from '@/data/mushaf';
import type { PageSize } from '@/halaqa/state';
import { MemoryCover } from '@/mushaf/MemoryCover';
import { MushafPage } from '@/mushaf/MushafPage';
import { useFollow } from '@/mushaf/useFollow';
import { spreadOf, swipeOf } from './spread';
import type { FollowSource } from './useMarks';

/**
 * The Mushaf, as large as its room allows: one page fitted whole, or, where
 * the room is wider than 1.2 times its height, two side by side as the
 * Mushaf opens (`spreadOf`), the page outside the turn drawn quietly
 * dimmed. Whether there is room for two is the room's own shape, decided
 * in CSS (stage.css), so both pages are in the tree and the one beside is
 * hidden where there is no room for it. With the page drawn as wide as the
 * screen (`size` «width»), one page, scrolled down.
 *
 * A finger drawn across the page turns between the turn's own pages, never
 * past them: passing the turn is the main button's. A tap on a word chooses
 * its ayah (`onAyahTap`); the page tells the two apart, and the pointer is
 * never captured here, so a tap's click reaches the word it was on.
 *
 * On the pages: the turn's ayat underlined where it covers part of a page,
 * the ayah or word being recited, the ayah chosen, and in a review from
 * memory a cover over them (`cover`).
 *
 * Drawn again only when the page or what it prefetches changes, never as a
 * turn's time runs or its recitation pauses.
 */
export const MushafView = memo(function MushafView({
  page,
  turnFirst,
  turnLast,
  size,
  prefetch,
  onSwipe,
  turn,
  follow,
  selected,
  onAyahTap,
  cover,
}: {
  page: number;
  /** The first and last page of the turn: those not dimmed. */
  turnFirst: number;
  turnLast: number;
  size: PageSize;
  prefetch: readonly number[];
  onSwipe: (direction: 'forward' | 'back') => void;
  /** The turn's ayat, where it covers part of a page. */
  turn: AyahRange | null;
  /** The recitation the pages follow. */
  follow: FollowSource;
  selected: number | null;
  onAyahTap: (ayah: number, word: number | null) => void;
  /** Covers the pages for a review from memory; a new value covers them
      again. */
  cover: string | null;
}) {
  const stage = useRef<HTMLElement>(null);
  const stroke = useRef<{ id: number; x: number; y: number } | null>(null);
  const fingers = useRef(new Set<number>());

  /* A new page starts at its first line, where the page is taller than its
     room (drawn as wide as the screen, or a phone on its side). */
  useEffect(() => {
    stage.current?.scrollTo({ top: 0 });
  }, [page]);

  const pages =
    size === 'width'
      ? [page]
      : spreadOf(page, { first: turnFirst, last: turnLast });

  /* One finger, or a mouse, drawn across: a second finger is a pinch, and
     whatever it was is no longer a stroke. */
  const down = (e: PointerEvent) => {
    fingers.current.add(e.pointerId);
    stroke.current =
      fingers.current.size === 1 && e.isPrimary
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : null;
  };
  const up = (e: PointerEvent) => {
    fingers.current.delete(e.pointerId);
    const s = stroke.current;
    stroke.current = null;
    if (!s || s.id !== e.pointerId) return;
    const way = swipeOf({
      dx: e.clientX - s.x,
      dy: e.clientY - s.y,
      width: stage.current?.clientWidth ?? 0,
    });
    if (way) onSwipe(way);
  };
  const cancel = (e: PointerEvent) => {
    fingers.current.delete(e.pointerId);
    stroke.current = null;
  };

  return (
    <section className="mushaf-view" aria-label="المصحف">
      {/* The stage is the room the pages have. Where they are taller than
          it, it scrolls, and is then a tab stop, since text a keyboard
          cannot reach is text a keyboard cannot read. */}
      <section
        ref={stage}
        className="mushaf-stage"
        data-size={size}
        tabIndex={0}
        aria-label={`المصحف، الصفحة ${arabic(page)}`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={cancel}
      >
        <MemoryCover cover={cover} pages={pages.length === 2 ? 2 : 1}>
          <Spread
            pages={pages}
            page={page}
            turnFirst={turnFirst}
            turnLast={turnLast}
            prefetch={prefetch}
            turn={turn}
            follow={follow}
            selected={selected}
            onAyahTap={onAyahTap}
          />
        </MemoryCover>
      </section>
    </section>
  );
});

/**
 * The pages, following the recitation. Where it is moves on every frame,
 * so this is drawn again on every frame while it plays (`useFollow`), and
 * nothing else is: the pages are drawn again only when the ayah or the
 * word recited changes.
 */
function Spread({
  pages,
  page,
  turnFirst,
  turnLast,
  prefetch,
  turn,
  follow,
  selected,
  onAyahTap,
}: {
  pages: readonly number[];
  page: number;
  turnFirst: number;
  turnLast: number;
  prefetch: readonly number[];
  turn: AyahRange | null;
  follow: FollowSource;
  selected: number | null;
  onAyahTap: (ayah: number, word: number | null) => void;
}) {
  const recited = useFollow(follow);
  return (
    <div className="mushaf-spread" data-pages={pages.length}>
      {pages.map((p) => (
        <div
          key={p}
          className="mushaf-leaf"
          data-current={p === page || undefined}
          data-dim={p < turnFirst || p > turnLast || undefined}
        >
          <MushafPage
            page={p}
            prefetch={p === page ? prefetch : undefined}
            turn={turn}
            recited={recited}
            selected={selected}
            onAyahTap={onAyahTap}
          />
        </div>
      ))}
    </div>
  );
}
