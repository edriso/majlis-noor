import { BookOpen, Settings, Users } from '@/components/icons';
import { SizedText, TurnClock } from '@/components/ActionBar';
import { Brand } from '@/components/Logo';
import { endTitle, placeLine } from '@/halaqa/labels';
import { turnPhrase } from '@/halaqa/state';
import type { Turn } from './useTurn';

export type Showing = 'mushaf' | 'circle';

/**
 * The bar at the top: whose turn it is and where the circle is, which is
 * also the way to jump elsewhere; the switch between the page and the
 * circle; and the settings.
 *
 * The line names itself by the words it shows, then says what a press
 * does. With a clock beside it, a narrow phone has room only for «ص ٢٤».
 */
export function TopBar({
  turn,
  showing,
  onToggle,
  onJump,
  onSettings,
}: {
  turn: Turn;
  showing: Showing;
  onToggle: () => void;
  onJump: () => void;
  onSettings: () => void;
}) {
  const place = placeLine(turn.unit, turn.range, turn.page);
  const toggle = showing === 'mushaf' ? 'الحلقة' : 'المصحف';
  return (
    <header className="topbar">
      <Brand compact />
      <button type="button" className="topbar-status" onClick={onJump}>
        {turn.end ? (
          endTitle(turn.end)
        ) : (
          <>
            <strong>{turnPhrase(turn.member)}</strong>
            <span> · </span>
            {turn.time ? <SizedText text={place} /> : <span>{place.long}</span>}
            {/* A reciter's time is on the main button already. */}
            {turn.timed ? <TurnClock time={turn.time} /> : null}
          </>
        )}
        <span className="visually-hidden">، انتقل إلى موضع آخر</span>
      </button>
      <div className="topbar-actions">
        {turn.end ? null : (
          <button
            type="button"
            className="topbar-toggle"
            onClick={onToggle}
            aria-label={toggle}
          >
            {showing === 'mushaf' ? (
              <Users size={20} aria-hidden="true" />
            ) : (
              <BookOpen size={20} aria-hidden="true" />
            )}
            <span className="topbar-toggle-label" aria-hidden="true">
              {toggle}
            </span>
          </button>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="الإعدادات"
          onClick={onSettings}
        >
          <Settings size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
