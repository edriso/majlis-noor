import { useEffect, useState } from 'react';
import { PhotosContext } from './components/photos';
import { UpdateNotice } from './components/UpdateNotice';
import { ReadingScreen } from './screens/ReadingScreen';
import { SetupScreen } from './screens/SetupScreen';
import { useHalaqa } from './halaqa/useHalaqa';
import { player, wakeSound } from './halaqa/useRecitation';
import { nextStart, type Prefs, type State } from './halaqa/state';
import { THEMES } from './styles/themes';

/**
 * Two screens and no router. The app always opens on the start screen, which
 * offers to carry on a halaqa left open; the reading screen is only ever
 * reached from there, so a refresh never drops a group straight into a page
 * without saying where they are.
 */
export function App() {
  const [state, dispatch] = useHalaqa();
  const [reading, setReading] = useState(false);
  const { theme, speed, photos } = state.prefs;

  // How recitations sound and what the lock screen shows follow the
  // reader's settings, from whichever screen they were changed on.
  useEffect(() => player.setRate(speed), [speed]);
  useEffect(() => player.setArtwork(photos === 'show'), [photos]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // The colour a phone paints its own bars in follows the ground.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEMES[theme].ground);
  }, [theme]);

  // The press that opens a halaqa is the one a phone needs to let a
  // reciter seated first, or later, be heard (see player.ts).
  const open = (go: () => void) => {
    wakeSound();
    go();
    setReading(true);
    window.scrollTo(0, 0);
  };
  const setPrefs = (prefs: Partial<Prefs>) =>
    dispatch({ type: 'prefs', prefs });

  return (
    <PhotosContext value={state.prefs.photos}>
      {reading && state.session ? (
        <ReadingScreen
          session={state.session}
          prefs={state.prefs}
          dispatch={dispatch}
        />
      ) : (
        <>
          {/* A new version is offered here and never while reading, since
              switching to it reloads the page. */}
          <UpdateNotice />
          <SetupScreen
            initial={initialConfig(state)}
            saved={state.session}
            prefs={state.prefs}
            onPrefs={setPrefs}
            onConfig={(config) => dispatch({ type: 'draft', config })}
            onStart={(config) =>
              open(() => dispatch({ type: 'start', config }))
            }
            onResume={() => open(() => {})}
          />
        </>
      )}
    </PhotosContext>
  );
}

/** A new halaqa starts where the last one stopped: the readers may change
    from one sitting to the next, the place in the Mushaf rarely does. Ending
    a halaqa writes its place into the config; one left open is asked. */
function initialConfig(state: State) {
  const { session } = state;
  return session
    ? { ...state.config, start: nextStart(session) }
    : state.config;
}
