import {
  ArrowLeft,
  ChevronsLeft,
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Undo2,
} from './icons';
import type { ReactNode } from 'react';
import { clock, durationWords } from '@/data/arabic';
import type { Reciter } from '@/data/reciters';
import type { PlayerStatus } from '@/halaqa/player';
import { ReciterAvatar } from './ReciterAvatar';

/* The bar under the page: one primary button in the middle and a few quiet
   ones beside it. What the primary button does depends on whose turn it
   is: a reader's «تمّ», or a reciter's recitation to pause and resume. */

export function ActionBar({
  toast,
  progress,
  children,
}: {
  toast: { id: number; text: string } | null;
  /** The share of a timed or recited turn left, drawn along the top. */
  progress: number | null;
  children: ReactNode;
}) {
  return (
    <div className="action-bar">
      {toast ? (
        // Said aloud by the announcement already; this is for the eye.
        <p key={toast.id} className="toast" aria-hidden="true">
          {toast.text}
        </p>
      ) : null}
      {progress !== null ? (
        <div className="turn-progress" aria-hidden="true">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
      ) : null}
      {children}
    </div>
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

/** A reader's «تمّ»: the next page of a turn of several, or the turn
    passed on, with who and what comes next written under it. */
export function DoneButton({
  onClick,
  step,
  alone,
  sub,
}: {
  onClick: () => void;
  /** The next page within this turn, when there is one, as a label. */
  step: string | null;
  /** A circle of one has no next reader to name. */
  alone: boolean;
  sub: string | null;
}) {
  return (
    <button
      type="button"
      className="action-primary"
      onClick={onClick}
      aria-keyshortcuts="ArrowLeft"
      title="(←)"
    >
      <span className="action-primary-main">
        {step ? (
          step
        ) : alone ? (
          'تمّ — متابعة'
        ) : (
          <>
            <span className="label-long">تمّ — القارئ التالي</span>
            <span className="label-short" aria-hidden="true">
              تمّ — التالي
            </span>
          </>
        )}
        <ArrowLeft size={20} aria-hidden="true" />
      </span>
      {sub ? <span className="action-primary-sub">{sub}</span> : null}
    </button>
  );
}

/**
 * A reciter's turn: his photo, that he is reciting and how long is left,
 * and one press to pause or carry on. When the browser held the sound back
 * until a tap, or it would not load, the same button says so and is the
 * tap that starts it.
 */
export function RecitationButton({
  reciter,
  status,
  left,
  onClick,
}: {
  reciter: Reciter;
  status: PlayerStatus;
  left: number | null;
  onClick: () => void;
}) {
  const name = reciter.short;
  const time = left !== null ? `بقي ${clock(left)}` : '';
  const words = left !== null ? `، بقي ${durationWords(left)}` : '';
  const view: Record<
    PlayerStatus,
    { main: string; sub: string; icon: ReactNode; label: string }
  > = {
    playing: {
      main: `يتلو ${name}`,
      sub: time,
      icon: <Pause size={20} aria-hidden="true" />,
      label: `إيقاف تلاوة ${name} مؤقتًا${words}`,
    },
    loading: {
      main: `يتلو ${name}`,
      sub: 'جارٍ تحميل التلاوة…',
      icon: <LoaderCircle size={20} aria-hidden="true" className="spin" />,
      label: `إيقاف تلاوة ${name} مؤقتًا`,
    },
    paused: {
      main: `متابعة تلاوة ${name}`,
      sub: time ? `متوقفة · ${time}` : 'متوقفة',
      icon: <Play size={20} aria-hidden="true" />,
      label: `متابعة تلاوة ${name}${words}`,
    },
    blocked: {
      main: `استمع إلى ${name}`,
      sub: 'اضغط لتبدأ تلاوته',
      icon: <Play size={20} aria-hidden="true" />,
      label: `ابدأ تلاوة ${name}`,
    },
    idle: {
      main: `استمع إلى ${name}`,
      sub: 'اضغط لتبدأ تلاوته',
      icon: <Play size={20} aria-hidden="true" />,
      label: `ابدأ تلاوة ${name}`,
    },
    error: {
      main: 'تعذّر تشغيل التلاوة',
      sub: 'اضغط لإعادة المحاولة',
      icon: <RotateCcw size={20} aria-hidden="true" />,
      label: `إعادة محاولة تلاوة ${name}`,
    },
    ended: {
      main: `يتلو ${name}`,
      sub: '',
      icon: <Pause size={20} aria-hidden="true" />,
      label: `تلاوة ${name}`,
    },
  };
  const v = view[status];
  return (
    <button
      type="button"
      className="action-primary action-recitation"
      data-status={status}
      onClick={onClick}
      aria-label={v.label}
      aria-keyshortcuts="Space"
    >
      <ReciterAvatar reciter={reciter} size={40} />
      <span className="recitation-text">
        <span className="action-primary-main">{v.main}</span>
        {v.sub ? <span className="action-primary-sub">{v.sub}</span> : null}
      </span>
      <span className="recitation-icon">{v.icon}</span>
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

/** The countdown of a timed turn, which is also its pause. */
export function TimerButton({
  paused,
  left,
  onClick,
}: {
  paused: boolean;
  left: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="action-secondary"
      onClick={onClick}
      aria-pressed={paused}
      aria-keyshortcuts="Space"
      aria-label={
        paused
          ? `استئناف التوقيت، بقي ${durationWords(left ?? 0)}`
          : `إيقاف التوقيت مؤقتًا، بقي ${durationWords(left ?? 0)}`
      }
    >
      {paused ? (
        <Play size={20} aria-hidden="true" />
      ) : (
        <Pause size={20} aria-hidden="true" />
      )}
      <span className="action-clock" aria-hidden="true">
        {left === null ? '…' : clock(left)}
      </span>
    </button>
  );
}

/** «استمع»: the open page in the halaqa's reciter's voice, paused and
    resumed with the same button. */
export function ListenButton({
  status,
  page,
  onClick,
}: {
  status: PlayerStatus;
  page: string;
  onClick: () => void;
}) {
  const view: Record<
    PlayerStatus,
    { icon: ReactNode; text: string; label: string }
  > = {
    idle: {
      icon: <Headphones size={20} aria-hidden="true" />,
      text: 'استمع',
      label: `استمع إلى ${page}`,
    },
    ended: {
      icon: <Headphones size={20} aria-hidden="true" />,
      text: 'استمع',
      label: `استمع إلى ${page}`,
    },
    blocked: {
      icon: <Headphones size={20} aria-hidden="true" />,
      text: 'استمع',
      label: `استمع إلى ${page}`,
    },
    loading: {
      icon: <LoaderCircle size={20} aria-hidden="true" className="spin" />,
      text: 'جارٍ التحميل…',
      label: 'إيقاف الاستماع',
    },
    playing: {
      icon: <Pause size={20} aria-hidden="true" />,
      text: 'إيقاف مؤقت',
      label: 'إيقاف الاستماع مؤقتًا',
    },
    paused: {
      icon: <Play size={20} aria-hidden="true" />,
      text: 'متابعة',
      label: `متابعة الاستماع إلى ${page}`,
    },
    error: {
      icon: <RotateCcw size={20} aria-hidden="true" />,
      text: 'تعذّر التشغيل',
      label: `تعذّر الاستماع إلى ${page}، أعد المحاولة`,
    },
  };
  const v = view[status];
  return (
    <button
      type="button"
      className="action-secondary"
      data-active={
        status === 'playing' ||
        status === 'loading' ||
        status === 'paused' ||
        undefined
      }
      onClick={onClick}
      aria-label={v.label}
    >
      {v.icon}
      <span className="action-secondary-label" aria-hidden="true">
        {v.text}
      </span>
    </button>
  );
}
