import { describe, expect, it } from 'vitest';
import {
  AYAH_COUNT,
  ayahIndex,
  firstAyahOfPage,
  juzRange,
  rubStart,
  surahRange,
} from '@/data/mushaf';
import {
  canStepBack,
  completion,
  currentPage,
  currentPages,
  currentRange,
  defaultConfig,
  initialState,
  isComplete,
  MAX_MEMBERS,
  memberName,
  newMember,
  nextStart,
  nextTurnOf,
  placeOf,
  reduce,
  sanitizeConfig,
  sanitizeState,
  seatTurn,
  planOf,
  summaryOf,
  turnPages,
  turnPhrase,
  turnRange,
  TURN_SIZES,
  type Action,
  type Config,
  type Member,
  type State,
} from './state';
import { readerOf, round, type Unit } from './schedule';

const person = (id: string, name = ''): Member => ({
  id,
  kind: 'person',
  name,
});

/** The first ayah of a page, which is where a halaqa chosen by page starts. */
const page = firstAyahOfPage;

/** When the example sittings begin. */
const T0 = Date.UTC(2026, 9, 18, 18, 0);

/** The brief's example circle: three readers, unless a case says otherwise. */
const threeReaders = [person('p1'), person('p2'), person('p3')];

const run = (config: Partial<Config>, ...actions: Action[]) =>
  actions.reduce(
    reduce,
    reduce(initialState, {
      type: 'start',
      config: { ...defaultConfig, members: threeReaders, ...config },
      at: T0,
    }),
  );

const finish = (s: State, times = 1) => {
  for (let i = 0; i < times; i++) s = reduce(s, { type: 'finishTurn' });
  return s;
};

const where = (s: State) => {
  const session = s.session!;
  return {
    page: currentPage(session),
    reader: session.turn % session.config.members.length,
  };
};

/** The current turn's ayat as verse keys, «2:5–2:9», for a readable case. */
const ayat = (s: State) => {
  const { from, to } = currentRange(s.session!);
  return [from, to - 1];
};

describe('a halaqa', () => {
  it('runs the example session from the brief', () => {
    // Al-Baqarah from page 2, three readers, continue, one page each.
    let s = run({ start: page(2) });
    const seen = [where(s)];
    for (let i = 0; i < 3; i++) {
      s = reduce(s, { type: 'finishTurn' });
      seen.push(where(s));
    }
    expect(seen).toEqual([
      { page: 2, reader: 0 },
      { page: 3, reader: 1 },
      { page: 4, reader: 2 },
      { page: 5, reader: 0 },
    ]);
    expect(s.session!.pagesRead).toBe(3);
    expect(s.session!.ayatRead).toBe(page(5) - page(2));
  });

  it('steps through a turn of two pages before passing it on', () => {
    let s = run({ start: page(20), size: 2 });
    expect(currentPages(s.session!)).toEqual([20, 21]);
    s = reduce(s, { type: 'nextPage' });
    expect(where(s)).toEqual({ page: 21, reader: 0 });
    s = reduce(s, { type: 'finishTurn' });
    expect(where(s)).toEqual({ page: 22, reader: 1 });
  });

  it('counts a repeated page once, when the round completes', () => {
    let s = run({ start: page(24), mode: 'repeat' });
    s = finish(s, 2);
    expect(s.session!.pagesRead).toBe(0);
    s = finish(s);
    expect(s.session!.pagesRead).toBe(1);
    expect(s.session!.ayatRead).toBe(page(25) - page(24));
    expect(where(s)).toEqual({ page: 25, reader: 0 });
  });

  it('goes back to the previous reader and un-counts their pages', () => {
    let s = run({ start: page(10) }, { type: 'finishTurn' });
    s = reduce(s, { type: 'previousTurn' });
    expect(where(s)).toEqual({ page: 10, reader: 0 });
    expect(s.session!.pagesRead).toBe(0);
    expect(s.session!.ayatRead).toBe(0);
    expect(s.session!.lastRead).toBe(0);
    expect(reduce(s, { type: 'previousTurn' })).toBe(s);
    expect(canStepBack(s.session!)).toBe(false);
  });

  it('moves the whole circle one page on past the end of a turn', () => {
    let s = run({ start: page(10) });
    s = reduce(s, { type: 'nextPage' });
    expect(where(s)).toEqual({ page: 11, reader: 0 });
    s = reduce(s, { type: 'finishTurn' });
    expect(where(s)).toEqual({ page: 12, reader: 1 });
  });

  it('moves a turn of two pages on by one, keeping the page open', () => {
    let s = run({ start: page(20), size: 2 }, { type: 'nextPage' });
    s = reduce(s, { type: 'nextPage' });
    expect(currentPages(s.session!)).toEqual([21, 22]);
    expect(where(s)).toEqual({ page: 22, reader: 0 });
    s = reduce(s, { type: 'previousPage' });
    s = reduce(s, { type: 'previousPage' });
    expect(currentPages(s.session!)).toEqual([20, 21]);
    expect(where(s)).toEqual({ page: 20, reader: 0 });
  });

  it('jumps to a page with the same reader', () => {
    let s = run({ start: page(10) }, { type: 'finishTurn' });
    s = reduce(s, { type: 'goToPage', page: 300 });
    expect(where(s)).toEqual({ page: 300, reader: 1 });
    s = reduce(s, { type: 'finishTurn' });
    expect(where(s)).toEqual({ page: 301, reader: 2 });
  });

  it('keeps the page and the reader when the circle changes shape', () => {
    let s = run({ start: page(10) }, { type: 'finishTurn' });
    const config = {
      ...s.session!.config,
      mode: 'repeat' as const,
      size: 2,
    };
    s = reduce(s, { type: 'configure', config });
    expect(where(s)).toEqual({ page: 11, reader: 1 });
    expect(currentPages(s.session!)).toEqual([11, 12]);
    // Two readers now: reader 3 is gone, so a reader beyond the circle
    // falls back to the last seat.
    s = reduce(s, {
      type: 'configure',
      config: { ...config, members: config.members.slice(0, 2) },
    });
    expect(
      readerOf(
        { readers: 2, mode: 'repeat', unit: 'page', size: 2 },
        s.session!.turn,
      ),
    ).toBe(1);
  });

  it('completes the Mushaf, then starts a new khatma from al-Fatihah', () => {
    let s = run(
      { start: page(604), members: [person('p1')] },
      { type: 'finishTurn' },
    );
    expect(isComplete(s.session!)).toBe(true);
    expect(completion(s.session!)).toBe('khatm');
    expect(currentPage(s.session!)).toBe(604);
    expect(reduce(s, { type: 'finishTurn' })).toBe(s);
    expect(reduce(s, { type: 'nextPage' })).toBe(s);
    s = reduce(s, { type: 'restartMushaf' });
    expect(where(s)).toEqual({ page: 1, reader: 0 });
    expect(completion(s.session!)).toBeNull();
  });

  it('ends', () => {
    expect(run({}, { type: 'end' }).session).toBeNull();
  });

  it('records when and where the sitting began', () => {
    const s = run({ start: page(77) }).session!;
    expect(s.startedAt).toBe(T0);
    expect(s.from).toBe(page(77));
    expect(s.until).toBeNull();
  });
});

describe('ending keeps the place', () => {
  it('starts the next halaqa where this one stopped', () => {
    let s = run({ start: page(10) }, { type: 'finishTurn' });
    s = finish(s);
    s = reduce(s, { type: 'end' });
    expect(s.config.start).toBe(page(12));
    s = reduce(s, { type: 'start', config: s.config, at: T0 });
    expect(where(s)).toEqual({ page: 12, reader: 0 });
  });

  it('keeps the page open in a turn of two pages', () => {
    const s = run({ start: page(20), size: 2 }, { type: 'nextPage' });
    expect(nextStart(s.session!)).toBe(page(21));
    expect(reduce(s, { type: 'end' }).config.start).toBe(page(21));
  });

  it('keeps the ayah, part-way down a page', () => {
    const s = run(
      { start: ayahIndex(2, 1), unit: 'ayah', size: 3 },
      { type: 'finishTurn' },
      { type: 'end' },
    );
    expect(s.config.start).toBe(ayahIndex(2, 4));
  });

  it('goes back to al-Fatihah after a khatm', () => {
    const s = run(
      { start: page(604), members: [person('p1')] },
      { type: 'finishTurn' },
      { type: 'end' },
    );
    expect(s.config.start).toBe(1);
  });

  it('keeps the circle as it was changed in the sitting', () => {
    let s = run({ start: page(10) });
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, mode: 'repeat' },
    });
    s = reduce(s, { type: 'end' });
    expect(s.config.mode).toBe('repeat');
    expect(s.config.start).toBe(page(10));
  });
});

describe('the circle', () => {
  it('keeps the reader when the circle is reordered', () => {
    // Omar (p2) is reading page 11; the circle is turned round.
    let s = run({ start: page(10) }, { type: 'finishTurn' });
    const [a, b, c] = s.session!.config.members;
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, members: [c, b, a] },
    });
    expect(where(s).page).toBe(11);
    const session = s.session!;
    expect(session.config.members[where(s).reader].id).toBe('p2');
    // And the circle goes on in its new order: c, b, a, c …
    s = reduce(s, { type: 'finishTurn' });
    expect(s.session!.config.members[where(s).reader].id).toBe('p1');
    expect(where(s).page).toBe(12);
  });

  it('gives the turn to whoever takes the seat of a reader who leaves', () => {
    let s = run({ start: page(10) }, { type: 'finishTurn' });
    const [a, , c] = s.session!.config.members;
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, members: [a, c] },
    });
    expect(s.session!.config.members[where(s).reader].id).toBe('p3');
    expect(where(s).page).toBe(11);
  });

  it('changes nothing about the turn when only a name changes', () => {
    const s = run({ start: page(10) }, { type: 'finishTurn' });
    const members = s.session!.config.members.map((m) =>
      m.id === 'p2' ? { ...m, name: 'عمر' } : m,
    );
    const t = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, members },
    });
    expect(t.session!.turn).toBe(s.session!.turn);
    expect(t.session!.anchor).toEqual(s.session!.anchor);
  });

  describe('in repeat mode, nobody misses the page', () => {
    const ids = (st: State) => st.session!.config.members.map((m) => m.id);
    const reading = (st: State) =>
      st.session!.config.members[where(st).reader].id;
    const states = (st: State) => {
      const session = st.session!;
      return round(planOf(session.config), session.anchor, session.turn).map(
        (r) => r.state,
      );
    };
    const reorder = (st: State, order: string[]) =>
      reduce(st, {
        type: 'configure',
        config: {
          ...st.session!.config,
          members: order.map((id) =>
            st.session!.config.members.find((m) => m.id === id)!,
          ),
        },
      });

    it('starts the page over when someone who has not read it moves ahead', () => {
      // p1 is reading page 20 and nobody has read it yet.
      let s = run({ start: page(20), mode: 'repeat' });
      s = reorder(s, ['p2', 'p1', 'p3']);
      expect(ids(s)).toEqual(['p2', 'p1', 'p3']);
      expect(reading(s)).toBe('p2');
      expect(where(s).page).toBe(20);
      for (const next of ['p1', 'p3']) {
        s = reduce(s, { type: 'finishTurn' });
        expect([reading(s), where(s).page]).toEqual([next, 20]);
      }
      s = reduce(s, { type: 'finishTurn' });
      expect([reading(s), where(s).page]).toEqual(['p2', 21]);
    });

    it('lets the reader carry on when everyone ahead has read the page', () => {
      // p1 has read page 20; p2 is reading it; a fourth reader joins.
      let s = run({ start: page(20), mode: 'repeat' }, { type: 'finishTurn' });
      const members = [...s.session!.config.members, person('p4', 'زيد')];
      s = reduce(s, {
        type: 'configure',
        config: { ...s.session!.config, members },
      });
      expect([reading(s), where(s).page]).toEqual(['p2', 20]);
      expect(states(s)).toEqual(['done', 'now', 'waiting', 'waiting']);
    });

    it('puts a reader who has not read the page first, ahead of one who has', () => {
      let s = run({ start: page(20), mode: 'repeat' }, { type: 'finishTurn' });
      s = reorder(s, ['p3', 'p2', 'p1']);
      expect([reading(s), where(s).page]).toEqual(['p3', 20]);
    });

    it('keeps a turn of two pages whole for everyone', () => {
      // p1 read pages 20–21; p2 is on page 21 of the same pages.
      let s = run(
        { start: page(20), mode: 'repeat', size: 2 },
        { type: 'finishTurn' },
        { type: 'nextPage' },
      );
      expect([reading(s), where(s).page]).toEqual(['p2', 21]);
      // Someone joins at the end: p2 carries on, on the same page.
      const members = [...s.session!.config.members, person('p4')];
      const behind = reduce(s, {
        type: 'configure',
        config: { ...s.session!.config, members },
      });
      expect([reading(behind), where(behind).page]).toEqual(['p2', 21]);
      expect(currentPages(behind.session!)).toEqual([20, 21]);
      // Someone joins at the front: the pages start over, from page 20.
      s = reduce(s, {
        type: 'configure',
        config: {
          ...s.session!.config,
          members: [
            person('p4'),
            ...ids(s).map((id) =>
              s.session!.config.members.find((m) => m.id === id)!,
            ),
          ],
        },
      });
      expect([reading(s), where(s).page]).toEqual(['p4', 20]);
      expect(currentPages(s.session!)).toEqual([20, 21]);
    });

    it('starts over when a turn grows to a page the others have not read', () => {
      let s = run({ start: page(20), mode: 'repeat' }, { type: 'finishTurn' });
      s = reduce(s, {
        type: 'configure',
        config: { ...s.session!.config, size: 2 },
      });
      expect([reading(s), where(s).page]).toEqual(['p1', 20]);
      expect(currentPages(s.session!)).toEqual([20, 21]);
    });

    it('moves on when the reader in the last seat leaves', () => {
      let s = run(
        { start: page(20), mode: 'repeat' },
        { type: 'finishTurn' },
        { type: 'finishTurn' },
      );
      expect(reading(s)).toBe('p3');
      s = reorder(s, ['p1', 'p2']);
      expect([reading(s), where(s).page]).toEqual(['p1', 21]);
      expect(s.session!.pagesRead).toBe(1);
    });

    it('changes nothing when only those after the reader are reordered', () => {
      const s = run(
        { start: page(20), mode: 'repeat' },
        { type: 'finishTurn' },
      );
      const t = reorder(s, ['p1', 'p2', 'p3']);
      expect(t.session!.turn).toBe(s.session!.turn);
    });
  });

  it('seats a reciter like anyone else', () => {
    const sheikh: Member = { id: 'r1', kind: 'reciter', reciter: 'minshawi' };
    let s = run({
      start: page(24),
      mode: 'repeat',
      members: [sheikh, person('p1')],
    });
    expect(turnPhrase(s.session!.config.members[0])).toBe('يتلو المنشاوي');
    s = reduce(s, { type: 'finishTurn' });
    expect(where(s)).toEqual({ page: 24, reader: 1 });
    s = reduce(s, { type: 'finishTurn' });
    expect(where(s)).toEqual({ page: 25, reader: 0 });
  });

  it('adds members with the first free id, up to eight', () => {
    const members: Member[] = [person('p1'), person('p3')];
    expect(newMember(members, 'person')!.id).toBe('p2');
    expect(newMember(members, 'reciter', 'alafasy')).toEqual({
      id: 'r1',
      kind: 'reciter',
      reciter: 'alafasy',
    });
    const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => person(`p${n}`));
    expect(newMember(seven, 'person')!.id).toBe('p8');
    expect(newMember([...seven, person('p8')], 'person')).toBeNull();
    expect(MAX_MEMBERS).toBe(8);
  });

  it('goes round eight seats', () => {
    const eight = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => person(`p${n}`));
    let s = run({ start: page(1), members: eight });
    const order = [where(s).reader];
    for (let i = 0; i < 8; i++) {
      s = finish(s);
      order.push(where(s).reader);
    }
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
    expect(where(s).page).toBe(9);
  });
});

describe('member names', () => {
  it('defaults the first reader to the person holding the device', () => {
    expect(memberName(person('p1'))).toBe('أنت');
    expect(turnPhrase(person('p1'))).toBe('دورك');
  });
  it('uses a given name', () => {
    expect(turnPhrase(person('p2', 'عمر'))).toBe('دور عمر');
    expect(turnPhrase(person('p1', 'عمر'))).toBe('دور عمر');
  });
  it('numbers the rest by who they are, not where they sit', () => {
    expect(memberName(person('p3'))).toBe('القارئ الثالث');
    expect(memberName(person('p8'))).toBe('القارئ الثامن');
  });
  it('names a reciter by the name he is known by', () => {
    expect(memberName({ id: 'r1', kind: 'reciter', reciter: 'husary' })).toBe(
      'الحصري',
    );
  });
});

/* Every unit runs the same circle: the cases above, again in ayat,
   quarters and surahs, wherever the unit changes what happens. */
describe('turns of ayat', () => {
  // Al-Baqarah 1 onwards, three ayat a turn: page 2 ends on al-Baqarah 5.
  const baqarah = { start: ayahIndex(2, 1), unit: 'ayah' as Unit, size: 3 };

  it('goes round the circle three ayat at a time', () => {
    let s = run(baqarah);
    expect(ayat(s)).toEqual([8, 10]);
    expect(currentPages(s.session!)).toEqual([2]);
    s = finish(s);
    // Al-Baqarah 4 to 6 runs onto page 3: the turn has both pages.
    expect(where(s)).toEqual({ page: 2, reader: 1 });
    expect(ayat(s)).toEqual([11, 13]);
    expect(currentPages(s.session!)).toEqual([2, 3]);
    s = reduce(s, { type: 'nextPage' });
    expect(where(s)).toEqual({ page: 3, reader: 1 });
    s = finish(s);
    expect(where(s)).toEqual({ page: 3, reader: 2 });
    expect(ayat(s)).toEqual([14, 16]);
  });

  it('counts a page when its last ayah is read', () => {
    let s = run(baqarah);
    s = finish(s);
    expect([s.session!.pagesRead, s.session!.ayatRead]).toEqual([0, 3]);
    s = finish(s);
    expect([s.session!.pagesRead, s.session!.ayatRead]).toEqual([1, 6]);
    expect(s.session!.lastRead).toBe(13);
    s = reduce(s, { type: 'previousTurn' });
    expect([s.session!.pagesRead, s.session!.ayatRead]).toEqual([0, 3]);
    expect(s.session!.lastRead).toBe(10);
  });

  it('repeats the same ayat round the circle, and counts them once', () => {
    let s = run({ ...baqarah, mode: 'repeat' });
    s = finish(s, 2);
    expect(ayat(s)).toEqual([8, 10]);
    expect(s.session!.ayatRead).toBe(0);
    s = finish(s);
    expect(ayat(s)).toEqual([11, 13]);
    expect(where(s).reader).toBe(0);
    expect(s.session!.ayatRead).toBe(3);
  });

  it('jumps to the first ayah of a page with the same reader', () => {
    let s = run(baqarah, { type: 'finishTurn' });
    s = reduce(s, { type: 'goToPage', page: 50 });
    expect(where(s)).toEqual({ page: 50, reader: 1 });
    expect(ayat(s)).toEqual([page(50), page(50) + 2]);
  });

  it('jumps to an ayah', () => {
    const s = run(baqarah, { type: 'goToAyah', ayah: ayahIndex(18, 10) });
    expect(ayat(s)).toEqual([ayahIndex(18, 10), ayahIndex(18, 12)]);
    expect(where(s).reader).toBe(0);
  });

  it('turns to the next page past the end of a turn, from its first ayah', () => {
    let s = run(baqarah);
    s = reduce(s, { type: 'nextPage' });
    expect(where(s)).toEqual({ page: 3, reader: 0 });
    expect(ayat(s)).toEqual([page(3), page(3) + 2]);
    s = reduce(s, { type: 'previousPage' });
    expect(where(s)).toEqual({ page: 2, reader: 0 });
    expect(ayat(s)).toEqual([page(2), page(2) + 2]);
  });

  it('carries on across the end of a surah', () => {
    const s = run({ ...baqarah, start: 6 });
    expect(ayat(s)).toEqual([6, 8]);
    expect(currentPages(s.session!)).toEqual([1, 2]);
  });

  it('completes the Mushaf at an-Nas 6', () => {
    let s = run({
      start: AYAH_COUNT - 4,
      unit: 'ayah',
      size: 3,
      members: [person('p1')],
    });
    s = finish(s);
    expect(ayat(s)).toEqual([AYAH_COUNT - 1, AYAH_COUNT]);
    s = finish(s);
    expect(completion(s.session!)).toBe('khatm');
    expect(s.session!.ayatRead).toBe(5);
    s = reduce(s, { type: 'restartMushaf' });
    expect(ayat(s)).toEqual([1, 3]);
  });

  it('keeps the place when the circle changes to whole pages', () => {
    let s = run(baqarah, { type: 'finishTurn' }, { type: 'nextPage' });
    expect(where(s)).toEqual({ page: 3, reader: 1 });
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, unit: 'page', size: 1 },
    });
    expect(where(s)).toEqual({ page: 3, reader: 1 });
    expect(ayat(s)).toEqual([page(3), page(4) - 1]);
  });

  describe('in repeat mode, nobody misses an ayah', () => {
    const repeat = { ...baqarah, mode: 'repeat' as const };
    const reading = (st: State) =>
      st.session!.config.members[where(st).reader].id;

    it('starts the ayat over when someone who has not read them moves ahead', () => {
      let s = run(repeat, { type: 'finishTurn' });
      const [a, b, c] = s.session!.config.members;
      s = reduce(s, {
        type: 'configure',
        config: { ...s.session!.config, members: [c, a, b] },
      });
      expect([reading(s), ...ayat(s)]).toEqual(['p3', 8, 10]);
    });

    it('lets the reader carry on when everyone ahead has read them', () => {
      let s = run(repeat, { type: 'finishTurn' });
      s = reduce(s, {
        type: 'configure',
        config: {
          ...s.session!.config,
          members: [...s.session!.config.members, person('p4')],
        },
      });
      expect([reading(s), ...ayat(s)]).toEqual(['p2', 8, 10]);
    });

    it('starts over when a turn grows to ayat the others have not read', () => {
      let s = run(repeat, { type: 'finishTurn' });
      s = reduce(s, {
        type: 'configure',
        config: { ...s.session!.config, size: 5 },
      });
      expect([reading(s), ...ayat(s)]).toEqual(['p1', 8, 12]);
    });

    it('lets the reader carry on when the turn shrinks to ayat all have read', () => {
      let s = run(repeat, { type: 'finishTurn' });
      s = reduce(s, {
        type: 'configure',
        config: { ...s.session!.config, size: 2 },
      });
      expect([reading(s), ...ayat(s)]).toEqual(['p2', 8, 9]);
    });

    it('moves on when the reader in the last seat leaves', () => {
      let s = run(repeat, { type: 'finishTurn' }, { type: 'finishTurn' });
      s = reduce(s, {
        type: 'configure',
        config: {
          ...s.session!.config,
          members: s.session!.config.members.slice(0, 2),
        },
      });
      expect([reading(s), ...ayat(s)]).toEqual(['p1', 11, 13]);
      expect(s.session!.ayatRead).toBe(3);
      expect(s.session!.lastRead).toBe(10);
    });

    it('keeps the round’s ayat when they are counted in pages instead', () => {
      // The round is on al-Baqarah 1–3, all on page 2; as pages, it is page
      // 2, which holds ayat the others have not read: it starts over.
      let s = run(repeat, { type: 'finishTurn' });
      s = reduce(s, {
        type: 'configure',
        config: { ...s.session!.config, unit: 'page', size: 1 },
      });
      expect([reading(s), where(s).page]).toEqual(['p1', 2]);
    });
  });
});

describe('turns of a hizb quarter', () => {
  const quarter = { start: 1, unit: 'rub' as Unit, size: 1 };

  it('reads a quarter a turn, page by page', () => {
    let s = run(quarter);
    expect(currentPages(s.session!)).toEqual([1, 2, 3, 4, 5]);
    for (let p = 2; p <= 5; p++) s = reduce(s, { type: 'nextPage' });
    expect(where(s)).toEqual({ page: 5, reader: 0 });
    s = finish(s);
    // The second quarter begins on page 5, where the first ended.
    expect(where(s)).toEqual({ page: 5, reader: 1 });
    expect(ayat(s)).toEqual([rubStart(2), rubStart(3) - 1]);
    // The first quarter ends part-way down page 5, so four pages are read.
    expect(s.session!.pagesRead).toBe(4);
    expect(s.session!.ayatRead).toBe(rubStart(2) - 1);
  });

  it('jumps to the quarter a page begins in, with that page open', () => {
    const s = run(quarter, { type: 'goToPage', page: 6 });
    expect(ayat(s)).toEqual([rubStart(2), rubStart(3) - 1]);
    expect(where(s)).toEqual({ page: 6, reader: 0 });
  });

  it('turns past the last page of a quarter into the next', () => {
    let s = run(quarter);
    for (let p = 2; p <= 5; p++) s = reduce(s, { type: 'nextPage' });
    s = reduce(s, { type: 'nextPage' });
    expect(where(s)).toEqual({ page: 6, reader: 0 });
    expect(ayat(s)).toEqual([rubStart(2), rubStart(3) - 1]);
  });

  it('starts at the quarter that holds the chosen ayah', () => {
    const s = run({ ...quarter, start: rubStart(2) + 4 });
    expect(ayat(s)).toEqual([rubStart(2), rubStart(3) - 1]);
    expect(s.session!.from).toBe(rubStart(2));
  });

  it('starts the quarter over in repeat mode when someone moves ahead', () => {
    let s = run({ ...quarter, mode: 'repeat' }, { type: 'finishTurn' });
    const [a, b, c] = s.session!.config.members;
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, members: [c, a, b] },
    });
    expect(where(s).reader).toBe(0);
    expect(ayat(s)).toEqual([1, rubStart(2) - 1]);
  });
});

describe('turns of a surah', () => {
  const surahs = { start: ayahIndex(67, 1), unit: 'surah' as Unit, size: 1 };

  it('reads a surah a turn', () => {
    let s = run(surahs);
    expect(currentPages(s.session!)).toEqual([562, 563, 564]);
    s = finish(s);
    expect(ayat(s)).toEqual([surahRange(68).from, surahRange(68).to - 1]);
    expect(s.session!.ayatRead).toBe(30);
    expect(s.session!.pagesRead).toBe(2);
  });

  it('completes the Mushaf with an-Nas', () => {
    let s = run({
      ...surahs,
      start: ayahIndex(114, 1),
      members: [person('p1')],
    });
    s = finish(s);
    expect(completion(s.session!)).toBe('khatm');
  });
});

describe('a sitting with a goal', () => {
  it('stops at the end of the surah it starts in', () => {
    // Al-Kahf 101 to 110, five ayat a turn: two turns, then the goal.
    let s = run({
      start: ayahIndex(18, 101),
      unit: 'ayah',
      size: 5,
      goal: { to: 'surah' },
    });
    expect(s.session!.until).toBe(surahRange(18).to);
    s = finish(s);
    expect(ayat(s)).toEqual([ayahIndex(18, 106), ayahIndex(18, 110)]);
    expect(completion(s.session!)).toBeNull();
    s = finish(s);
    expect(completion(s.session!)).toBe('goal');
    expect(isComplete(s.session!)).toBe(true);
    expect(reduce(s, { type: 'finishTurn' })).toBe(s);
    expect(placeOf(s.session!)).toBe(ayahIndex(19, 1));
    expect(currentPage(s.session!)).toBe(304);
    // And the next sitting starts at Maryam.
    expect(reduce(s, { type: 'end' }).config.start).toBe(ayahIndex(19, 1));
  });

  it('cuts a turn of pages at the goal, part-way down a page', () => {
    // Al-Isra ends part-way down page 293, where al-Kahf begins.
    let s = run({
      start: page(292),
      size: 2,
      members: [person('p1')],
      goal: { to: 'surah' },
    });
    expect(currentPages(s.session!)).toEqual([292, 293]);
    expect(currentRange(s.session!).to).toBe(ayahIndex(18, 1));
    s = finish(s);
    expect(completion(s.session!)).toBe('goal');
    expect(s.session!.pagesRead).toBe(1);
  });

  it('stops at the end of the juz it starts in', () => {
    const s = run({
      start: page(582),
      members: [person('p1')],
      goal: { to: 'juz' },
    });
    expect(s.session!.until).toBe(juzRange(30).to);
    // The end of the juz is the end of the Mushaf: that is a khatm.
    expect(completion(finish(s, 23).session!)).toBe('khatm');
  });

  it('stops after a given page', () => {
    let s = run({ start: page(10), goal: { to: 'page', page: 11 } });
    s = finish(s);
    expect(where(s)).toEqual({ page: 11, reader: 1 });
    // The page after the goal is not a page further.
    expect(reduce(s, { type: 'nextPage' })).toBe(s);
    s = finish(s);
    expect(completion(s.session!)).toBe('goal');
  });

  it('has no goal when the page chosen is behind the start', () => {
    const s = run({ start: page(50), goal: { to: 'page', page: 10 } });
    expect(s.session!.until).toBeNull();
  });

  it('carries on past the goal when it is let go', () => {
    let s = run({
      start: page(292),
      size: 2,
      members: [person('p1')],
      goal: { to: 'surah' },
    });
    s = finish(s);
    expect(completion(s.session!)).toBe('goal');
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, goal: { to: 'none' } },
    });
    expect(completion(s.session!)).toBeNull();
    expect(s.session!.until).toBeNull();
    // Page 293 again: it holds the first ayat of al-Kahf, not yet read.
    expect(currentPages(s.session!)).toEqual([293, 294]);
  });

  it('carries on from the very ayah in a sitting of ayat', () => {
    let s = run({
      start: ayahIndex(18, 101),
      unit: 'ayah',
      size: 5,
      goal: { to: 'surah' },
    });
    s = finish(s, 2);
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, goal: { to: 'none' } },
    });
    expect(ayat(s)).toEqual([ayahIndex(19, 1), ayahIndex(19, 5)]);
  });

  it('stays reached when the circle changes', () => {
    let s = run({
      start: page(292),
      size: 2,
      goal: { to: 'surah' },
    });
    s = finish(s);
    expect(completion(s.session!)).toBe('goal');
    s = reduce(s, {
      type: 'configure',
      config: {
        ...s.session!.config,
        members: [...s.session!.config.members, person('p4')],
      },
    });
    expect(completion(s.session!)).toBe('goal');
  });

  it('is left behind by a jump past it', () => {
    let s = run({ start: page(292), goal: { to: 'surah' } });
    s = reduce(s, { type: 'goToPage', page: 400 });
    expect(s.session!.until).toBeNull();
    expect(where(s).page).toBe(400);
    s = reduce(s, { type: 'goToPage', page: 100 });
    expect(s.session!.until).toBeNull();
  });

  it('is kept by a jump that stays before it', () => {
    const s = run(
      { start: page(292), goal: { to: 'juz' } },
      { type: 'goToPage', page: 295 },
    );
    expect(s.session!.until).toBe(juzRange(15).to);
  });

  it('is worked out again, from where the circle is, when it is changed', () => {
    let s = run({ start: page(2) });
    s = reduce(s, { type: 'goToPage', page: 293 });
    s = reduce(s, {
      type: 'configure',
      config: { ...s.session!.config, goal: { to: 'surah' } },
    });
    // Page 293 begins in al-Isra.
    expect(s.session!.until).toBe(surahRange(17).to);
  });
});

describe('who reads next', () => {
  it('names the next turn, and each seat’s next turn', () => {
    const s = run({ start: page(10) }, { type: 'finishTurn' }).session!;
    expect(nextTurnOf(s)).toBe(2);
    expect([0, 1, 2].map((seat) => seatTurn(s, seat))).toEqual([3, 1, 2]);
    expect(turnPages(s, seatTurn(s, 0))).toEqual([13]);
    expect(turnRange(s, 2)).toEqual({ from: page(12), to: page(13) });
  });
});

describe('swapping who starts each page', () => {
  // Two readers taking an ayah each from page 3, whose 11 ayat are followed
  // by page 4's 8 and page 5's 5.
  const alternating = {
    start: page(3),
    unit: 'ayah' as Unit,
    size: 1,
    rotate: 'page' as const,
    members: [person('p1'), person('p2')],
  };

  /** Who opens each page from here, as the reducer passes the turn on. */
  const openers = (s: State, pages: number) => {
    const seen: number[] = [];
    let last = 0;
    while (seen.length < pages) {
      const p = currentPage(s.session!);
      if (p !== last) seen.push(where(s).reader);
      last = p;
      s = finish(s);
    }
    return seen;
  };

  it('has the other reader open the next page', () => {
    const s = run(alternating);
    expect(s.session!.config.rotate).toBe('page');
    expect(openers(s, 4)).toEqual([0, 1, 0, 1]);
  });

  it('steps back across each line to the turn and the ayah that were read', () => {
    let s = run(alternating);
    const trail: [number, number, number][] = [];
    for (let i = 0; i < 24; i++) {
      trail.push([s.session!.turn, where(s).reader, ayat(s)[0]]);
      s = finish(s);
    }
    expect(trail.map(([, , a]) => a)).toEqual(
      Array.from({ length: 24 }, (_, i) => page(3) + i),
    );
    expect(s.session!.ayatRead).toBe(24);
    for (let i = trail.length - 1; i >= 0; i--) {
      s = reduce(s, { type: 'previousTurn' });
      expect([s.session!.turn, where(s).reader, ayat(s)[0]]).toEqual(trail[i]);
    }
    expect(s.session!.ayatRead).toBe(0);
    expect(s.session!.pagesRead).toBe(0);
  });

  it('goes round three readers', () => {
    const s = run({
      ...alternating,
      members: [person('p1'), person('p2'), person('p3')],
    });
    expect(openers(s, 4)).toEqual([0, 1, 2, 0]);
  });

  it('starts afresh from whoever has the turn after a jump', () => {
    let s = run(alternating, { type: 'finishTurn' });
    s = reduce(s, { type: 'goToPage', page: 4 });
    expect(where(s).reader).toBe(1);
    expect(openers(s, 2)).toEqual([1, 0]);
  });

  it('starts afresh from whoever has the turn after the circle changes', () => {
    // p2 has the turn on page 3 when a third reader joins: p2 opens the
    // line from here, so the seat after them, p3, opens page 4.
    let s = run(alternating, { type: 'finishTurn' });
    s = reduce(s, {
      type: 'configure',
      config: {
        ...s.session!.config,
        members: [...s.session!.config.members, person('p3')],
      },
    });
    expect(s.session!.config.members[where(s).reader].id).toBe('p2');
    expect(ayat(s)[0]).toBe(page(3) + 1);
    while (currentPage(s.session!) === 3) s = finish(s);
    expect(s.session!.config.members[where(s).reader].id).toBe('p3');
  });

  it('names each seat’s next turn across the line', () => {
    // Turn 10 is the last ayah of page 3, reader 0; page 4 is opened by
    // reader 1 at turn 11, and reader 0 reads next at turn 12.
    const s = finish(run(alternating), 10).session!;
    expect([seatTurn(s, 0), seatTurn(s, 1)]).toEqual([10, 11]);
    const t = finish(run(alternating), 18).session!;
    // Turn 18 ends page 4 with reader 0; 19 is passed over, so reader 0
    // opens page 5 at 20 and reader 1 reads at 21.
    expect(nextTurnOf(t)).toBe(20);
    expect([seatTurn(t, 0), seatTurn(t, 1)]).toEqual([18, 21]);
  });

  it('is put away where it means nothing', () => {
    const cases: Partial<Config>[] = [
      { mode: 'repeat' },
      { members: [person('p1')] },
      { unit: 'page' },
      { unit: 'rub' },
    ];
    for (const c of cases)
      expect(sanitizeConfig({ ...alternating, ...c }).rotate).toBe('none');
    expect(
      sanitizeConfig({ ...alternating, unit: 'page', rotate: 'surah' }).rotate,
    ).toBe('surah');
  });
});

describe('the close of a sitting', () => {
  it('says from where to where, how much, how long, and who sat', () => {
    const sheikh: Member = { id: 'r1', kind: 'reciter', reciter: 'husary' };
    let s = run({
      start: ayahIndex(2, 1),
      unit: 'ayah',
      size: 3,
      members: [person('p1'), person('p2', 'عمر'), sheikh],
    });
    s = finish(s, 2);
    const summary = summaryOf(s.session!, T0 + 25 * 60_000);
    expect(summary).toEqual({
      from: { ayah: 8, key: '2:1', page: 2 },
      to: { ayah: 13, key: '2:6', page: 3 },
      pagesRead: 1,
      ayatRead: 6,
      durationMs: 25 * 60_000,
      members: [
        { id: 'p1', kind: 'person', name: 'أنت' },
        { id: 'p2', kind: 'person', name: 'عمر' },
        { id: 'r1', kind: 'reciter', name: 'الحصري' },
      ],
    });
  });

  it('counts what the circle finished, not the turn under way', () => {
    let s = run({ start: page(10) });
    expect(summaryOf(s.session!, T0).to).toBeNull();
    s = finish(s);
    s = reduce(s, { type: 'goToPage', page: 300 });
    // Page 10 was finished; page 300 is open, not read.
    const summary = summaryOf(s.session!, T0);
    expect(summary.to).toEqual({ ayah: page(11) - 1, key: '2:69', page: 10 });
    expect(summary.pagesRead).toBe(1);
  });

  it('counts a repeated round once', () => {
    let s = run({ start: page(24), mode: 'repeat' });
    s = finish(s, 2);
    expect(summaryOf(s.session!, T0).to).toBeNull();
    s = finish(s);
    expect(summaryOf(s.session!, T0)).toMatchObject({
      to: { page: 24 },
      pagesRead: 1,
    });
  });
});

describe('a saved halaqa', () => {
  it('survives a round trip', () => {
    const s = run({ start: page(77) }, { type: 'finishTurn' });
    expect(sanitizeState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('survives a round trip with every new choice made', () => {
    let s = run({
      start: ayahIndex(18, 1),
      unit: 'ayah',
      size: 5,
      rotate: 'surah',
      goal: { to: 'page', page: 300 },
      fromMemory: true,
    });
    s = finish(s, 3);
    s = reduce(s, { type: 'nextPage' });
    expect(sanitizeState(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('keeps following the word, and follows the ayah until asked', () => {
    expect(sanitizeState({}).prefs.follow).toBe('ayah');
    const s = reduce(initialState, {
      type: 'prefs',
      prefs: { follow: 'word' },
    });
    expect(sanitizeState(JSON.parse(JSON.stringify(s))).prefs.follow).toBe(
      'word',
    );
  });

  it('is repaired, never trusted', () => {
    const s = sanitizeState({
      prefs: {
        theme: 'neon',
        view: 7,
        speed: 3,
        listenRepeat: 0,
        follow: 'letter',
        cue: 'x',
      },
      config: { readers: 'x', pagesPerTurn: 9, startPage: 9000 },
      session: { turn: -3, anchor: { turn: 5, page: 0 }, config: {} },
    });
    expect(s.prefs).toEqual({
      theme: 'green',
      photos: 'show',
      speed: 1,
      listenRepeat: 1,
      follow: 'ayah',
      cue: 'chime',
    });
    expect(s.config.size).toBe(1);
    expect(s.config.unit).toBe('page');
    expect(s.config.start).toBe(1);
    expect(s.session!.turn).toBe(0);
    expect(s.session!.anchor).toEqual({ turn: 0, at: 1 });
  });

  it('repairs every new field it cannot trust', () => {
    const s = sanitizeState({
      config: {
        unit: 'line',
        size: 7,
        rotate: 'always',
        start: 7000,
        goal: { to: 'page', page: 9999 },
        fromMemory: 'yes',
      },
      session: {
        config: { unit: 'ayah', size: 4, start: -2, goal: 'juz' },
        turn: 4,
        anchor: { turn: 2, at: 99999 },
        pageInTurn: 7,
        ayatRead: -1,
        lastRead: 1e9,
        startedAt: 'yesterday',
        from: 0,
        until: 1,
      },
    });
    expect(s.config).toMatchObject({
      unit: 'page',
      size: 1,
      rotate: 'none',
      start: 1,
      goal: { to: 'none' },
      fromMemory: false,
    });
    const session = s.session!;
    expect(session.config).toMatchObject({
      unit: 'ayah',
      size: 1,
      start: 1,
      goal: { to: 'none' },
    });
    expect(session.anchor).toEqual({ turn: 2, at: 1 });
    expect(session.pageInTurn).toBe(0);
    expect(session.ayatRead).toBe(0);
    expect(session.startedAt).toBeNull();
    expect(session.from).toBe(1);
    expect(session.until).toBeNull();
    expect(session.lastRead).toBe(0);
  });

  it('keeps only the sizes the start screen offers', () => {
    for (const unit of ['page', 'ayah', 'rub', 'surah'] as Unit[]) {
      for (const size of TURN_SIZES[unit])
        expect(sanitizeConfig({ unit, size }).size).toBe(size);
      expect(sanitizeConfig({ unit, size: 4 }).size).toBe(TURN_SIZES[unit][0]);
    }
  });

  it('reads a halaqa saved in pages, before turns had units, as pages', () => {
    const saved = {
      prefs: { theme: 'blue' },
      config: { members: threeReaders, pagesPerTurn: 2, startPage: 40 },
      session: {
        config: {
          members: threeReaders,
          mode: 'repeat',
          pagesPerTurn: 2,
          startPage: 30,
        },
        anchor: { turn: 3, page: 34 },
        turn: 4,
        pageInTurn: 1,
        pagesRead: 6,
      },
    };
    const s = sanitizeState(saved);
    expect(s.config).toMatchObject({ unit: 'page', size: 2, start: page(40) });
    const session = s.session!;
    expect(session.config).toMatchObject({
      unit: 'page',
      size: 2,
      mode: 'repeat',
      start: page(30),
    });
    expect(session.anchor).toEqual({ turn: 3, at: 34 });
    expect(currentPages(session)).toEqual([34, 35]);
    expect(where(s)).toEqual({ page: 35, reader: 1 });
    expect(session.from).toBe(page(30));
    expect(session.startedAt).toBeNull();
    expect(session.until).toBeNull();
    // The round before this one read pages 32–33.
    expect(session.lastRead).toBe(page(34) - 1);
    // And it carries on exactly as it would have.
    let t = finish(s);
    expect(where(t)).toEqual({ page: 34, reader: 2 });
    t = finish(t);
    expect(where(t)).toEqual({ page: 36, reader: 0 });
    expect(t.session!.pagesRead).toBe(8);
    expect(summaryOf(session, 0).durationMs).toBeNull();
  });

  it('turns a halaqa saved before reciters could sit into people', () => {
    const s = sanitizeState({
      config: { readers: ['', 'عمر', ''], mode: 'repeat' },
      session: {
        config: { readers: ['أحمد', ''] },
        turn: 3,
        anchor: { turn: 0, page: 50 },
      },
    });
    expect(s.config.members).toEqual([
      person('p1'),
      person('p2', 'عمر'),
      person('p3'),
    ]);
    expect(s.config.members.map(memberName)).toEqual([
      'أنت',
      'عمر',
      'القارئ الثالث',
    ]);
    expect(s.session!.config.members).toEqual([
      person('p1', 'أحمد'),
      person('p2'),
    ]);
    expect(where(s)).toEqual({ page: 53, reader: 1 });
  });

  it('repairs members it cannot trust', () => {
    const s = sanitizeState({
      config: {
        members: [
          { id: 'p1', kind: 'person', name: 7 },
          { id: 'p1', kind: 'person', name: 'عمر' },
          { id: 'r9', kind: 'reciter', reciter: 'nobody' },
          null,
          { kind: 'person' },
          { kind: 'person' },
        ],
      },
    });
    expect(s.config.members).toEqual([
      person('p1'),
      person('p2', 'عمر'),
      { id: 'r1', kind: 'reciter', reciter: 'husary' },
      person('p3'),
      person('p4'),
    ]);
  });

  it('checks member ids by number, up to eight', () => {
    const ids = (members: unknown[]) =>
      sanitizeState({ config: { members } }).config.members.map((m) => m.id);
    expect(
      ids([
        { id: 'p8', kind: 'person' },
        { id: 'r8', kind: 'reciter' },
        { id: 'p10', kind: 'person' },
        { id: 'p01', kind: 'person' },
        { id: 'r1', kind: 'person' },
        { id: 'p0', kind: 'person' },
      ]),
    ).toEqual(['p8', 'r8', 'p1', 'p2', 'p3', 'p4']);
    const many = Array.from({ length: 12 }, () => ({ kind: 'person' }));
    expect(ids(many)).toHaveLength(MAX_MEMBERS);
  });

  it('starts fresh from nothing', () => {
    expect(sanitizeState(null)).toEqual(initialState);
    expect(initialState.config.members).toEqual([person('p1')]);
    expect(initialState.config.fromMemory).toBe(false);
  });

  it('keeps the circle set up on the start screen, before it starts', () => {
    const members = [person('p1'), person('p2', 'عمر')];
    const s = reduce(initialState, {
      type: 'draft',
      config: { ...defaultConfig, members, size: 2, fromMemory: true },
    });
    expect(s.config).toMatchObject({ members, size: 2, fromMemory: true });
    expect(s.session).toBeNull();
  });
});
