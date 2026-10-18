import {
  ArrowLeft,
  ChevronsLeft,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Undo2,
  Users,
} from './icons';
import type { ReactNode } from 'react';
import { clock } from '@/data/arabic';
import type { Reciter } from '@/data/reciters';
import {
  listenLabels,
  recitationLabels,
  timerLabel,
  type Sized,
} from '@/halaqa/labels';
import type { PlayerStatus } from '@/halaqa/player';
import { useTimeLeft, type TurnTime } from '@/halaqa/useTimeLeft';
import { ReciterAvatar } from './ReciterAvatar';

/* The bar under the page: one primary button in the middle and a few quiet
   ones beside it. What the primary button does depends on whose turn it
   is: a reader's «تمّ», or a reciter's recitation to pause and resume. It
   is one button for both, whose words change, so a keyboard's focus stays
   on it when the turn passes between a reader and a reciter.

   Whatever shows the turn's time reads it here, in a component of its own
   (`useTimeLeft`), and is the only thing drawn again as the time runs. */

export function ActionBar({
  toast,
  time,
  children,
}: {
  toast: { id: number; text: string } | null;
  /** The turn's time, drawn along the top while it is timed or recited. */
  time: TurnTime | null;
  children: ReactNode;
}) {
  return (
    <div className="action-bar">
      {toast ? (
        // Said aloud by the screen's notice already; this is for the eye.
        <p key={toast.id} className="toast" aria-hidden="true">
          {toast.text}
        </p>
      ) : null}
      <TurnProgress time={time} />
      {children}
    </div>
  );
}

/** The share of a timed or recited turn left, a line along the bar's top. */
function TurnProgress({ time }: { time: TurnTime | null }) {
  const left = useTimeLeft(time);
  const total = time?.total;
  if (left === null || !total) return null;
  return (
    <div className="turn-progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${left / total})` }} />
    </div>
  );
}

/** A text with a shorter form for a phone (see reading.css): a screen
    reader hears the longer, which is the name. */
export function SizedText({ text }: { text: Sized }) {
  if (text.long === text.short) return text.long;
  return (
    <>
      <span className="label-long">{text.long}</span>
      <span className="label-short" aria-hidden="true">
        {text.short}
      </span>
    </>
  );
}

export function BackButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className="action-secondary"
      onClick={onClick}
      aria-disabled={disabled}
      aria-keyshortcuts="ArrowRight"
      title={`${label} (→)`}
    >
      <Undo2 size={20} aria-hidden="true" />
      <span className="action-secondary-label">{label}</span>
    </button>
  );
}

/** What the primary button is for this turn. */
export type PrimaryView =
  /** A reader's «تمّ»: the next page of a turn of several, or the turn
      passed on, with who and what comes next written under it. */
  | { kind: 'done'; main: Sized; sub: Sized | null }
  /** A reciter's turn: what a press does to his recitation, and how long
      is left; when it will not play, «تخطَّ». */
  | {
      kind: 'recitation';
      reciter: Reciter;
      status: PlayerStatus;
      /** Labels, given the time left. */
      labels: (left: number | null) => ReturnType<typeof recitationLabels>;
      /** Whether the press skips the turn, its recitation having failed. */
      skips: boolean;
    };

/**
 * The one primary button. A reader's turn shows «تمّ — التالي» and who
 * reads next, named by those words. A reciter's turn shows his photo, what
 * a press does and the time left, so it reads the time itself; when the
 * browser held the sound back until a tap, or it would not load, the same
 * button says so and is the tap that starts it, or the way on.
 */
export function PrimaryButton({
  view,
  time,
  onClick,
}: {
  view: PrimaryView;
  time: TurnTime | null;
  onClick: () => void;
}) {
  const left = useTimeLeft(view.kind === 'recitation' ? time : null);
  const recitation =
    view.kind === 'recitation' ? { ...view, l: view.labels(left) } : null;
  const icon = recitation ? (
    recitation.skips ? (
      <ChevronsLeft size={20} aria-hidden="true" />
    ) : recitation.status === 'loading' ? (
      <LoaderCircle size={20} aria-hidden="true" className="spin" />
    ) : recitation.status === 'playing' || recitation.status === 'ended' ? (
      <Pause size={20} aria-hidden="true" />
    ) : (
      <Play size={20} aria-hidden="true" />
    )
  ) : null;
  const keys = recitation && !recitation.skips ? 'Space' : 'ArrowLeft';
  return (
    <button
      type="button"
      className={
        recitation ? 'action-primary action-recitation' : 'action-primary'
      }
      data-status={recitation?.status}
      onClick={onClick}
      aria-label={recitation?.l.name}
      aria-keyshortcuts={keys}
      title={keys === 'ArrowLeft' ? '(←)' : undefined}
    >
      {recitation ? (
        <>
          <ReciterAvatar reciter={recitation.reciter} size={40} />
          <span className="recitation-text">
            <span className="action-primary-main">{recitation.l.main}</span>
            {recitation.l.sub.long ? (
              <span className="action-primary-sub">
                <SizedText text={recitation.l.sub} />
              </span>
            ) : null}
          </span>
          <span className="recitation-icon">{icon}</span>
        </>
      ) : view.kind === 'done' ? (
        <>
          <span className="action-primary-main">
            <SizedText text={view.main} />
            <ArrowLeft size={20} aria-hidden="true" />
          </span>
          {view.sub ? (
            <span className="action-primary-sub">
              <SizedText text={view.sub} />
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}

/** Passes a reciter's turn on before his recitation ends. */
export function SkipButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="action-secondary"
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="ArrowLeft"
      title={`${label} (←)`}
    >
      <ChevronsLeft size={20} aria-hidden="true" />
      <span className="action-secondary-label" aria-hidden="true">
        تخطَّ
      </span>
    </button>
  );
}

/** Tries a reciter's recitation again, beside «تخطَّ», when it failed for
    a reason another try might mend. */
export function RetryButton({
  onClick,
  reciter,
}: {
  onClick: () => void;
  reciter: string;
}) {
  return (
    <button
      type="button"
      className="action-secondary"
      onClick={onClick}
      aria-label={`أعد المحاولة، تلاوة ${reciter}`}
      aria-keyshortcuts="Space"
    >
      <RotateCcw size={20} aria-hidden="true" />
      <span className="action-secondary-label" aria-hidden="true">
        أعد المحاولة
      </span>
    </button>
  );
}

/** The countdown of a timed turn, which is also its pause. Until the
    reciter's timings are in, it shows that it is waiting for them. */
export function TimerButton({
  paused,
  time,
  onClick,
}: {
  paused: boolean;
  time: TurnTime | null;
  onClick: () => void;
}) {
  const left = useTimeLeft(time);
  return (
    <button
      type="button"
      className="action-secondary"
      onClick={onClick}
      aria-pressed={paused}
      aria-keyshortcuts="Space"
      aria-label={timerLabel(paused, left)}
    >
      {paused ? (
        <Play size={20} aria-hidden="true" />
      ) : left === null ? (
        <LoaderCircle size={20} aria-hidden="true" className="spin" />
      ) : (
        <Pause size={20} aria-hidden="true" />
      )}
      <span className="action-clock">{left === null ? '…' : clock(left)}</span>
    </button>
  );
}

/** «استمع»: what the reader is about to read, in the halaqa's reciter's
    voice, paused and resumed with the same button. Where his recording
    of it cannot be played (`untimed`), it offers another sheikh. */
export function ListenButton({
  status,
  what,
  untimed,
  onClick,
}: {
  status: PlayerStatus;
  what: string;
  untimed: string | null;
  onClick: () => void;
}) {
  const { text, name } = listenLabels(status, what, untimed);
  const icon = untimed ? (
    <Users size={20} aria-hidden="true" />
  ) : status === 'loading' ? (
    <LoaderCircle size={20} aria-hidden="true" className="spin" />
  ) : status === 'playing' ? (
    <Pause size={20} aria-hidden="true" />
  ) : status === 'paused' ? (
    <Play size={20} aria-hidden="true" />
  ) : status === 'error' ? (
    <RotateCcw size={20} aria-hidden="true" />
  ) : (
    <Headphones size={20} aria-hidden="true" />
  );
  return (
    <button
      type="button"
      className="action-secondary"
      data-active={
        (!untimed &&
          (status === 'playing' ||
            status === 'loading' ||
            status === 'paused')) ||
        undefined
      }
      onClick={onClick}
      aria-label={name}
    >
      {icon}
      <span className="action-secondary-label" aria-hidden="true">
        {text}
      </span>
    </button>
  );
}
