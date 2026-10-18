import { useId, type ReactNode } from 'react';
import { ChevronLeft } from './icons';

/**
 * A choice already made, shown as one row that opens where it is changed:
 * «من أين نبدأ؟» showing «سورة آل عمران» over «الصفحة ٥٠ · الجزء ٣»,
 * «طريقة الحلقة» showing «التتابع · صفحة · يدوي», «عدّل الحلقة». The full
 * width is the target. The chevron points left, the way a right-to-left
 * page goes on.
 *
 * A button, named by what it shows, the title and then the detail, with
 * `spokenSuffix` after them for what pressing it does, so the name a
 * voice-control user reads off the screen still works (WCAG 2.5.3). The
 * parts are joined by reference, which every browser reads as separate
 * words; run together as content, the title's last word and the detail's
 * first could be heard as one.
 */
export function SummaryRow({
  title,
  detail,
  leading,
  spokenSuffix,
  opensDialog = false,
  onClick,
}: {
  /** The row's main words, at body size. */
  title: ReactNode;
  /** A muted line under the title. */
  detail?: ReactNode;
  /** An avatar or an icon before the words, decorative: the words name
      the row. */
  leading?: ReactNode;
  /** Words a screen reader hears after the row's own: «، غيّرها». */
  spokenSuffix?: string;
  /** The row opens a sheet, which a screen reader announces before it is
      pressed. */
  opensDialog?: boolean;
  onClick: () => void;
}) {
  const id = useId();
  const parts = [
    `${id}-title`,
    detail ? `${id}-detail` : null,
    spokenSuffix ? `${id}-more` : null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      className="summary-row"
      aria-labelledby={parts.join(' ')}
      aria-haspopup={opensDialog ? 'dialog' : undefined}
      onClick={onClick}
    >
      {leading ? (
        <span className="summary-row-leading" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="summary-row-text">
        <span className="summary-row-title" id={`${id}-title`}>
          {title}
        </span>
        {detail ? (
          <span className="summary-row-detail" id={`${id}-detail`}>
            {detail}
          </span>
        ) : null}
      </span>
      {spokenSuffix ? (
        <span className="visually-hidden" id={`${id}-more`}>
          {spokenSuffix}
        </span>
      ) : null}
      <ChevronLeft size={20} aria-hidden="true" />
    </button>
  );
}
