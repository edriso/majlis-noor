import { memo, useEffect, useRef, type PointerEvent } from 'react';
import { arabic } from '@/data/arabic';
import type { PageSize } from '@/halaqa/state';
import { MushafPage } from '@/mushaf/MushafPage';
import { spreadOf, swipeOf } from './spread';

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
 * past them: passing the turn is the main button's. A tap on the page does
 * nothing here, and must not: it is kept for choosing an ayah.
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
}: {
  page: number;
  /** The first and last page of the turn: those not dimmed. */
  turnFirst: number;
  turnLast: number;
  size: PageSize;
  prefetch: readonly number[];
  onSwipe: (direction: 'forward' | 'back') => void;
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
              />
            </div>
          ))}
        </div>
      </section>
    </section>
  );
});
