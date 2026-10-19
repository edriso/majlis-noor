import { useEffect, useRef } from 'react';
import { endTitle, sittingNote } from '@/halaqa/labels';
import type { Unit } from '@/halaqa/schedule';

/** The diamond the Mushaf's surah headers carry either side of the name. */
function Diamond() {
  return (
    <svg className="khatm-diamond" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 21 12 12 21 3 12Z" />
      <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" />
    </svg>
  );
}

/**
 * What replaces the page and the buttons once nothing is left to read: the
 * khatm, with a new one from al-Fatihah, or the goal the sitting set
 * itself, with «تابعوا» to read on past it. Either may end the sitting.
 * One quiet family: no card, the title in the Mushaf's own cartouche (as
 * a surah's header is drawn on the page) for the khatm, under a single
 * diamond for the goal, and two buttons.
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
      {end === 'khatm' ? (
        <div className="khatm-cartouche">
          <Diamond />
          <h2 className="khatm-title">{endTitle(end)}</h2>
          <Diamond />
        </div>
      ) : (
        <>
          <div className="khatm-rule" aria-hidden="true">
            <Diamond />
          </div>
          <h2 className="khatm-title">{endTitle(end)}</h2>
        </>
      )}
      <p className="khatm-text">
        تقبّل الله منكم.
        {read ? ` ${sittingNote(unit, pagesRead, ayatRead)}.` : ''}
      </p>
      <div className="khatm-actions">
        <button
          ref={first}
          type="button"
          className="button button-primary button-large"
          onClick={end === 'khatm' ? onRestart : onCarryOn}
        >
          {end === 'khatm' ? 'ختمة جديدة من الفاتحة' : 'تابعوا'}
        </button>
        <button type="button" className="button khatm-end" onClick={onEnd}>
          إنهاء المجلس
        </button>
      </div>
    </div>
  );
}
