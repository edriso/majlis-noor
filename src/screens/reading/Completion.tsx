import { useEffect, useRef } from 'react';
import { Undo2 } from '@/components/icons';
import { endTitle, sittingNote } from '@/halaqa/labels';
import type { Unit } from '@/halaqa/schedule';

/** What the sitting read, in its own unit, or in ayat where it read
    fewer than a page (a goal reached part-way down one): never «no page
    read yet» after eleven ayat. Null when it read nothing. */
function readNote(
  unit: Unit,
  pagesRead: number,
  ayatRead: number,
  alone: boolean,
) {
  if (unit === 'page' && pagesRead)
    return sittingNote('page', pagesRead, 0, alone);
  if (ayatRead) return sittingNote('ayah', 0, ayatRead, alone);
  return null;
}

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
 * One reading alone is spoken to as one: «بلغتَ», «تقبّل الله منك»,
 * «تابع».
 * One quiet family: no card, the title in the Mushaf's own cartouche (as
 * a surah's header is drawn on the page) for the khatm, under a single
 * diamond for the goal, and two buttons. The title is said here alone;
 * the strip at the top draws nothing once nothing is left to read.
 *
 * Under them, quietly, the way back to the last turn (`back`), for a tap
 * on «تمّ» made too soon or by mistake.
 *
 * The buttons it replaces go with the focus a keyboard had on them, so the
 * card takes it, on its first action; a sheet open over it keeps its own.
 */
export function Completion({
  end,
  unit,
  pagesRead,
  ayatRead,
  alone = false,
  onRestart,
  onCarryOn,
  onEnd,
  back = null,
}: {
  end: 'khatm' | 'goal';
  unit: Unit;
  pagesRead: number;
  ayatRead: number;
  /** A circle of one. */
  alone?: boolean;
  onRestart: () => void;
  onCarryOn: () => void;
  onEnd: () => void;
  /** The way back to the turn before, with its words; null where there
      is none. */
  back?: { label: string; onClick: () => void } | null;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const at = document.activeElement;
    if (!at || at === document.body) first.current?.focus();
  }, [end]);

  const read = readNote(unit, pagesRead, ayatRead, alone);
  return (
    <div className="khatm" data-end={end}>
      {end === 'khatm' ? (
        <div className="khatm-cartouche">
          <Diamond />
          <h2 className="khatm-title">{endTitle(end, alone)}</h2>
          <Diamond />
        </div>
      ) : (
        <>
          <div className="khatm-rule" aria-hidden="true">
            <Diamond />
          </div>
          <h2 className="khatm-title">{endTitle(end, alone)}</h2>
        </>
      )}
      <p className="khatm-text">
        {alone ? 'تقبّل الله منك.' : 'تقبّل الله منكم.'}
        {read ? ` ${read}.` : ''}
      </p>
      <div className="khatm-actions">
        <button
          ref={first}
          type="button"
          className="button button-primary button-large"
          onClick={end === 'khatm' ? onRestart : onCarryOn}
        >
          {end === 'khatm'
            ? 'ختمة جديدة من الفاتحة'
            : alone
              ? 'تابع'
              : 'تابعوا'}
        </button>
        <button type="button" className="button khatm-end" onClick={onEnd}>
          إنهاء المجلس
        </button>
        {back ? (
          <button
            type="button"
            className="button khatm-back"
            onClick={back.onClick}
          >
            <Undo2 size={18} aria-hidden="true" />
            {back.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
