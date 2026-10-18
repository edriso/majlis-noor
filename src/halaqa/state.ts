/* The whole of a halaqa as one value, and every way it can change.

   Plain functions with no React in them, so all of it is testable without a
   browser. `useHalaqa.ts` is the only file that connects this to React. */

import { ordinal } from '@/data/arabic';
import {
  AYAH_COUNT,
  clampPage,
  firstAyahOfPage,
  juzOfAyah,
  juzRange,
  PAGE_COUNT,
  pageOfAyah,
  pagesOfRange,
  surahOfAyah,
  surahRange,
  verseKey,
  type AyahRange,
} from '@/data/mushaf';
import { defaultReciter, reciterById, reciters } from '@/data/reciters';
import {
  anchorAt,
  END,
  endsRound,
  isBeforeStart,
  rangeOf,
  readerOf,
  round,
  roundOf,
  startOf,
  UNIT_COUNT,
  unitAfter,
  unitOf,
  unitStart,
  type Anchor,
  type Mode,
  type Plan,
  type Unit,
} from './schedule';

export type TurnChange = 'manual' | 'reciter';
export type Theme = 'burgundy' | 'green' | 'blue' | 'sand';
/** How the reciters' photographs are shown. Some readers would rather not
    look at faces, or not in a sitting with others; blurred keeps the
    picture's place, hidden puts the reciter's initial in its stead. */
export type Photos = 'show' | 'blur' | 'hide';
/** How fast recitations play: slower for a learner following word by word,
    a little faster for revision. Beyond these, tajweed suffers. */
export type Speed = 0.75 | 1 | 1.25;
/** Whether a soft tone marks a turn that passes on its own, when its time
    runs out or a reciter finishes, since nobody touched the screen. */
export type Cue = 'chime' | 'none';

/** Four seats: three readers and a reciter, or any mix. More would crowd
    the circle on a phone, and a bigger gathering has its own teacher. */
export const MAX_MEMBERS = 4;

/**
 * How much a turn may hold, unit by unit. The start screen offers these and
 * `sanitizeConfig()` keeps to them, so the two cannot disagree: a page to
 * three pages; one ayah to ten, as a review circle goes round; one quarter;
 * one surah. The first of each is the default.
 */
export const TURN_SIZES: Readonly<Record<Unit, readonly number[]>> = {
  page: [1, 2, 3],
  ayah: [1, 2, 3, 5, 10],
  rub: [1],
  surah: [1],
};

/** Someone in the room who reads aloud. An empty name means the default
    one, so a halaqa can start without anyone typing anything. */
export type Person = { id: string; kind: 'person'; name: string };

/** A recorded reciter given a seat. On his turn his recitation of the turn's
    pages plays while the others follow on the page, and the turn passes on
    when it ends, as a sheikh's would. */
export type ReciterMember = { id: string; kind: 'reciter'; reciter: string };

export type Member = Person | ReciterMember;
export type MemberKind = Member['kind'];

/** Where a sitting means to stop, if anywhere: the end of the surah or the
    juz it starts in, or the end of a given page. */
export type Goal =
  | { to: 'none' }
  | { to: 'surah' }
  | { to: 'juz' }
  | { to: 'page'; page: number };

export type Config = {
  /** Everyone in the circle, in the order they read. */
  members: Member[];
  mode: Mode;
  /** What a turn is counted in, and how many of it a turn reads: one of
      `TURN_SIZES[unit]`. */
  unit: Unit;
  size: number;
  turnChange: TurnChange;
  /** How much longer than the reciter a timed reader's turn lasts: people
      read slower than a master reciter, children slower still. */
  allowance: Allowance;
  reciter: string;
  /** Where the next sitting starts, as an ayah's number through the whole
      Mushaf (1 to 6236). A turn begins on the unit that holds it. */
  start: number;
  goal: Goal;
};

export type Allowance = 1 | 1.25 | 1.5;

export type Prefs = {
  theme: Theme;
  photos: Photos;
  speed: Speed;
  /** How many times «استمع» recites the page. */
  listenRepeat: 1 | 2 | 3;
  cue: Cue;
};

export type Session = {
  config: Config;
  anchor: Anchor;
  turn: number;
  /** Which of the current turn's pages is open, from 0. */
  pageInTurn: number;
  /** Pages the circle has finished in this sitting: a page counts when its
      last ayah is read, so a turn of a few ayat adds a page only as it
      reaches the foot of one. */
  pagesRead: number;
  /** Ayat the circle has finished in this sitting. */
  ayatRead: number;
  /** The last ayah the circle finished, 0 before it has finished any. */
  lastRead: number;
  /** When the sitting began, as the start action carried it (ms since the
      epoch); null for one saved before the app kept it. */
  startedAt: number | null;
  /** The first ayah the sitting read. */
  from: number;
  /** The ayah at which the sitting's goal is reached, exclusive (the goal
      read, this ayah is not); null for none. Worked out when the sitting
      starts, from where it starts. */
  until: number | null;
};

export type State = {
  prefs: Prefs;
  /** The circle as last set up, saved as it is chosen on the start screen,
      so the next halaqa starts from it. */
  config: Config;
  session: Session | null;
};

/** A first visit seats only «أنت»: someone reading alone starts at once,
    and a group adds its readers, which are then kept for the next time. */
export const defaultConfig: Config = {
  members: [{ id: 'p1', kind: 'person', name: '' }],
  mode: 'continue',
  unit: 'page',
  size: 1,
  turnChange: 'manual',
  allowance: 1,
  reciter: defaultReciter,
  start: 1,
  goal: { to: 'none' },
};

export const defaultPrefs: Prefs = {
  theme: 'green',
  photos: 'show',
  speed: 1,
  listenRepeat: 1,
  cue: 'chime',
};

export const initialState: State = {
  prefs: defaultPrefs,
  config: defaultConfig,
  session: null,
};

export const planOf = (c: Config): Plan => ({
  readers: c.members.length,
  mode: c.members.length === 1 ? 'continue' : c.mode,
  unit: c.unit,
  size: c.size,
});

/* Members are told apart by an id that stays with them when the circle is
   reordered: `p1`…`p4` for people, `r1`…`r4` for reciters. A person's
   default name comes from that number, not from where they sit, so moving
   «القارئ الثاني» up the list moves that reader, visibly, rather than
   renaming two seats. `p1` is the person holding the device: «أنت». */

const numberOf = (m: Member) => Number(m.id.slice(1));

/** The name a member is shown by. */
export function memberName(m: Member) {
  if (m.kind === 'reciter') return reciterById(m.reciter).short;
  const name = m.name.trim();
  if (name) return name;
  const n = numberOf(m);
  return n === 1 ? 'أنت' : `القارئ ${ordinal(n)}`;
}

/** Whether a member is the unnamed «أنت», who is spoken to, not of. */
const isYou = (m: Member) =>
  m.kind === 'person' && m.id === 'p1' && !m.name.trim();

/** «دورك», «دور أحمد», or «يتلو الحصري» for a reciter's turn. */
export function turnPhrase(m: Member) {
  if (m.kind === 'reciter') return `يتلو ${memberName(m)}`;
  return isYou(m) ? 'دورك' : `دور ${memberName(m)}`;
}

/** A new member of the given kind, with the first id not taken. Returns
    null when the circle is full. */
export function newMember(
  members: readonly Member[],
  kind: MemberKind,
  reciter: string = defaultReciter,
): Member | null {
  if (members.length >= MAX_MEMBERS) return null;
  const prefix = kind === 'person' ? 'p' : 'r';
  const taken = new Set(members.map((m) => m.id));
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  const id = `${prefix}${n}`;
  return kind === 'person' ? { id, kind, name: '' } : { id, kind, reciter };
}

/* What the circle is reading. A sitting with a goal reads up to it and no
   further, as every sitting reads up to the end of the Mushaf: both cut the
   turn that crosses them, and leave nothing for the turns after. */

const endOf = (s: Session) => s.until ?? END;

/** The ayat a turn reads, as a half-open range of ayah numbers. */
export const turnRange = (s: Session, turn: number) =>
  rangeOf(planOf(s.config), s.anchor, turn, endOf(s));

/** The pages a turn reads, in order. */
export const turnPages = (s: Session, turn: number) =>
  pagesOfRange(turnRange(s, turn));

export const currentRange = (s: Session) => turnRange(s, s.turn);
export const currentPages = (s: Session) => turnPages(s, s.turn);

const isEmpty = (r: AyahRange) => r.to <= r.from;

/** How a sitting with nothing left to read ended: the Mushaf completed (a
    khatm), or the goal it set itself reached. Null while there is more. */
export type Completion = 'khatm' | 'goal' | null;

export function completion(s: Session): Completion {
  if (!isEmpty(currentRange(s))) return null;
  const plan = planOf(s.config);
  return isEmpty(rangeOf(plan, s.anchor, s.turn)) ? 'khatm' : 'goal';
}

export const isComplete = (s: Session) => completion(s) !== null;

/**
 * Where the circle is: the first ayah it has not yet left behind. That is
 * the start of the turn, or of the page open in it if the reader has turned
 * on; after a khatm, the end of the Mushaf, and after the goal, the goal.
 * The next sitting starts here, and a change to the circle carries on from
 * here.
 */
export function placeOf(s: Session) {
  const range = currentRange(s);
  if (!isEmpty(range)) {
    const pages = pagesOfRange(range);
    const open = pages[Math.min(s.pageInTurn, pages.length - 1)];
    return Math.max(range.from, firstAyahOfPage(open));
  }
  return completion(s) === 'khatm' ? END : endOf(s);
}

/** The page open: one of the turn's, or, once nothing is left, the last
    page read. */
export function currentPage(s: Session) {
  const pages = currentPages(s);
  if (pages.length) return pages[Math.min(s.pageInTurn, pages.length - 1)];
  return pageOfAyah(placeOf(s) - 1);
}

/** Where the next sitting starts if this one ends now: where it stopped,
    or al-Fatihah after a khatm. */
export const nextStart = (s: Session) => {
  const place = placeOf(s);
  return place > AYAH_COUNT ? 1 : place;
};

/** The turn after the current one. */
export const nextTurnOf = (s: Session) => s.turn + 1;

/** The next turn, from the current one on, that belongs to `seat`: what
    the circle shows under each seat. */
export function seatTurn(s: Session, seat: number) {
  const plan = planOf(s.config);
  return (
    s.turn + ((seat - readerOf(plan, s.turn) + plan.readers) % plan.readers)
  );
}

/** Whether «القارئ السابق» (or the previous page in the turn) has
    somewhere to go. */
export function canStepBack(s: Session) {
  if (s.pageInTurn > 0) return true;
  const plan = planOf(s.config);
  const turn = s.turn - 1;
  return turn >= 0 && !isBeforeStart(plan, s.anchor, turn);
}

/** The ayah at which `goal` is reached for a sitting at `place`, exclusive;
    null for no goal, or for one already behind. */
export function goalEnd(goal: Goal, place: number): number | null {
  const at = Math.min(Math.max(place, 1), AYAH_COUNT);
  const end =
    goal.to === 'surah'
      ? surahRange(surahOfAyah(at)).to
      : goal.to === 'juz'
        ? juzRange(juzOfAyah(at)).to
        : goal.to === 'page'
          ? firstAyahOfPage(goal.page + 1)
          : null;
  return end !== null && end > place ? end : null;
}

const sameGoal = (a: Goal, b: Goal) =>
  a.to === b.to && (a.to !== 'page' || b.to !== 'page' || a.page === b.page);

const samePlan = (a: Plan, b: Plan) =>
  a.readers === b.readers &&
  a.mode === b.mode &&
  a.unit === b.unit &&
  a.size === b.size;

export type Action =
  | { type: 'draft'; config: Config }
  /** `at` is the time it starts, read by the event handler, so the reducer
      stays pure. */
  | { type: 'start'; config: Config; at: number }
  | { type: 'end' }
  | { type: 'finishTurn' }
  | { type: 'previousTurn' }
  | { type: 'nextPage' }
  | { type: 'previousPage' }
  | { type: 'goToPage'; page: number }
  | { type: 'goToAyah'; ayah: number }
  | { type: 'configure'; config: Config }
  | { type: 'restartMushaf' }
  | { type: 'prefs'; prefs: Partial<Prefs> };

/** The pages a stretch of ayat finishes: those whose last ayah is in it. */
const pagesFinished = (r: AyahRange) =>
  isEmpty(r) ? 0 : unitOf('page', r.to) - unitOf('page', r.from);

/** What finishing a turn adds to the circle's progress: every turn's ayat
    in continue mode, and a round's ayat once, as it ends, in repeat mode. */
function finishedBy(s: Session, turn: number) {
  const plan = planOf(s.config);
  const range = turnRange(s, turn);
  if (plan.mode === 'repeat' && !endsRound(plan, turn))
    return { pages: 0, ayat: 0, range };
  return { pages: pagesFinished(range), ayat: range.to - range.from, range };
}

/** Which page of `next`'s turn to open so the page in front of the reader
    stays where it is, when it is one of them. */
function keepOpen(s: Session, next: Session) {
  const pages = currentPages(next);
  const at = pages.indexOf(currentPage(s));
  return at !== -1 ? at : Math.max(0, Math.min(s.pageInTurn, pages.length - 1));
}

/**
 * Moves the current turn so it begins on the unit holding ayah `a`, with
 * the page that ayah is on open. Re-anchoring keeps the turn number, so the
 * same member keeps the turn. A jump to or past the sitting's goal leaves
 * the goal behind, and the sitting carries on without one.
 */
function jumpTo(s: Session, a: number): Session {
  const plan = planOf(s.config);
  const ayah = Math.min(Math.max(Math.round(a) || 1, 1), AYAH_COUNT);
  const anchor = anchorAt(s.turn, unitOf(plan.unit, ayah));
  const passed = s.until !== null && unitStart(plan.unit, anchor.at) >= s.until;
  const next: Session = {
    ...s,
    anchor,
    until: passed ? null : s.until,
    pageInTurn: 0,
  };
  return {
    ...next,
    pageInTurn: Math.max(0, currentPages(next).indexOf(pageOfAyah(ayah))),
  };
}

export function reduce(state: State, action: Action): State {
  if (action.type === 'prefs')
    return { ...state, prefs: { ...state.prefs, ...action.prefs } };

  // The start screen's choices, kept as they are made, so a refresh or the
  // next visit finds the circle as it was left.
  if (action.type === 'draft')
    return { ...state, config: sanitizeConfig(action.config) };

  if (action.type === 'start') {
    const config = sanitizeConfig(action.config);
    const anchor = anchorAt(0, unitOf(config.unit, config.start));
    return {
      ...state,
      config,
      session: {
        config,
        anchor,
        turn: 0,
        pageInTurn: 0,
        pagesRead: 0,
        ayatRead: 0,
        lastRead: 0,
        startedAt: Number.isFinite(action.at) ? action.at : null,
        from: unitStart(config.unit, anchor.at),
        // From the place chosen, not the start of the unit holding it: a
        // quarter that opens in the surah before is still a sitting in the
        // surah that was chosen.
        until: goalEnd(config.goal, config.start),
      },
    };
  }

  // Ending keeps the place: the next halaqa starts where this one stopped.
  if (action.type === 'end')
    return state.session
      ? {
          ...state,
          config: { ...state.config, start: nextStart(state.session) },
          session: null,
        }
      : state;

  const s = state.session;
  if (!s) return state;
  const plan = planOf(s.config);
  const pages = currentPages(s);
  const set = (session: Session): State => ({ ...state, session });
  // A change to the circle is also the circle the next halaqa starts from.
  const configured = (session: Session): State => ({
    ...state,
    config: session.config,
    session,
  });

  switch (action.type) {
    case 'finishTurn': {
      if (pages.length === 0) return state;
      const done = finishedBy(s, s.turn);
      return set({
        ...s,
        turn: s.turn + 1,
        pageInTurn: 0,
        pagesRead: s.pagesRead + done.pages,
        ayatRead: s.ayatRead + done.ayat,
        lastRead: done.ayat ? done.range.to - 1 : s.lastRead,
      });
    }

    case 'previousTurn': {
      const turn = s.turn - 1;
      if (turn < 0 || isBeforeStart(plan, s.anchor, turn)) return state;
      const undone = finishedBy(s, turn);
      const pagesRead = Math.max(0, s.pagesRead - undone.pages);
      const ayatRead = Math.max(0, s.ayatRead - undone.ayat);
      // What was finished before the turn stepped back to ends where it
      // begins, unless nothing was.
      const lastRead = !undone.ayat
        ? s.lastRead
        : pagesRead || ayatRead
          ? undone.range.from - 1
          : 0;
      return set({ ...s, turn, pageInTurn: 0, pagesRead, ayatRead, lastRead });
    }

    case 'nextPage': {
      if (s.pageInTurn < pages.length - 1)
        return set({ ...s, pageInTurn: s.pageInTurn + 1 });
      const page = currentPage(s);
      if (pages.length === 0 || page >= PAGE_COUNT) return state;
      if (s.until !== null && firstAyahOfPage(page + 1) >= s.until)
        return state;
      // Past the end of the turn the whole circle moves one page on. A turn
      // of pages keeps its length and its open page; a turn of anything
      // else begins in the next page, as a jump to it would.
      if (plan.unit !== 'page')
        return set(jumpTo(s, firstAyahOfPage(page + 1)));
      const first = startOf(plan, s.anchor, s.turn);
      return set({ ...s, anchor: anchorAt(s.turn, clampPage(first + 1)) });
    }

    case 'previousPage': {
      if (s.pageInTurn > 0) return set({ ...s, pageInTurn: s.pageInTurn - 1 });
      const page = currentPage(s);
      if (page <= 1) return state;
      if (plan.unit !== 'page')
        return set(jumpTo(s, firstAyahOfPage(page - 1)));
      const first = startOf(plan, s.anchor, s.turn);
      if (first <= 1) return state;
      return set(jumpTo(s, firstAyahOfPage(clampPage(first - 1))));
    }

    case 'goToPage': {
      const page = clampPage(action.page);
      const at = pages.indexOf(page);
      if (at !== -1) return set({ ...s, pageInTurn: at });
      return set(jumpTo(s, firstAyahOfPage(page)));
    }

    case 'goToAyah':
      return set(jumpTo(s, action.ayah));

    case 'restartMushaf':
      return set(jumpTo(s, 1));

    case 'configure': {
      const config = sanitizeConfig(action.config);
      const next = planOf(config);
      const here = placeOf(s);
      const reached = completion(s) === 'goal';
      /* The goal is worked out again only if it was changed; changed in a
         sitting, «the end of the surah» is the surah being read. */
      const keptGoal = sameGoal(config.goal, s.config.goal);
      const until = keptGoal ? s.until : goalEnd(config.goal, here);
      /* Whoever is reading keeps the turn wherever they now sit: the circle
         may have been reordered, or someone added or removed. If it was
         they who left, the turn goes to whoever took their seat. */
      const seat = readerOf(plan, s.turn);
      const moved = config.members.findIndex(
        (m) => m.id === s.config.members[seat]?.id,
      );
      let reader = moved !== -1 ? moved : Math.min(seat, next.readers - 1);
      const repeating = plan.mode === 'repeat' && next.mode === 'repeat';
      const ahead = (c: Config, n: number) =>
        c.members
          .slice(0, n)
          .map((m) => m.id)
          .join();
      const unchanged =
        samePlan(next, plan) &&
        reader === seat &&
        (!repeating || ahead(config, reader) === ahead(s.config, seat));
      if (unchanged) {
        // A goal reached and then changed or let go («تابعوا») carries the
        // circle on from where it stopped, in the unit that holds it.
        if (reached && !keptGoal)
          return configured({
            ...s,
            config,
            until,
            anchor: anchorAt(s.turn, unitOf(plan.unit, here)),
            pageInTurn: 0,
          });
        return configured({ ...s, config, until });
      }

      // A fresh round, so the turn number names the right member from here
      // on; the turns before this one are history either way.
      const start = (roundOf(plan, s.turn) + 1) * next.readers;

      // Continue mode carries on from the place being read; a goal reached
      // and kept stays reached.
      if (!repeating) {
        const turn = start + reader;
        const at =
          reached && keptGoal
            ? unitAfter(next.unit, here)
            : unitOf(next.unit, here);
        const carried: Session = {
          ...s,
          config,
          until,
          turn,
          anchor: anchorAt(turn, at),
        };
        return configured({ ...carried, pageInTurn: keepOpen(s, carried) });
      }

      /* In repeat mode everyone reads the round's ayat, in the circle's
         order, so the round keeps its first unit and nobody is left out of
         it. If the reader who left sat last, everyone else has read them
         and the circle moves on. Otherwise, if anyone now seated ahead of
         the reader is still to read them (moved up, newly added, or the
         turn now covers ayat they did not read), the round starts over
         from the first seat. If not, the reader carries on where they
         were, and those ahead keep their marks. */
      const first = startOf(plan, s.anchor, s.turn);
      const read = currentRange(s);
      const firstNext =
        next.unit === plan.unit
          ? first
          : first > UNIT_COUNT[plan.unit]
            ? UNIT_COUNT[next.unit] + 1
            : unitOf(next.unit, unitStart(plan.unit, first));
      if (moved === -1 && seat >= next.readers) {
        const at =
          next.unit === plan.unit
            ? first + plan.size
            : unitOf(next.unit, read.to);
        return configured({
          ...s,
          config,
          until,
          turn: start,
          anchor: anchorAt(start, at),
          pageInTurn: 0,
          pagesRead: s.pagesRead + pagesFinished(read),
          ayatRead: s.ayatRead + (read.to - read.from),
          lastRead: isEmpty(read) ? s.lastRead : read.to - 1,
        });
      }
      const was = new Map(
        round(plan, s.anchor, s.turn).map((r) => [
          s.config.members[r.reader].id,
          r.state,
        ]),
      );
      const fresh = rangeOf(
        next,
        anchorAt(start, firstNext),
        start,
        until ?? END,
      );
      const covered =
        isEmpty(fresh) || (fresh.from >= read.from && fresh.to <= read.to);
      const marks = config.members.slice(0, reader).map((m) => was.get(m.id));
      let ticked = 0;
      if (!covered || marks.some((m) => m !== 'done' && m !== 'skipped'))
        reader = 0;
      // The anchor goes after the last one passed over, so those before it
      // read as passed over and those after it as ticked.
      else ticked = marks.lastIndexOf('skipped') + 1;
      const carried: Session = {
        ...s,
        config,
        until,
        turn: start + reader,
        anchor: anchorAt(start + ticked, firstNext),
        pageInTurn: 0,
      };
      return configured({
        ...carried,
        pageInTurn: reader === moved ? keepOpen(s, carried) : 0,
      });
    }
  }
}

/** A member and how the circle names them, for the close of a sitting. */
export type Sitter = { id: string; kind: MemberKind; name: string };

/** An ayah as the close of a sitting shows it: its number through the
    Mushaf, its verse key and its page. */
export type Place = { ayah: number; key: string; page: number };

export type Summary = {
  /** Where the sitting began. */
  from: Place;
  /** The last ayah the circle finished; null if it finished none. */
  to: Place | null;
  pagesRead: number;
  ayatRead: number;
  /** How long it lasted; null for a sitting saved before its start was
      kept. */
  durationMs: number | null;
  members: Sitter[];
};

const placeAt = (ayah: number): Place => ({
  ayah,
  key: verseKey(ayah),
  page: pageOfAyah(ayah),
});

/**
 * The close of a sitting: from where to where, how much, how long, and who
 * sat. What was read is what the circle finished, the same count as
 * `pagesRead`: a turn under way when the sitting ends is not counted.
 */
export function summaryOf(s: Session, endedAt: number): Summary {
  return {
    from: placeAt(s.from),
    to: s.lastRead ? placeAt(s.lastRead) : null,
    pagesRead: s.pagesRead,
    ayatRead: s.ayatRead,
    durationMs:
      s.startedAt === null ? null : Math.max(0, endedAt - s.startedAt),
    members: s.config.members.map((m) => ({
      id: m.id,
      kind: m.kind,
      name: memberName(m),
    })),
  };
}

const themes: Theme[] = ['green', 'burgundy', 'blue', 'sand'];
const photoModes: Photos[] = ['show', 'blur', 'hide'];
const units: Unit[] = ['page', 'ayah', 'rub', 'surah'];

/** `v` if it is one of `options`, else `fallback`. */
const oneOf = <T>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback;

const intIn = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? v
    : fallback;

const knownReciter = (id: unknown) =>
  reciters.some((r) => r.id === id) ? (id as string) : defaultReciter;

const idPattern: Record<MemberKind, RegExp> = {
  person: new RegExp(`^p[1-${MAX_MEMBERS}]$`),
  reciter: new RegExp(`^r[1-${MAX_MEMBERS}]$`),
};

/** The members of a stored configuration, repaired: each a known kind with a
    unique id of its kind, a person's name a string of at most 40
    characters, a reciter one that exists. A configuration saved before
    reciters could sit in the circle has `readers`, a list of names, and
    becomes people in the same order under the same default names. */
function sanitizeMembers(c: Record<string, unknown>): Member[] {
  const raw: unknown[] = Array.isArray(c.members)
    ? c.members
    : Array.isArray(c.readers)
      ? c.readers.map((name) => ({ kind: 'person', name }))
      : defaultConfig.members;
  const members: Member[] = [];
  for (const item of raw) {
    if (members.length === MAX_MEMBERS) break;
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const kind: MemberKind = m.kind === 'reciter' ? 'reciter' : 'person';
    const own =
      typeof m.id === 'string' &&
      idPattern[kind].test(m.id) &&
      !members.some((other) => other.id === m.id);
    const id = own ? (m.id as string) : newMember(members, kind)!.id;
    members.push(
      kind === 'person'
        ? {
            id,
            kind,
            name: typeof m.name === 'string' ? m.name.slice(0, 40) : '',
          }
        : { id, kind, reciter: knownReciter(m.reciter) },
    );
  }
  return members.length ? members : [defaultConfig.members[0]];
}

function sanitizeGoal(v: unknown): Goal {
  const g = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  if (g.to === 'surah' || g.to === 'juz') return { to: g.to };
  if (g.to === 'page') {
    const page = intIn(g.page, 1, PAGE_COUNT, 0);
    if (page) return { to: 'page', page };
  }
  return { to: 'none' };
}

/** Whatever was stored, made into a valid configuration. A stored value is
    data from an older version or a hand-edited store, never trusted. One
    saved before turns could be counted in anything but pages has
    `pagesPerTurn` and `startPage`, and is read as turns of pages. */
export function sanitizeConfig(raw: unknown): Config {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const members = sanitizeMembers(c);
  const mode: Mode = c.mode === 'repeat' ? 'repeat' : 'continue';
  const unit = oneOf(c.unit, units, 'page');
  const sizes = TURN_SIZES[unit];
  const size =
    c.size === undefined && unit === 'page'
      ? oneOf(c.pagesPerTurn, sizes, sizes[0])
      : oneOf(c.size, sizes, sizes[0]);
  return {
    members,
    mode,
    unit,
    size,
    turnChange: c.turnChange === 'reciter' ? 'reciter' : 'manual',
    allowance: oneOf(c.allowance, [1, 1.25, 1.5] as const, 1),
    reciter: knownReciter(c.reciter),
    start: intIn(
      c.start,
      1,
      AYAH_COUNT,
      firstAyahOfPage(intIn(c.startPage, 1, PAGE_COUNT, 1)),
    ),
    goal: sanitizeGoal(c.goal),
  };
}

export function sanitizeState(raw: unknown): State {
  const r = (raw ?? {}) as Partial<State>;
  const p = (r.prefs ?? {}) as Partial<Prefs>;
  const prefs: Prefs = {
    theme: themes.includes(p.theme as Theme) ? (p.theme as Theme) : 'green',
    photos: oneOf(p.photos, photoModes, 'show'),
    speed: oneOf(p.speed, [0.75, 1, 1.25] as const, 1),
    listenRepeat: oneOf(p.listenRepeat, [1, 2, 3] as const, 1),
    cue: oneOf(p.cue, ['chime', 'none'] as const, 'chime'),
  };
  const config = sanitizeConfig(r.config);
  let session: Session | null = null;
  const s = r.session as Record<string, unknown> | null | undefined;
  if (s && typeof s === 'object') {
    const sc = sanitizeConfig(s.config);
    const turn = intIn(s.turn, 0, Number.MAX_SAFE_INTEGER, 0);
    // A halaqa saved before turns had units anchored a page, `anchor.page`.
    const a = (s.anchor ?? {}) as Record<string, unknown>;
    const at = a.at ?? (sc.unit === 'page' ? a.page : undefined);
    const anchor = anchorAt(
      intIn(a.turn, 0, turn, 0),
      intIn(at, 1, UNIT_COUNT[sc.unit] + 1, unitOf(sc.unit, sc.start)),
    );
    const stored = s.startedAt;
    const built: Session = {
      config: sc,
      anchor,
      turn,
      pageInTurn: 0,
      pagesRead: intIn(s.pagesRead, 0, Number.MAX_SAFE_INTEGER, 0),
      ayatRead: intIn(s.ayatRead, 0, Number.MAX_SAFE_INTEGER, 0),
      lastRead: 0,
      startedAt:
        typeof stored === 'number' && Number.isFinite(stored) && stored >= 0
          ? stored
          : null,
      from: intIn(s.from, 1, AYAH_COUNT, sc.start),
      until: intIn(s.until, 2, END, 0) || null,
    };
    session = {
      ...built,
      pageInTurn: Math.min(
        intIn(s.pageInTurn, 0, Number.MAX_SAFE_INTEGER, 0),
        Math.max(0, currentPages(built).length - 1),
      ),
      lastRead: intIn(s.lastRead, 0, AYAH_COUNT, lastBefore(built)),
    };
  }
  return { prefs, config, session };
}

/** For a sitting saved before the last ayah read was kept: the end of the
    turn before the current one, or of the round before in repeat mode,
    if the circle had read anything. */
function lastBefore(s: Session) {
  if (!s.pagesRead && !s.ayatRead) return 0;
  const plan = planOf(s.config);
  const turn =
    plan.mode === 'repeat'
      ? roundOf(plan, s.turn) * plan.readers - 1
      : s.turn - 1;
  const range = turnRange(s, turn);
  return isEmpty(range) ? 0 : range.to - 1;
}
