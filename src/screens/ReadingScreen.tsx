import { useId, useState, type Dispatch } from 'react';
import { CloseCard, type Closing } from '@/components/CloseCard';
import { Minimize } from '@/components/icons';
import { SettingsPanel } from '@/components/SettingsPanel';
import { AYAH_COUNT } from '@/data/mushaf';
import {
  placeOf,
  summaryOf,
  type Action,
  type Prefs,
  type Session,
} from '@/halaqa/state';
import { useWakeLock } from '@/hooks/useWakeLock';
import { AyahBar } from '@/mushaf/AyahBar';
import { CircleView } from './reading/CircleView';
import { Completion } from './reading/Completion';
import { JumpSheet } from './reading/JumpSheet';
import { ListenerSheet } from './reading/ListenerSheet';
import { MushafView } from './reading/MushafView';
import { TopBar, type Showing } from './reading/TopBar';
import { TurnActions } from './reading/TurnActions';
import { useMarks } from './reading/useMarks';
import { useQuiet } from './reading/useQuiet';
import { useReadingKeys } from './reading/useReadingKeys';
import { useTurn } from './reading/useTurn';

/**
 * The halaqa itself, the same on every screen: one thing at a time between
 * a strip saying whose turn it is and a bar of buttons that pass it on.
 * That one thing is the Mushaf, as large as the screen allows (a spread of
 * two pages where the room is wide), or the circle, which is also the
 * reading order (every seat says what it does next). A button in the top
 * bar turns from one to the other; the buttons below stay with both.
 *
 * The bars can be hidden for the page alone (`useQuiet`), from the menu or
 * by turning a phone on its side, with a small button at the edge and
 * Escape to bring them back.
 *
 * On a reciter's turn his recitation plays, the page follows it, and the
 * turn passes on when it ends; the primary button pauses it instead.
 *
 * What the turn is lives in `useTurn`; this screen lays it out and holds
 * which view and which sheet are open.
 *
 * «إنهاء المجلس» (in the menu, or on the goal's and the khatm's card)
 * shows the close of the sitting (`CloseCard`), summed up at the press;
 * whatever was sounding is stilled. Its «إنهاء» ends the sitting, and
 * «تابعوا القراءة» goes back to it as it was.
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
  const turnId = useId();
  const { actions } = turn;
  const marks = useMarks(turn, prefs);
  const [sheet, setSheet] = useState<
    'jump' | 'menu' | 'halaqa' | 'listener' | null
  >(null);
  const [showing, setShowing] = useState<Showing>('mushaf');
  const quiet = useQuiet();
  const closeSheet = (open: boolean) => {
    if (!open) setSheet(null);
  };

  // The close, summed up when it is asked for, before the session ends.
  // Asked from the menu, it waits for the menu to have gone (`ending`),
  // so a sheet never opens over a sheet and the menu's own exit does not
  // hand the focus back from under it.
  const [closing, setClosing] = useState<Closing | null>(null);
  const [ending, setEnding] = useState<Closing | null>(null);
  const closeSitting = (): Closing => {
    const endedAt = Date.now();
    actions.hush();
    // The ayah bar goes with what it played, which the hush has stopped.
    marks.unchoose();
    return { summary: summaryOf(session, endedAt), endedAt };
  };

  useWakeLock(!turn.end);
  useReadingKeys({
    enabled: sheet === null && !closing && !ending && !turn.end,
    forward: turn.reciter ? actions.skip : actions.done,
    back: () => {
      if (turn.canGoBack) actions.back();
    },
    space: actions.space,
    escape: () => {
      if (!quiet.hidden) return false;
      quiet.show();
      return true;
    },
  });

  return (
    <div
      className="reading"
      data-showing={showing}
      data-quiet={quiet.hidden || undefined}
    >
      <a className="skip-link" href="#reading-main">
        {showing === 'mushaf' ? 'تخطَّ إلى الصفحة' : 'تخطَّ إلى الحلقة'}
      </a>
      <TopBar
        turn={turn}
        showing={showing}
        onToggle={() =>
          setShowing((v) => (v === 'mushaf' ? 'circle' : 'mushaf'))
        }
        onJump={() => setSheet('jump')}
        onMenu={() => setSheet('menu')}
      />

      {/* What happens once, beside the turn: a round read by everyone, or
          «استمع» that could not play. Its own region, so the turn above is
          not said again when it clears. */}
      <p className="visually-hidden" aria-live="polite">
        {turn.notice}
      </p>

      <main className="reading-main" id="reading-main" tabIndex={-1}>
        {/* The heading says where in the app a screen reader has landed,
            and takes the focus when the screen opens (App.tsx); whose
            turn it is comes with it, once, as its description. */}
        <h1
          className="visually-hidden"
          tabIndex={-1}
          data-screen-title
          aria-describedby={turnId}
        >
          مجلس نور: الحلقة
        </h1>
        <span id={turnId} hidden>
          {turn.announcement}
        </span>
        {turn.toast ? (
          // Said aloud by the notice above already; this is for the eye.
          <p key={turn.toast.id} className="toast" aria-hidden="true">
            {turn.toast.text}
          </p>
        ) : null}
        {quiet.hidden ? (
          // The bars hidden: a way back at the corner of the room, which
          // the page, centred in it, leaves free.
          <button
            type="button"
            className="quiet-return"
            onClick={quiet.show}
            aria-label="إظهار الأزرار"
            aria-keyshortcuts="Escape"
            title="إظهار الأزرار (Esc)"
          >
            <Minimize size={20} aria-hidden="true" />
          </button>
        ) : null}
        {turn.end ? (
          <Completion
            end={turn.end}
            unit={turn.unit}
            pagesRead={session.pagesRead}
            ayatRead={session.ayatRead}
            onRestart={actions.restart}
            onCarryOn={actions.carryOn}
            onEnd={() => setClosing(closeSitting())}
          />
        ) : showing === 'circle' ? (
          <CircleView turn={turn} onEdit={() => setSheet('halaqa')} />
        ) : (
          <MushafView
            page={turn.page}
            turnFirst={turn.pages[0]}
            turnLast={turn.pages[turn.pages.length - 1]}
            size={prefs.pageSize}
            prefetch={turn.prefetch}
            onSwipe={actions.turnPage}
            turn={marks.turn}
            follow={marks.follow}
            selected={marks.chosen?.ayah ?? null}
            onAyahTap={marks.choose}
            cover={marks.cover}
          />
        )}
        {marks.chosen && showing === 'mushaf' && !turn.end ? (
          // Escape closes it before it brings the bars back: it listens
          // on the document, which hears a key before the window does.
          <div className="ayah-dock" data-at={marks.chosen.dock}>
            <AyahBar
              ayah={marks.chosen.ayah}
              word={marks.chosen.word}
              reciter={session.config.reciter}
              timings={turn.timings[session.config.reciter]}
              listen={turn.ayah}
              onClose={marks.unchoose}
            />
          </div>
        ) : null}
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
        ayah={Math.min(placeOf(session), AYAH_COUNT)}
        page={turn.page}
        onGo={actions.goToAyah}
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
        open={sheet === 'menu' || sheet === 'halaqa'}
        start={sheet === 'halaqa' ? 'halaqa' : 'menu'}
        onOpenChange={closeSheet}
        session={session}
        prefs={prefs}
        dispatch={dispatch}
        onQuiet={quiet.hide}
        onEnd={() => {
          setEnding(closeSitting());
          setSheet(null);
        }}
        onClosed={() => {
          if (!ending) return;
          setClosing(ending);
          setEnding(null);
        }}
      />
      <CloseCard
        closing={closing}
        design={prefs.cardDesign}
        onDesign={(cardDesign) =>
          dispatch({ type: 'prefs', prefs: { cardDesign } })
        }
        onContinue={() => setClosing(null)}
        onEnd={actions.end}
      />
    </div>
  );
}
