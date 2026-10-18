import { useEffect, useRef } from 'react';
import { endTitle, sittingNote } from '@/halaqa/labels';
import type { Unit } from '@/halaqa/schedule';

/**
 * What replaces the page and the buttons once nothing is left to read: the
 * khatm, with a new one from al-Fatihah, or the goal the sitting set
 * itself, with «تابعوا» to read on past it. Either may end the sitting.
 *
 * The buttons it replaces go with the focus a keyboard had on them, so the
 * card takes it, on its first action; a sheet open over it keeps its own.
 */
export function Completion({
  end,
  unit,
  pagesRead,
  ayatRead,
  onRestart,
  onCarryOn,
  onEnd,
}: {
  end: 'khatm' | 'goal';
  unit: Unit;
  pagesRead: number;
  ayatRead: number;
  onRestart: () => void;
  onCarryOn: () => void;
  onEnd: () => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const at = document.activeElement;
    if (!at || at === document.body) first.current?.focus();
  }, [end]);

  const read = pagesRead || ayatRead;
  return (
    <div className="khatm" data-end={end}>
      <p className="khatm-ornament" aria-hidden="true">
        ۞
      </p>
      <h2 className="khatm-title">{endTitle(end)}</h2>
      <p className="khatm-text">
        تقبّل الله منكم.
        {read ? ` ${sittingNote(unit, pagesRead, ayatRead)}.` : ''}
      </p>
      <div className="khatm-actions">
        <button
          ref={first}
          type="button"
          className="button button-primary"
          onClick={end === 'khatm' ? onRestart : onCarryOn}
        >
          {end === 'khatm' ? 'ختمة جديدة من الفاتحة' : 'تابعوا'}
        </button>
        <button type="button" className="button button-quiet" onClick={onEnd}>
          إنهاء المجلس
        </button>
      </div>
    </div>
  );
}
