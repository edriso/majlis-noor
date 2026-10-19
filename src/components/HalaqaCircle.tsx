import { Check } from './icons';
import { reciterById } from '@/data/reciters';
import { circleCenter, rangeShort, seatStatus } from '@/halaqa/labels';
import { readerOf, round } from '@/halaqa/schedule';
import {
  currentPage,
  currentRange,
  memberName,
  nextTurnOf,
  planOf,
  seatTurn,
  turnRange,
  type Member,
  type Session,
} from '@/halaqa/state';
import { useTimeLeft, type TurnTime } from '@/halaqa/useTimeLeft';
import { ReciterFace } from './ReciterAvatar';

/** Where each seat sits, in degrees with 0 at the right and 90 at the foot.
    The first member sits at the near right, where a right-to-left reader
    starts, and the turn travels round from there, up the right side and
    over the top, the seats evenly spaced: for four, 45, -45, -135, 135. A
    lone reader sits at the foot. */
const seatAngles = (n: number) =>
  n === 1
    ? [90]
    : Array.from({ length: n }, (_, i) => {
        const angle = 90 - 180 / n - (i * 360) / n;
        return angle <= -180 ? angle + 360 : angle;
      });

/**
 * The circle: everyone in it, in their order, the one reading lit in gold.
 * A gold mark travels the ring from seat to seat as the turn passes, always
 * the same way round, which is what makes the passing of a turn something
 * you see rather than something you read. Under each seat is what it is
 * doing: reading now, next, done this round (or passed over by a jump made
 * after their turn), or what its next turn reads, so the circle is also the
 * reading order. Its turns are the model's, in whatever unit the circle
 * counts and with any turns that swapping who starts passes over.
 *
 * A reciter sits with his photo. While a turn is timed or recited, the
 * seat's own ring drains with it, so the clock is where the eye already is.
 */
export function HalaqaCircle({
  session,
  time,
  sounding = false,
}: {
  session: Session;
  /** The turn's time, while it is timed or recited. */
  time: TurnTime | null;
  /** Whether the reciter whose turn it is can be heard right now. */
  sounding?: boolean;
}) {
  const { config, anchor, turn } = session;
  const plan = planOf(config);
  const n = plan.readers;
  const angles = seatAngles(n);
  const active = readerOf(plan, turn);
  const next = readerOf(plan, nextTurnOf(session));
  // Cumulative, so the mark keeps turning the same way rather than spinning
  // back the long way when the circle wraps to the first seat.
  const markAngle = angles[0] - (turn * 360) / n;
  const roundSeats = plan.mode === 'repeat' ? round(plan, anchor, turn) : null;
  const center = circleCenter(
    plan.unit,
    currentRange(session),
    currentPage(session),
    plan.mode === 'repeat',
  );

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
        <span className="halaqa-center-label">{center.label}</span>
        <span className="halaqa-center-page">{center.value}</span>
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
        const state = roundSeats?.[i].state ?? null;
        const done = state === 'done';
        const status = seatStatus({
          reciter,
          active: isActive,
          round: state,
          next: n > 1 && i === next,
          upcoming:
            plan.mode === 'continue'
              ? rangeShort(plan.unit, turnRange(session, seatTurn(session, i)))
              : '',
        });
        return (
          <div
            key={member.id}
            className="halaqa-seat"
            data-kind={member.kind}
            data-active={isActive || undefined}
            data-next={(n > 1 && i === next && !isActive) || undefined}
            data-done={done || undefined}
            data-skipped={state === 'skipped' || undefined}
            data-top={Math.sin(rad) < -0.5 || undefined}
            // In a circle of five or more the seats at either side sit
            // too close above and below each other for a name under the
            // face; there the name goes beside it, outwards.
            data-side={
              n >= 5 && Math.abs(Math.cos(rad)) > 0.7
                ? Math.cos(rad) > 0
                  ? 'right'
                  : 'left'
                : undefined
            }
            style={{
              left: `${50 + 35 * Math.cos(rad)}%`,
              top: `${50 + 35 * Math.sin(rad)}%`,
            }}
          >
            <span className="seat-avatar">
              <MemberFace member={member} />
              {isActive ? <SeatProgress time={time} /> : null}
              {done ? (
                <span className="seat-done" aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <span className="seat-words">
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
            </span>
          </div>
        );
      })}
    </figure>
  );
}

/** The ring round the reading seat, draining as the turn's time runs: the
    one part of the circle drawn again as it does. */
function SeatProgress({ time }: { time: TurnTime | null }) {
  const left = useTimeLeft(time);
  const total = time?.total;
  if (left === null || !total) return null;
  return (
    <svg className="seat-progress" viewBox="0 0 36 36" aria-hidden="true">
      <circle
        cx="18"
        cy="18"
        r="16.5"
        pathLength="100"
        style={{ strokeDashoffset: 100 - (left / total) * 100 }}
      />
    </svg>
  );
}

/**
 * What fills a member's round frame, in the circle and at the top of the
 * screen: a reciter's face as the reader has photos shown, or his initial;
 * a named reader's first letter; or, for a reader not named, a figure,
 * since a default name («القارئ الثاني») would make a misleading letter.
 * The figure fills the frame as a portrait would, its shoulders cut by the
 * circle, rather than a small icon floating in it. Decorative: the name is
 * always written beside it.
 */
export function MemberFace({ member }: { member: Member }) {
  if (member.kind === 'reciter')
    return (
      <span className="member-face" data-kind="reciter" aria-hidden="true">
        <ReciterFace
          reciter={reciterById(member.reciter)}
          initialClass="member-initial"
        />
      </span>
    );
  const initial = member.name.trim().at(0);
  return (
    <span className="member-face" data-kind="person" aria-hidden="true">
      {initial ? (
        <span className="member-initial">{initial}</span>
      ) : (
        <svg className="member-figure" viewBox="0 0 40 40">
          <circle cx="20" cy="15.5" r="7.5" />
          <path d="M5 40c0-9 6.7-14.5 15-14.5S35 31 35 40Z" />
        </svg>
      )}
    </span>
  );
}
