import { HalaqaCircle } from '@/components/HalaqaCircle';
import { sittingNote } from '@/halaqa/labels';
import type { Turn } from './useTurn';

/** The circle, which is also the reading order, and under it how much
    this sitting has read and the way to change the circle. Where the
    sitting is in the Mushaf is the line along the buttons. */
export function CircleView({
  turn,
  onEdit,
}: {
  turn: Turn;
  /** Opens the circle's form. */
  onEdit: () => void;
}) {
  const { session } = turn;
  return (
    <section className="circle-view" aria-label="الحلقة">
      <HalaqaCircle
        session={session}
        time={turn.time}
        sounding={!!turn.reciter && turn.recitation.status === 'playing'}
      />
      <div className="sitting">
        <p className="sitting-note">
          {sittingNote(turn.unit, session.pagesRead, session.ayatRead)}
        </p>
        <button
          type="button"
          className="button sitting-edit"
          onClick={onEdit}
          aria-haspopup="dialog"
        >
          عدّل الحلقة
        </button>
      </div>
    </section>
  );
}
