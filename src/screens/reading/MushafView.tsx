import { memo, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from '@/components/icons';
import { arabic } from '@/data/arabic';
import { PAGE_COUNT } from '@/data/mushaf';
import { MushafPage } from '@/mushaf/MushafPage';

/**
 * The Mushaf page, as large as its room allows, and the row that turns it.
 *
 * Drawn again only when the page or what it prefetches changes, never as a
 * turn's time runs or its recitation pauses: its props are the page and
 * callbacks that stay the same.
 */
export const MushafView = memo(function MushafView({
  page,
  prefetch,
  onPrevious,
  onNext,
  onJump,
}: {
  page: number;
  prefetch: readonly number[];
  onPrevious: () => void;
  onNext: () => void;
  onJump: () => void;
}) {
  const stage = useRef<HTMLElement>(null);

  /* A new page starts at its first line, on the rare screen too short to
     show it whole, where the reader finished at the foot of the last one. */
  useEffect(() => {
    stage.current?.scrollTo({ top: 0 });
  }, [page]);

  return (
    <section className="mushaf-view" aria-label="المصحف">
      {/* The stage is the room the page has. The page takes the most of it
          its shape allows, so it is never scrolled; only on a screen too
          short to read it whole (a phone on its side) is it kept at a
          readable size and scrolled, and then the stage is a tab stop,
          since text a keyboard cannot reach is text a keyboard cannot
          read. */}
      <section
        ref={stage}
        className="mushaf-stage"
        tabIndex={0}
        aria-label={`صفحة المصحف ${arabic(page)}`}
      >
        <MushafPage page={page} prefetch={prefetch} />
      </section>
      <nav className="page-nav" aria-label="تقليب الصفحات">
        <button
          type="button"
          className="quiet-button"
          onClick={onPrevious}
          aria-disabled={page <= 1}
          aria-label={
            page > 1 ? `السابقة، الصفحة ${arabic(page - 1)}` : 'السابقة'
          }
        >
          <ChevronRight size={20} aria-hidden="true" />
          <span aria-hidden="true">السابقة</span>
        </button>
        <button
          type="button"
          className="quiet-button page-nav-number"
          onClick={onJump}
          aria-label={`${arabic(page)} من ${arabic(PAGE_COUNT)}، انتقل إلى موضع آخر`}
        >
          {arabic(page)} من {arabic(PAGE_COUNT)}
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={onNext}
          aria-disabled={page >= PAGE_COUNT}
          aria-label={
            page < PAGE_COUNT
              ? `التالية، الصفحة ${arabic(page + 1)}`
              : 'التالية'
          }
        >
          <span aria-hidden="true">التالية</span>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      </nav>
    </section>
  );
});
