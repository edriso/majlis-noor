import { HalaqaCircle } from '@/components/HalaqaCircle';
import { arabic } from '@/data/arabic';
import { PAGE_COUNT, surahOfPage } from '@/data/mushaf';
import { sittingNote } from '@/halaqa/labels';
import type { Turn } from './useTurn';

/** The circle, which is also the reading order, and under it where the
    halaqa is in the Mushaf and how much this sitting has read. */
export function CircleView({ turn }: { turn: Turn }) {
  const { session, page } = turn;
  return (
    <section className="circle-view" aria-label="الحلقة">
      <HalaqaCircle
        session={session}
        time={turn.time}
        sounding={!!turn.reciter && turn.recitation.status === 'playing'}
      />
      <div className="sitting">
        <p className="sitting-label">
          <span>سورة {surahOfPage(page).name}</span>
          <span>
            {arabic(page)} من {arabic(PAGE_COUNT)}
          </span>
        </p>
        <progress
          className="sitting-bar"
          aria-label="الموضع في المصحف"
          max={PAGE_COUNT}
          value={page}
        />
        <p className="sitting-note">
          {sittingNote(turn.unit, session.pagesRead, session.ayatRead)}
        </p>
      </div>
    </section>
  );
}
