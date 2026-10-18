import { Check, User } from './icons';
import { arabic } from '@/data/arabic';
import { reciterById } from '@/data/reciters';
import { pagesShort } from '@/halaqa/labels';
import {
  pagesOf,
  readerOf,
  round,
  type Anchor,
  type Plan,
} from '@/halaqa/schedule';
import { memberName, type Config, type Member } from '@/halaqa/state';
import { ReciterFace } from './ReciterAvatar';

/** Where each seat sits, in degrees with 0 at the right and 90 at the foot.
    The first member sits at the near right, where a right-to-left reader
    starts, and the turn travels round from there, up the right side and
    over the top. */
const SEAT_ANGLES: Record<number, number[]> = {
  1: [90],
  2: [0, 180],
  3: [30, -90, 150],
  4: [45, -45, -135, 135],
};

/**
 * The circle: everyone in it, in their order, the one reading lit in gold.
 * A gold mark travels the ring from seat to seat as the turn passes, always
 * the same way round, which is what makes the passing of a turn something
 * you see rather than something you read. Under each seat is what it is
 * doing: reading now, next, done this round, or the pages its next turn
 * covers, so the circle is also the reading order.
 *
 * A reciter sits with his photo. While a turn is timed or recited, the
 * seat's own ring drains with it, so the clock is where the eye already is.
 */
export function HalaqaCircle({
  config,
  plan,
  anchor,
  turn,
  page,
  progress,
  sounding = false,
}: {
  config: Config;
  plan: Plan;
  anchor: Anchor;
  turn: number;
  page: number;
  /** The share of the turn's time left, 0 to 1, when it is timed. */
  progress: number | null;
  /** Whether the reciter whose turn it is can be heard right now. */
  sounding?: boolean;
}) {
  const n = plan.readers;
  const angles = SEAT_ANGLES[n];
  const active = readerOf(plan, turn);
  const next = readerOf(plan, turn + 1);
  // Cumulative, so the mark keeps turning the same way rather than spinning
  // back the long way when the circle wraps to the first seat.
  const markAngle = angles[0] - (turn * 360) / n;
  const roundSeats = plan.mode === 'repeat' ? round(plan, anchor, turn) : null;

  return (
    <figure className="halaqa-circle" data-readers={n}>
      <svg className="halaqa-ring" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="70" className="halaqa-ring-line" />
        <circle cx="100" cy="100" r="56" className="halaqa-ring-inner" />
        {n > 1 && (
          <g
            className="halaqa-mark"
            style={{ transform: `rotate(${markAngle}deg)` }}
          >
            {/* 44 degrees of the ring, centred on the reader's seat. */}
            <path
              d="M 164.9 73.8 A 70 70 0 0 1 164.9 126.2"
              className="halaqa-mark-arc"
            />
          </g>
        )}
      </svg>

      <div className="halaqa-center" aria-hidden="true">
        <span className="halaqa-center-label">
          {plan.mode === 'repeat' ? 'تكرار' : 'الصفحة'}
        </span>
        <span className="halaqa-center-page">{arabic(page)}</span>
      </div>

      <figcaption className="visually-hidden">
        الحلقة بترتيبها:{' '}
        {config.members
          .map((m) =>
            m.kind === 'reciter' ? `الشيخ ${memberName(m)}` : memberName(m),
          )
          .join('، ')}
      </figcaption>

      {angles.map((angle, i) => {
        const member = config.members[i];
        const rad = (angle * Math.PI) / 180;
        const isActive = i === active;
        const reciter = member.kind === 'reciter';
        const done = roundSeats?.[i].state === 'done';
        const status = isActive
          ? reciter
            ? 'يتلو الآن'
            : 'يقرأ الآن'
          : done
            ? reciter
              ? 'تلا'
              : 'قرأ'
            : n > 1 && i === next
              ? 'التالي'
              : plan.mode === 'continue'
                ? pagesShort(pagesOf(plan, anchor, nextTurnOf(plan, turn, i)))
                : '';
        return (
          <div
            key={member.id}
            className="halaqa-seat"
            data-kind={member.kind}
            data-active={isActive || undefined}
            data-done={done || undefined}
            data-top={Math.sin(rad) < -0.5 || undefined}
            style={{
              left: `${50 + 35 * Math.cos(rad)}%`,
              top: `${50 + 35 * Math.sin(rad)}%`,
            }}
          >
            <span className="seat-avatar">
              <SeatFace member={member} />
              {isActive && progress !== null ? (
                <svg
                  className="seat-progress"
                  viewBox="0 0 36 36"
                  aria-hidden="true"
                >
                  <circle
                    cx="18"
                    cy="18"
                    r="16.5"
                    pathLength="100"
                    style={{ strokeDashoffset: 100 - progress * 100 }}
                  />
                </svg>
              ) : null}
              {done ? (
                <span className="seat-done" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span className="seat-name">{memberName(member)}</span>
            {status ? (
              <span className="seat-status">
                {isActive && reciter && sounding ? (
                  <span className="seat-sound" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : null}
                {status}
              </span>
            ) : null}
          </div>
        );
      })}
    </figure>
  );
}

/** What fills a seat: a reciter's face as the reader has photos shown, a
    reader's initial, or a figure for a reader not named. */
function SeatFace({ member }: { member: Member }) {
  if (member.kind === 'reciter')
    return (
      <span className="seat-face">
        <ReciterFace
          reciter={reciterById(member.reciter)}
          initialClass="seat-mark"
        />
      </span>
    );
  const initial = member.name.trim().at(0);
  return (
    <span className="seat-mark" aria-hidden="true">
      {initial ?? <User size={22} strokeWidth={1.8} />}
    </span>
  );
}

/** The next turn, from this one on, that belongs to seat `i`. */
function nextTurnOf(plan: Plan, turn: number, i: number) {
  const offset = (i - readerOf(plan, turn) + plan.readers) % plan.readers;
  return turn + offset;
}
