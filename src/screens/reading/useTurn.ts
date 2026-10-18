import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
} from 'react';
import { ayatOfPage, PAGE_COUNT, pagesOfRange } from '@/data/mushaf';
import { reciterById } from '@/data/reciters';
import { chime } from '@/halaqa/chime';
import {
  ayatLabel,
  pagesLabel,
  roundDone,
  turnAnnouncement,
  untimedLabel,
  type Next,
} from '@/halaqa/labels';
import { endsRound, rangeOf, readerOf } from '@/halaqa/schedule';
import {
  canStepBack,
  completion,
  currentPage,
  currentRange,
  memberName,
  nextTurnOf,
  planOf,
  turnPhrase,
  turnRange,
  type Action,
  type Completion,
  type Prefs,
  type Session,
} from '@/halaqa/state';
import { turnDuration } from '@/halaqa/turnAudio';
import { useAyahListen } from '@/halaqa/useAyahListen';
import {
  useListen,
  useReciterTurn,
  useTimings,
  wakeSound,
} from '@/halaqa/useRecitation';
import { useTurnClock } from '@/halaqa/useTurnClock';
import { spaceTarget } from './useReadingKeys';

/** How a turn would end if it had nothing to read: at the end of the
    Mushaf, or at the goal the sitting set itself. Null if it has ayat. */
function endAt(s: Session, turn: number): Completion {
  const range = turnRange(s, turn);
  if (range.to > range.from) return null;
  const whole = rangeOf(planOf(s.config), s.anchor, turn);
  return whole.to > whole.from ? 'goal' : 'khatm';
}

/**
 * The turn as the reading screen shows it: who has it and what it reads,
 * who comes next, how it ends, and everything that runs during it (the
 * clock of a timed reader, a seated reciter's recitation, «استمع», an ayah
 * heard alone) with the one pause over all of them.
 *
 * The screen calling this is drawn again when the turn changes or when
 * what runs in it starts, pauses or fails, and not as time passes: the
 * turn's time is `time`, read by the small components that show it
 * (`useTimeLeft`), so the Mushaf page is not drawn four times a second.
 */
export function useTurn({
  session,
  prefs,
  dispatch,
}: {
  session: Session;
  prefs: Prefs;
  dispatch: Dispatch<Action>;
}) {
  const { config } = session;
  const plan = planOf(config);
  const unit = config.unit;
  const end = completion(session);
  const range = currentRange(session);
  const pages = pagesOfRange(range);
  const page = currentPage(session);
  const member = config.members[readerOf(plan, session.turn)];
  const alone = plan.readers === 1;
  const nextTurn = nextTurnOf(session);
  const nextMember = config.members[readerOf(plan, nextTurn)];
  const nextRange = turnRange(session, nextTurn);
  const next: Next = {
    name: alone ? null : memberName(nextMember),
    unit,
    range: nextRange,
  };
  const nextEnd = endAt(session, nextTurn);
  const lastPage = session.pageInTurn >= pages.length - 1;
  const seated = !end && member.kind === 'reciter' ? member : null;
  const reciter = seated ? reciterById(seated.reciter) : null;
  // A reader's turn may be timed by the halaqa's reciter, with the
  // allowance the halaqa gives its readers; a reciter's turn is as long as
  // his recitation, and needs no clock.
  const timed = config.turnChange === 'reciter' && !end && !seated;
  // A turn, and the ayat it covers: a new key is a new turn to time or to
  // recite from its start.
  const turnKey = `${session.turn}:${range.from}-${range.to}`;
  // «استمع» recites what the reader is about to read on the open page:
  // the page itself in a turn of pages, the turn's ayat on it otherwise.
  const onPage = ayatOfPage(page);
  const listenFrom = Math.max(range.from, onPage.from);
  const listenRange = {
    from: listenFrom,
    to: Math.max(listenFrom, Math.min(range.to, onPage.to)),
  };
  const listenWhat =
    unit === 'page' ? pagesLabel([page]) : ayatLabel(listenRange);

  const [toast, setToast] = useState<{
    id: number;
    text: string;
    said: string;
  } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const finishTurn = () => {
    if (end) return;
    if (plan.mode === 'repeat' && !alone && endsRound(plan, session.turn)) {
      const done = roundDone(unit, range);
      setToast((t) => ({ id: (t?.id ?? 0) + 1, ...done }));
    }
    dispatch({ type: 'finishTurn' });
  };
  // A turn that passes with nobody touching the screen says so, if the
  // reader keeps the tone on.
  const passOn = () => {
    if (prefs.cue === 'chime') chime();
    finishTurn();
  };

  const { timings, retry } = useTimings([
    config.reciter,
    ...config.members.flatMap((m) => (m.kind === 'reciter' ? [m.reciter] : [])),
  ]);
  const pace = timings[config.reciter];
  const duration =
    timed && pace ? turnDuration(pace, unit, range) * config.allowance : null;
  const clock = useTurnClock({
    enabled: timed,
    duration,
    turnKey: `${turnKey}:${config.reciter}:${config.allowance}`,
    onExpire: passOn,
  });
  const recitation = useReciterTurn({
    reciter: seated?.reciter ?? null,
    turnKey,
    range,
    page,
    timings,
    rate: prefs.speed,
    onPage: (p) => dispatch({ type: 'goToPage', page: p }),
    onDone: passOn,
    onRetry: retry,
  });
  const listen = useListen({
    reciter: config.reciter,
    turnKey,
    page,
    range: listenRange,
    timings,
    repeat: prefs.listenRepeat,
  });
  const ayah = useAyahListen(`${turnKey}:${page}`);

  /* One pause for a reader's timed turn: the clock stops, and so does
     whatever recites over it («استمع», or an ayah heard alone), since a
     pause that leaves a voice reciting is not one. Resuming brings back
     what the pause stopped, and only that. */
  const held = useRef({ listen: false, ayah: false });
  const togglePause = () => {
    wakeSound();
    if (clock.paused) {
      clock.resume();
      if (held.current.ayah) ayah.resume();
      else if (held.current.listen) listen.resume();
      held.current = { listen: false, ayah: false };
    } else {
      clock.pause();
      held.current = { ayah: ayah.pause(), listen: listen.pause() };
    }
  };

  // Every press is a chance to unlock sound for a reciter whose turn comes
  // round later without one (see player.ts), and for the turn's tone.
  const done = () => {
    wakeSound();
    if (!lastPage) dispatch({ type: 'nextPage' });
    else finishTurn();
  };
  const skip = () => {
    wakeSound();
    finishTurn();
  };
  const toggleRecitation = () => {
    wakeSound();
    recitation.toggle();
  };
  const toggleListen = () => {
    wakeSound();
    listen.toggle();
  };
  const canGoBack = canStepBack(session);
  const back = () => {
    wakeSound();
    dispatch(
      session.pageInTurn > 0
        ? { type: 'previousPage' }
        : { type: 'previousTurn' },
    );
  };
  /* A finger drawn across the page turns between the turn's own pages and
     no further: past the last, the turn is the main button's to pass, and
     before the first, «القارئ السابق»'s. Handed to the page, which is drawn
     again only when it changes. */
  const canTurnOn = !end && !lastPage;
  const canTurnBack = !end && session.pageInTurn > 0;
  const turnPage = useCallback(
    (direction: 'forward' | 'back') => {
      if (direction === 'forward' ? !canTurnOn : !canTurnBack) return;
      wakeSound();
      dispatch({ type: direction === 'forward' ? 'nextPage' : 'previousPage' });
    },
    [dispatch, canTurnOn, canTurnBack],
  );

  /** Space: an ayah heard alone first, then whatever else runs. */
  const space = () => {
    const target = spaceTarget({
      ayah: ayah.status,
      reciting: !!seated,
      timed,
      listen: listen.status,
    });
    if (target === 'ayah') {
      wakeSound();
      if (ayah.status === 'playing' || ayah.status === 'loading') ayah.pause();
      else ayah.resume();
    } else if (target === 'recitation') toggleRecitation();
    else if (target === 'timer') togglePause();
    else if (target === 'listen') toggleListen();
    return target !== null;
  };

  // The next turn's pages, and the pages either side, load while this one
  // is read; kept the same list while they are the same pages, so the
  // page is not drawn again for a list that did not change.
  const prefetchKey = [...pagesOfRange(nextRange), page + 1, page - 1]
    .filter((p) => p >= 1 && p <= PAGE_COUNT)
    .join(',');
  const prefetch = useMemo(
    () => prefetchKey.split(',').filter(Boolean).map(Number),
    [prefetchKey],
  );

  const announcement = turnAnnouncement({
    end,
    phrase: turnPhrase(member),
    unit,
    range,
    page,
    reciter: reciter
      ? {
          name: reciter.short,
          status: recitation.status,
          untimed: recitation.untimed,
        }
      : null,
  });
  // Said once as it happens, beside the turn: a round read by everyone,
  // or «استمع» that could not play.
  const listenFailed = listen.status === 'error';
  const listenUntimed = listen.untimed
    ? untimedLabel(unit, listenRange, reciterById(config.reciter).short)
    : null;
  const notice = toast
    ? toast.said
    : listenFailed
      ? listenUntimed
        ? `${listenUntimed}. اختر شيخًا آخر.`
        : `تعذّر الاستماع إلى ${listenWhat}.`
      : '';

  return {
    session,
    plan,
    unit,
    /** How the sitting ended, once nothing is left to read. */
    end,
    range,
    pages,
    page,
    member,
    reciter,
    next,
    /** What finishing this turn completes, if nothing comes after it. */
    nextEnd,
    alone,
    lastPage,
    timed,
    /** The turn's time: the timed reader's clock or the reciter's
        recitation. */
    time: seated ? recitation.time : clock.time,
    clock,
    recitation,
    listen: { ...listen, what: listenWhat, untimedLabel: listenUntimed },
    /** An ayah heard alone, which wave 3's ayah bar plays; the pause and
        Space already reach it first. */
    ayah,
    toast,
    announcement,
    notice,
    prefetch,
    canGoBack,
    actions: {
      done,
      skip,
      back,
      toggleRecitation,
      toggleListen,
      togglePause,
      turnPage,
      space,
      goToPage: (p: number) => dispatch({ type: 'goToPage', page: p }),
      goToAyah: (ayah: number) => dispatch({ type: 'goToAyah', ayah }),
      restart: () => dispatch({ type: 'restartMushaf' }),
      // Letting the goal go carries the circle on from where it stopped.
      carryOn: () =>
        dispatch({
          type: 'configure',
          config: { ...config, goal: { to: 'none' } },
        }),
      end: () => dispatch({ type: 'end' }),
    },
  };
}

export type Turn = ReturnType<typeof useTurn>;
