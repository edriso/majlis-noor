import { useRef, useState, type ReactNode } from 'react';
import { BookOpen } from '@/components/icons';

/**
 * A review from memory: the page, or both pages of a spread, under a calm
 * cover that asks the reader to recite without looking, with one button
 * to uncover it and check.
 *
 * It covers whenever `cover` changes to a new value (the reading screen
 * gives each person's turn its own) and stays uncovered, once uncovered,
 * until then; null never covers. Under the cover the page is still drawn,
 * so uncovering it is instant, but it cannot be seen, reached or read out:
 * a screen reader reading the page would be reading it for them.
 */
export function MemoryCover({
  cover,
  pages = 1,
  children,
}: {
  /** A new value covers the page again; null leaves it uncovered. */
  cover: string | null;
  /** 2 where it covers a spread, which shows two pages only where the
      room is wide enough (stage.css): the button's words follow what the
      room shows (marks.css). */
  pages?: 1 | 2;
  children: ReactNode;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const covered = cover !== null && shown !== cover;
  const content = useRef<HTMLDivElement>(null);

  return (
    <div className="memory-cover" data-covered={covered || undefined}>
      {/* Takes the focus when uncovered, since the button that had it is
          gone, so the keyboard carries on from the page. */}
      <div
        ref={content}
        className="memory-cover-content"
        tabIndex={-1}
        inert={covered}
      >
        {children}
      </div>
      {covered ? (
        <div className="memory-cover-panel">
          <BookOpen size={32} aria-hidden="true" />
          <p className="memory-cover-title">اقرأ من حفظك</p>
          <button
            type="button"
            className="button button-primary"
            onClick={() => {
              setShown(cover);
              // After the cover is gone and the page can take it.
              requestAnimationFrame(() => content.current?.focus());
            }}
          >
            {pages === 2 ? (
              <>
                <span className="memory-cover-one">اكشف الصفحة</span>
                <span className="memory-cover-two">اكشف الصفحتين</span>
              </>
            ) : (
              'اكشف الصفحة'
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
