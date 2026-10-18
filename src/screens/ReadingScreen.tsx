import { useCallback, useState, type Dispatch } from 'react';
import type { Action, Prefs, Session } from '@/halaqa/state';
import { useWakeLock } from '@/hooks/useWakeLock';
import { SettingsPanel } from '@/components/SettingsPanel';
import { CircleView } from './reading/CircleView';
import { Completion } from './reading/Completion';
import { JumpSheet, ListenerSheet } from './reading/JumpSheet';
import { MushafView } from './reading/MushafView';
import { TopBar, type Showing } from './reading/TopBar';
import { TurnActions } from './reading/TurnActions';
import { useReadingKeys } from './reading/useReadingKeys';
import { useTurn } from './reading/useTurn';

/**
 * The halaqa itself, the same on every screen: one thing at a time between
 * a line saying whose turn it is and a bar of buttons that pass it on.
 * That one thing is the Mushaf page, as large as the screen allows and
 * never scrolled, or the circle, which is also the reading order (every
 * seat says what it does next). A button in the top bar turns from one to
 * the other; the buttons below stay with both.
 *
 * On a reciter's turn his recitation plays, the page follows it, and the
 * turn passes on when it ends; the primary button pauses it instead.
 *
 * What the turn is lives in `useTurn`; this screen lays it out and holds
 * which view and which sheet are open.
 */
export function ReadingScreen({
  session,
  prefs,
  dispatch,
}: {
  session: Session;
  prefs: Prefs;
  dispatch: Dispatch<Action>;
}) {
  const turn = useTurn({ session, prefs, dispatch });
  const { actions } = turn;
  const [sheet, setSheet] = useState<'jump' | 'settings' | 'listener' | null>(
    null,
  );
  const [showing, setShowing] = useState<Showing>('mushaf');
  const closeSheet = (open: boolean) => {
    if (!open) setSheet(null);
  };
  // Handed to the page, which is drawn again only when its props change.
  const openJump = useCallback(() => setSheet('jump'), []);

  useWakeLock(!turn.end);
  useReadingKeys({
    enabled: sheet === null && !turn.end,
    forward: turn.reciter ? actions.skip : actions.done,
    back: () => {
      if (turn.canGoBack) actions.back();
    },
    space: actions.space,
  });

  return (
    <div className="reading" data-showing={showing}>
      <a className="skip-link" href="#reading-main">
        {showing === 'mushaf' ? 'تخطَّ إلى الصفحة' : 'تخطَّ إلى الحلقة'}
      </a>
      <TopBar
        turn={turn}
        showing={showing}
        onToggle={() =>
          setShowing((v) => (v === 'mushaf' ? 'circle' : 'mushaf'))
        }
        onJump={openJump}
        onSettings={() => setSheet('settings')}
      />

      <output className="visually-hidden" aria-live="polite">
        {turn.announcement}
      </output>
      {/* What happens once, beside the turn: a round read by everyone, or
          «استمع» that could not play. Its own region, so the turn above is
          not said again when it clears. */}
      <p className="visually-hidden" aria-live="polite">
        {turn.notice}
      </p>

      <main className="reading-main" id="reading-main" tabIndex={-1}>
        {/* The brand in the bar says which app this is; the heading says
            where in it a screen reader has landed. */}
        <h1 className="visually-hidden">مجلس نور: الحلقة</h1>
        {turn.end ? (
          <Completion
            end={turn.end}
            unit={turn.unit}
            pagesRead={session.pagesRead}
            ayatRead={session.ayatRead}
            onRestart={actions.restart}
            onCarryOn={actions.carryOn}
            onEnd={actions.end}
          />
        ) : showing === 'circle' ? (
          <CircleView turn={turn} />
        ) : (
          <MushafView
            page={turn.page}
            prefetch={turn.prefetch}
            onPrevious={actions.previousPage}
            onNext={actions.nextPage}
            onJump={openJump}
          />
        )}
      </main>

      {turn.end ? null : (
        <TurnActions
          turn={turn}
          onChooseListener={() => setSheet('listener')}
        />
      )}

      <JumpSheet
        open={sheet === 'jump'}
        onOpenChange={closeSheet}
        page={turn.page}
        onGo={actions.goToPage}
      />
      <ListenerSheet
        open={sheet === 'listener'}
        onOpenChange={closeSheet}
        reciter={session.config.reciter}
        timed={session.config.turnChange === 'reciter'}
        onChoose={(reciter) =>
          dispatch({
            type: 'configure',
            config: { ...session.config, reciter },
          })
        }
      />
      <SettingsPanel
        open={sheet === 'settings'}
        onOpenChange={closeSheet}
        session={session}
        prefs={prefs}
        dispatch={dispatch}
      />
    </div>
  );
}
