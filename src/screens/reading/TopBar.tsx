import { BookOpen, Menu, Users } from '@/components/icons';
import { placeChip } from '@/halaqa/labels';
import { TurnStrip } from './TurnStrip';
import type { Turn } from './useTurn';

export type Showing = 'mushaf' | 'circle';

/**
 * The bar at the top. On the right, where a right-to-left eye starts, the
 * turn: who reads now and who after. On the left, three controls: the
 * place, «ص ٥٠», which opens the jump; the switch between the page and the
 * circle; and the menu. From a tablet up the switch and the menu also show
 * their words; on a phone they keep them as their names.
 */
export function TopBar({
  turn,
  showing,
  onToggle,
  onJump,
  onMenu,
}: {
  turn: Turn;
  showing: Showing;
  onToggle: () => void;
  onJump: () => void;
  onMenu: () => void;
}) {
  const chip = placeChip(turn.page);
  const toggle = showing === 'mushaf' ? 'الحلقة' : 'المصحف';
  return (
    <header className="topbar">
      <TurnStrip turn={turn} />
      <div className="topbar-actions">
        <button
          type="button"
          className="place-chip"
          onClick={onJump}
          aria-label={chip.name}
          aria-haspopup="dialog"
        >
          {chip.text}
        </button>
        {turn.end ? null : (
          <button
            type="button"
            className="topbar-button topbar-toggle"
            onClick={onToggle}
            aria-label={toggle}
          >
            {showing === 'mushaf' ? (
              <Users size={20} aria-hidden="true" />
            ) : (
              <BookOpen size={20} aria-hidden="true" />
            )}
            <span className="topbar-label" aria-hidden="true">
              {toggle}
            </span>
          </button>
        )}
        <button
          type="button"
          className="topbar-button"
          onClick={onMenu}
          aria-label="القائمة"
          aria-haspopup="dialog"
        >
          <Menu size={20} aria-hidden="true" />
          <span className="topbar-label" aria-hidden="true">
            القائمة
          </span>
        </button>
      </div>
    </header>
  );
}
