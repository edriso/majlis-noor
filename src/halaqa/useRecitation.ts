import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { arabic } from '@/data/arabic';
import { surahOfPage, type AyahRange } from '@/data/mushaf';
import { reciterById } from '@/data/reciters';
import { loadTimings, recitationOf, type Timings } from '@/data/timings';
import { wakeChime } from './chime';
import {
  Player,
  type Meta,
  type PlayerState,
  type PlayerStatus,
} from './player';
import { rangeRecitation, rangeTimed } from './turnAudio';
import type { TurnTime } from './useTimeLeft';

/** The app's one player for the halaqa's recitations, on the one audio
    element every recitation plays on (see player.ts). */
export const player = new Player(() => new Audio());

/** A second player, only for hearing a reciter before choosing him. It is
    only ever started by a tap, so it needs none of the first one's
    unlocking, and it keeps off the lock screen. */
const sampler = new Player(() => new Audio(), { session: false });

/** Call from every tap: it lets a phone sound a recitation, or the turn's
    tone, that later starts with no tap of its own. */
export function wakeSound() {
  player.prime();
  wakeChime();
}

export function usePlayer() {
  return useSyncExternalStore(
    player.subscribe,
    player.getState,
    player.getState,
  );
}

/** The player's state but for the time played, which is all a button needs
    to be drawn: the same object until something other than that time
    changes. */
export type SteadyState = Omit<PlayerState, 'played'>;

let steady: PlayerState = player.getState();
function steadyState(): SteadyState {
  const s = player.getState();
  if (
    s.key !== steady.key ||
    s.status !== steady.status ||
    s.page !== steady.page ||
    s.total !== steady.total ||
    s.waiting !== steady.waiting
  )
    steady = s;
  return steady;
}

/**
 * The player's state without its time. A recitation reports where it is
 * four times a second; a component reading `usePlayer` is drawn again each
 * time, and the reading screen would draw the Mushaf page with it. The
 * hooks the screen calls read this instead, and only what shows the time
 * follows it (`TurnTime`, `useTimeLeft`).
 */
export function usePlayerStatus(): SteadyState {
  return useSyncExternalStore(player.subscribe, steadyState, steadyState);
}

/** The time left in the recitation `key`, playing or waiting under an ayah
    heard alone, in clock time at `rate`. */
function recitationLeft(key: string, rate: number) {
  const s = player.getState();
  const own = s.key === key ? s : s.waiting?.key === key ? s.waiting : null;
  return own ? Math.max(0, own.total - own.played) / rate : null;
}

/**
 * Each reciter's timings, loaded as soon as he is named: the halaqa's own
 * reciter and every reciter seated in the circle. A file is a few
 * kilobytes, and loading it before his turn means his recitation can start
 * in the same moment as the turn. `null` is a file that would not load
 * (offline before it was ever cached); `retry` asks again.
 */
export function useTimings(ids: readonly string[]) {
  const [loaded, setLoaded] = useState<Record<string, Timings | null>>({});
  const [attempt, setAttempt] = useState(0);
  const key = [...new Set(ids)].sort().join(',');
  useEffect(() => {
    let live = true;
    for (const id of key.split(',').filter(Boolean))
      loadTimings(id).then(
        (t) => live && setLoaded((l) => (l[id] === t ? l : { ...l, [id]: t })),
        () => live && setLoaded((l) => ({ ...l, [id]: null })),
      );
    return () => {
      live = false;
    };
  }, [key, attempt]);
  return { timings: loaded, retry: () => setAttempt((a) => a + 1) };
}

/** Ends what plays over the recitation `key` (an ayah heard alone), which
    puts it back where it stood, and carries it on if it was not already
    reciting: the press that asks for it is asking to hear it. */
function takeBack(key: string) {
  const over = player.getState();
  if (over.waiting?.key !== key) return;
  player.stop(over.key);
  const now = player.getState();
  if (now.key === key && now.status !== 'playing' && now.status !== 'loading')
    player.resume();
}

/** What the lock screen and a headset show for a recitation. Whether the
    photo is shown there is the player's to decide (`setArtwork`), from the
    reader's photos setting. */
function metaFor(reciter: string, page: number): Meta {
  const r = reciterById(reciter);
  return {
    title: `سورة ${surahOfPage(page).name} · الصفحة ${arabic(page)}`,
    artist: r.name,
    artwork: r.photo
      ? new URL(`${import.meta.env.BASE_URL}reciters/${r.photo}`, location.href)
          .href
      : undefined,
  };
}

/**
 * A seated reciter's turn: his recitation of exactly the turn's ayat
 * (`range`: its pages, or a few ayat, a quarter, a surah), started when the
 * turn comes to him and stopped when it leaves him, however it leaves.
 *
 * The page on screen follows the recitation (`onPage`), and the recitation
 * follows the page: a reader who turns back a page mid-turn hears it again
 * from its start. When the last ayah ends, `onDone` passes the turn on.
 *
 * `turnKey` names the turn and the ayat it covers; a new one is a new
 * recitation from the start.
 *
 * An ayah heard alone (useAyahListen) pauses the turn while it plays, and
 * the turn says `paused` until it carries on; its button ends the ayah and
 * carries it on at once.
 *
 * The component that calls this is drawn again when the recitation starts,
 * pauses or fails, not as it plays: its time is `time`, for `useTimeLeft`.
 */
export function useReciterTurn({
  reciter,
  turnKey,
  range,
  page,
  timings,
  rate,
  onPage,
  onDone,
  onRetry,
}: {
  /** The reciter whose turn it is, or null on a reader's turn. */
  reciter: string | null;
  turnKey: string;
  range: AyahRange;
  page: number;
  timings: Record<string, Timings | null>;
  /** The playback speed, so the time left is time on the clock. */
  rate: number;
  onPage: (page: number) => void;
  onDone: () => void;
  /** Asks for timings that would not load. */
  onRetry: () => void;
}) {
  const state = usePlayerStatus();
  const t = reciter ? timings[reciter] : undefined;
  const key = reciter ? `turn:${turnKey}:${reciter}` : '';
  const { from, to } = range;
  // Ayat whose recording is not the one his timings were made from are
  // not recited at all, and neither is the turn that holds them: played,
  // they could be the wrong ayat, and left out, the circle would race past
  // them with nobody reciting them. The turn waits, failed, for «تخطَّ».
  const untimed = !!t && !rangeTimed(t, range);

  // The latest callbacks and page, read when the recitation starts and as
  // it goes, without making either restart it.
  const latest = useRef({ page, onPage, onDone });
  useEffect(() => {
    latest.current = { page, onPage, onDone };
  });

  useEffect(() => {
    if (!reciter || !t || untimed) return;
    const start = latest.current.page;
    player.play(key, rangeRecitation(t, { from, to }), {
      start,
      onPage: (p) => latest.current.onPage(p),
      onDone: () => latest.current.onDone(),
      meta: metaFor(reciter, start),
    });
    return () => player.stop(key);
  }, [key, reciter, t, from, to, untimed]);

  const mine = key !== '' && state.key === key;
  // An ayah heard alone plays over the turn, which waits as it stood.
  const waiting =
    key !== '' && state.waiting?.key === key ? state.waiting : null;
  const own = mine ? state : waiting;

  // Also when the turn comes back from under an ayah, during which the
  // reader may have turned the page.
  useEffect(() => {
    if (!mine) return;
    const s = player.getState();
    if (s.page !== page && s.status !== 'ended') player.seekPage(page);
  }, [mine, page]);

  const status: PlayerStatus = !reciter
    ? 'idle'
    : t === null || untimed
      ? 'error'
      : waiting
        ? waiting.status === 'error'
          ? 'error'
          : 'paused'
        : mine
          ? state.status
          : 'loading';

  const total = own ? own.total / rate : null;
  const time = useMemo<TurnTime | null>(
    () =>
      key
        ? {
            total,
            left: () => recitationLeft(key, rate),
            subscribe: player.subscribe,
          }
        : null,
    [key, rate, total],
  );

  return {
    /** What his recitation plays under, for `usePlaybackPosition`; empty
        on a reader's turn. */
    key,
    status,
    /** His recitation will not play: neither his timings nor his
        recording would load, the connection died and stayed dead, or his
        timings do not fit his recording of the turn. The turn waits; the
        screen offers «تخطَّ» beside trying again. */
    failed: status === 'error',
    /** His timings do not fit his recording of the turn, which is never
        played, so trying again cannot help: only «تخطَّ» can. */
    untimed,
    /** The turn's time, once its recitation is known; null on a reader's
        turn. */
    time,
    /** Pause, carry on, start after the browser asked for a tap, or try
        again after a failure. */
    toggle: () => {
      if (t === null) onRetry();
      else if (untimed) return;
      else if (waiting) takeBack(key);
      else if (status === 'playing' || status === 'loading') player.pause();
      else if (mine) player.resume();
    },
  };
}

/**
 * «استمع»: the halaqa's reciter reciting what the reader is about to read
 * on the open page (`range`: the page itself in a turn of pages, the
 * turn's ayat on it in any other), once or as many times as the reader
 * set, to hear before reading it or to check a word after. It pauses and
 * resumes like any recording, and stops when the turn or the page changes,
 * so the reciter never carries on over the next reader.
 *
 * If his timings are still loading when it is pressed, the button says so,
 * and a recitation that arrives after the page or the turn has moved on,
 * after a second press, or after the halaqa has closed, is dropped rather
 * than played over whoever reads next.
 */
export function useListen({
  reciter,
  turnKey,
  page,
  range,
  timings,
  repeat,
}: {
  reciter: string;
  turnKey: string;
  page: number;
  /** The ayat to recite, all on `page`. */
  range: AyahRange;
  timings: Record<string, Timings | null>;
  repeat: number;
}) {
  const state = usePlayerStatus();
  const key = `listen:${turnKey}:${reciter}:${page}:${range.from}-${range.to}`;
  const known = timings[reciter];
  // Known before any press once his timings are in, so the button can
  // offer another sheikh rather than a recitation that cannot play.
  const untimed = !!known && !rangeTimed(known, range);
  const [pending, setPending] = useState<{
    key: string;
    status: 'loading' | 'error';
  } | null>(null);
  // One token per page and turn: it dies when they change or the halaqa
  // closes, and counts presses, so a load can tell whether anyone still
  // waits for it.
  const live = useRef({ alive: false, presses: 0 });
  useEffect(() => {
    const token = { alive: true, presses: 0 };
    live.current = token;
    return () => {
      token.alive = false;
      player.stop(key);
    };
  }, [key]);

  const raw = state.key === key ? state.status : 'idle';
  // Waiting under an ayah heard alone, to carry on after it.
  const waiting = state.waiting?.key === key;
  const status: PlayerStatus =
    pending?.key === key
      ? pending.status
      : waiting
        ? 'paused'
        : raw === 'blocked' || raw === 'ended'
          ? 'idle'
          : raw;

  const start = () => {
    const token = live.current;
    const mine = ++token.presses;
    const current = () => token.alive && token.presses === mine;
    // Whatever becomes of a load nothing waits for any more, the button is
    // not left saying that something does.
    const settle = (next: typeof pending) =>
      setPending((p) => (p?.key === key ? next : p));
    const go = (t: Timings) => {
      settle(null);
      if (!current()) return;
      // His recording of these ayat is not the one his timings fit, so
      // it is not played at all, and the button says it cannot be.
      if (!rangeTimed(t, range)) return setPending({ key, status: 'error' });
      const once = rangeRecitation(t, range);
      player.play(key, Array.from({ length: repeat }, () => once).flat(), {
        meta: metaFor(reciter, page),
      });
    };
    const t = timings[reciter];
    if (t) return go(t);
    setPending({ key, status: 'loading' });
    loadTimings(reciter).then(go, () =>
      settle(current() ? { key, status: 'error' } : null),
    );
  };

  /** Pauses it if it is sounding, and says whether it was. */
  const pause = () => {
    if (pending?.key === key && pending.status === 'loading') {
      live.current.presses++;
      setPending(null);
      return false;
    }
    if (raw !== 'playing' && raw !== 'loading') return false;
    player.pause();
    return true;
  };
  const resume = () => {
    if (waiting) takeBack(key);
    else if (raw === 'paused') player.resume();
  };

  return {
    /** What it plays under, for `usePlaybackPosition`. */
    key,
    status,
    /** His recording of these ayat does not fit his timings, and is
        never played. */
    untimed,
    pause,
    resume,
    toggle: () => {
      if (status === 'playing' || status === 'loading') pause();
      else if (status === 'paused') resume();
      else start();
    },
  };
}

/** The halaqa's recitation a sample paused, to carry on when it stops. */
let pausedForSample: string | null = null;

/** Carries the halaqa's recitation on, if a sample paused it and it is
    still the same recitation, still paused. */
function resumeAfterSample() {
  const was = pausedForSample;
  pausedForSample = null;
  const now = player.getState();
  if (was && now.key === was && now.status === 'paused') player.resume();
}

/**
 * A reciter's voice, heard before he is chosen: his al-Fatiha, which every
 * reader knows, so the voices and their pace are heard side by side on the
 * same words, at their own speed. One at a time: a second press stops it,
 * another reciter's press replaces it, closing the list ends it. The
 * halaqa's own recitation waits while it plays and carries on when it
 * stops; if that recitation starts again some other way, the sample stops.
 *
 * A sample that cannot be heard says so (`failed`) until the next press,
 * which tries again: his recording would not load, or his timings, which
 * say where al-Fatiha is in it, never came.
 */
export function useSample(timings: Record<string, Timings | null>) {
  const state = useSyncExternalStore(
    sampler.subscribe,
    sampler.getState,
    sampler.getState,
  );
  const main = usePlayer();
  const sounding = state.status === 'playing' || state.status === 'loading';
  // The reciter pressed whose timings would not load. Nothing plays for
  // him, so the sampler cannot remember it.
  const [untimed, setUntimed] = useState<string | null>(null);

  useEffect(
    () => () => {
      sampler.stop();
      resumeAfterSample();
    },
    [],
  );
  useEffect(() => {
    if (main.status === 'playing') sampler.stop();
  }, [main.status]);
  useEffect(() => {
    if (!sounding) resumeAfterSample();
  }, [sounding]);

  const phase = (id: string) =>
    state.key === `sample:${id}` && sounding ? state.status : undefined;

  return {
    /** `loading` or `playing` while his sample sounds. */
    phase,
    /** Whether his sample, last pressed, could not be heard. */
    failed: (id: string) =>
      (state.key === `sample:${id}` && state.status === 'error') ||
      (untimed === id && timings[id] === null),
    toggle: (id: string) => {
      if (phase(id)) return sampler.stop();
      const t = timings[id];
      setUntimed(t === null ? id : null);
      if (t === null) return sampler.stop();
      // Still on its way: the list asked for every reciter's as it opened.
      if (!t) return;
      const now = player.getState();
      if (now.status === 'playing' || now.status === 'loading') {
        pausedForSample = now.key;
        player.pause();
      }
      sampler.play(`sample:${id}`, recitationOf(t, [1]));
    },
  };
}
