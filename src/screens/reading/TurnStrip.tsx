import { MemberFace } from '@/components/HalaqaCircle';
import { endTitle, stripDetail } from '@/halaqa/labels';
import { turnPhrase } from '@/halaqa/state';
import type { Turn } from './useTurn';

/**
 * Who reads now, large, with their face in a gold ring, and under it,
 * quietly, what the turn reads (when it is not simply the page) and who
 * reads after: the first thing anyone looks up to find.
 *
 * It is also the screen's one status, the `<output>` a screen reader
 * hears when the turn moves or anything about it changes. What it says is
 * the turn's announcement, a full sentence kept for it; the words drawn
 * are for the eye and hidden from it, so it is heard once, not twice.
 *
 * When the turn passes, what is drawn is drawn afresh (keyed by the turn),
 * which lets it slide in from the side the turn moves to and the ring draw
 * itself round the new reader; reduced motion stills both.
 */
export function TurnStrip({ turn }: { turn: Turn }) {
  const { member, end, session } = turn;
  const detail = end
    ? null
    : stripDetail({
        unit: turn.unit,
        range: turn.range,
        next: turn.next,
        end: turn.nextEnd,
      });
  const parts = detail ? [detail.portion, detail.after].filter(Boolean) : [];
  return (
    <output className="turn-strip" aria-live="polite">
      <span
        key={end ?? `${session.turn}:${member.id}`}
        className="turn-strip-shown"
        data-end={end ?? undefined}
        aria-hidden="true"
      >
        {end ? null : (
          <span className="turn-face">
            <MemberFace member={member} />
            <svg className="turn-ring" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="23" pathLength="100" />
            </svg>
          </span>
        )}
        <span className="turn-text">
          <span className="turn-name">
            {end ? endTitle(end) : turnPhrase(member)}
          </span>
          {parts.length ? (
            <span className="turn-detail">
              {parts.map((part) => (
                <span key={part}>{part}</span>
              ))}
            </span>
          ) : null}
        </span>
      </span>
      <span className="visually-hidden">{turn.announcement}</span>
    </output>
  );
}
