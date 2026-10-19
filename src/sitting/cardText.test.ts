import { describe, expect, it } from 'vitest';
import { AYAH_COUNT, ayahIndex, firstAyahOfPage } from '@/data/mushaf';
import {
  defaultConfig,
  initialState,
  reduce,
  summaryOf,
  type Action,
  type Config,
  type Member,
} from '@/halaqa/state';
import {
  cardDates,
  cardText,
  joinNames,
  NOTHING_READ,
  presentLine,
  sittingLength,
  SUPPLICATION,
} from './cardText';

/* Every summary here is made the way the reading screen will make one:
   a sitting started through the model, turns finished, then summaryOf. The
   times are local, an evening in the device's own zone, so the date read
   back is the same wherever the tests run. */

const at = (h: number, m: number) => new Date(2026, 9, 18, h, m).getTime();
const START = at(19, 0);

const you: Member = { id: 'p1', kind: 'person', name: '' };
const fatima: Member = { id: 'p2', kind: 'person', name: 'فاطمة' };
const omar: Member = { id: 'p3', kind: 'person', name: 'عمر' };
const husary: Member = { id: 'r1', kind: 'reciter', reciter: 'husary' };

/** A sitting started at START, after the given actions, as it closes at
    `endedAt`. */
function closed(config: Partial<Config>, endedAt: number, ...acts: Action[]) {
  const state = acts.reduce(
    reduce,
    reduce(initialState, {
      type: 'start',
      config: { ...defaultConfig, ...config },
      at: START,
    }),
  );
  return cardText(summaryOf(state.session!, endedAt), endedAt);
}

const finish = (n: number): Action[] =>
  Array.from({ length: n }, () => ({ type: 'finishTurn' }) as const);

describe('the close of a sitting', () => {
  it('says from where to where, how much, how long, and who sat', () => {
    const card = closed(
      { members: [you, fatima, husary], start: ayahIndex(3, 1) },
      at(19, 25),
      ...finish(4),
    );
    expect(card).toEqual({
      title: 'ختام المجلس',
      dates: ['الأحد، ٧ جمادى الأولى ١٤٤٨ هـ', '١٨ أكتوبر ٢٠٢٦'],
      read: [
        'من سورة آل عمران، الآية ١ (الصفحة ٥٠)',
        'إلى سورة آل عمران، الآية ٢٩ (الصفحة ٥٣)',
      ],
      amount: '٤ صفحات · ٢٩ آية · ٢٥ دقيقة',
      present: { label: 'الحاضرون', names: 'أنت، فاطمة، والشيخ الحصري' },
      supplication: [
        'سبحانك اللهم وبحمدك،',
        'أشهد أن لا إله إلا أنت،',
        'أستغفرك وأتوب إليك',
      ],
      brand: 'مجلس نور',
    });
  });

  it('ends on the supplication that closes a gathering', () => {
    expect(SUPPLICATION).toBe(
      'سبحانك اللهم وبحمدك، أشهد أن لا إله إلا أنت، أستغفرك وأتوب إليك',
    );
  });

  it('says so gently when no turn was finished, and counts nothing', () => {
    const card = closed(
      { members: [you, fatima], start: firstAyahOfPage(10) },
      at(19, 5),
    );
    expect(card.read).toEqual([NOTHING_READ]);
    expect(card.amount).toBeNull();
  });

  it('counts ayat alone while no page has been finished', () => {
    const card = closed(
      {
        members: [you, fatima],
        unit: 'ayah',
        size: 3,
        // Page 3 holds al-Baqarah 6 to 16, so two turns stay inside it.
        start: ayahIndex(2, 6),
      },
      at(19, 2),
      ...finish(2),
    );
    expect(card.read).toEqual([
      'من سورة البقرة، الآية ٦ (الصفحة ٣)',
      'إلى سورة البقرة، الآية ١١ (الصفحة ٣)',
    ]);
    expect(card.amount).toBe('٦ آيات · دقيقتان');
  });

  it('leaves out how long when the sitting was saved before it was kept', () => {
    const state = reduce(
      reduce(initialState, {
        type: 'start',
        config: { ...defaultConfig, members: [you, fatima] },
        at: Number.NaN,
      }),
      { type: 'finishTurn' },
    );
    const card = cardText(summaryOf(state.session!, at(20, 0)), at(20, 0));
    expect(card.amount).toBe('صفحة واحدة · ٧ آيات');
  });

  it('reads a khatm to the last ayah of the Mushaf', () => {
    const card = closed(
      { members: [you], start: firstAyahOfPage(603) },
      at(19, 9),
      ...finish(2),
    );
    expect(card.read[1]).toBe('إلى سورة الناس، الآية ٦ (الصفحة ٦٠٤)');
    expect(card.amount).toBe(
      `صفحتان · ${new Intl.NumberFormat('ar-EG').format(AYAH_COUNT - firstAyahOfPage(603) + 1)} آية · ٩ دقائق`,
    );
  });

  it('reads from where a jump took the circle before it read anything', () => {
    const card = closed(
      { members: [you, fatima] },
      at(19, 10),
      { type: 'goToPage', page: 300 },
      ...finish(1),
    );
    expect(card.read).toEqual([
      'من سورة الكهف، الآية ٥٤ (الصفحة ٣٠٠)',
      'إلى سورة الكهف، الآية ٦١ (الصفحة ٣٠٠)',
    ]);
    expect(card.amount).toBe('صفحة واحدة · ٨ آيات · ١٠ دقائق');
  });

  it('reads on through a jump to the very place the circle had reached', () => {
    const card = closed(
      { members: [you, fatima] },
      at(19, 10),
      ...finish(1),
      { type: 'goToPage', page: 2 },
      ...finish(1),
    );
    expect(card.read).toEqual([
      'من سورة الفاتحة، الآية ١ (الصفحة ١)',
      'إلى سورة البقرة، الآية ٥ (الصفحة ٢)',
    ]);
  });

  it('says only where the circle stopped once it jumped after reading', () => {
    const card = closed(
      { members: [you, fatima] },
      at(19, 10),
      ...finish(1),
      { type: 'goToPage', page: 300 },
      ...finish(1),
    );
    // Not «من الفاتحة إلى الكهف»: the pages between were never read.
    expect(card.read).toEqual(['وقفتم عند سورة الكهف، الآية ٦١ (الصفحة ٣٠٠)']);
    expect(card.amount).toBe('صفحتان · ١٥ آية · ١٠ دقائق');
  });

  it('says only where the circle stopped in a new khatm', () => {
    const card = closed(
      { members: [you], start: firstAyahOfPage(603) },
      at(19, 20),
      ...finish(2),
      { type: 'restartMushaf' },
      ...finish(1),
    );
    // Read alone, and spoken to as one.
    expect(card.read).toEqual(['وقفتَ عند سورة الفاتحة، الآية ٧ (الصفحة ١)']);
    expect(card.amount?.startsWith('٣ صفحات · ')).toBe(true);
  });

  it('does not name «أنت» reading alone', () => {
    const card = closed({ members: [you] }, at(19, 30), ...finish(1));
    expect(card.present).toBeNull();
  });
});

describe('the day', () => {
  it('gives the Hijri date first, then the Gregorian, in Arabic digits', () => {
    expect(cardDates(at(9, 0))).toEqual([
      'الأحد، ٧ جمادى الأولى ١٤٤٨ هـ',
      '١٨ أكتوبر ٢٠٢٦',
    ]);
    expect(cardDates(new Date(2027, 2, 1, 12).getTime())).toEqual([
      'الاثنين، ٢٢ رمضان ١٤٤٨ هـ',
      '١ مارس ٢٠٢٧',
    ]);
  });
});

describe('how long', () => {
  it('rounds to the minute, and says less than one', () => {
    expect(sittingLength(0)).toBe('أقل من دقيقة');
    expect(sittingLength(59_000)).toBe('أقل من دقيقة');
    expect(sittingLength(60_000)).toBe('دقيقة واحدة');
    expect(sittingLength(90_000)).toBe('دقيقتان');
    expect(sittingLength(3 * 60_000)).toBe('٣ دقائق');
    expect(sittingLength(25 * 60_000 + 20_000)).toBe('٢٥ دقيقة');
  });

  it('counts hours past the first', () => {
    const h = 60 * 60_000;
    expect(sittingLength(h)).toBe('ساعة واحدة');
    expect(sittingLength(h + 60_000)).toBe('ساعة ودقيقة');
    expect(sittingLength(h + 20 * 60_000)).toBe('ساعة و٢٠ دقيقة');
    expect(sittingLength(2 * h)).toBe('ساعتان');
    expect(sittingLength(2 * h + 5 * 60_000)).toBe('ساعتان و٥ دقائق');
    expect(sittingLength(3 * h + 2 * 60_000)).toBe('٣ ساعات ودقيقتان');
  });

  it('says nothing of a halaqa left open for a day, or of no start', () => {
    expect(sittingLength(19 * 60 * 60_000)).toBeNull();
    expect(sittingLength(null)).toBeNull();
    expect(sittingLength(-1)).toBeNull();
    expect(sittingLength(Number.NaN)).toBeNull();
  });
});

describe('who sat', () => {
  it('joins names as Arabic lists them', () => {
    expect(joinNames(['أنت'])).toBe('أنت');
    expect(joinNames(['أنت', 'فاطمة'])).toBe('أنت وفاطمة');
    expect(joinNames(['أنت', 'فاطمة', 'عمر'])).toBe('أنت، فاطمة، وعمر');
  });

  it('names sheikhs as sheikhs, and one seated twice once', () => {
    const sitters = [you, fatima, omar, husary].map((m) => ({
      id: m.id,
      kind: m.kind,
      name: m.kind === 'reciter' ? 'الحصري' : m.name.trim() ? m.name : 'أنت',
    }));
    expect(presentLine(sitters)).toEqual({
      label: 'الحاضرون',
      names: 'أنت، فاطمة، عمر، والشيخ الحصري',
    });
    expect(
      presentLine([
        sitters[0],
        { id: 'r1', kind: 'reciter', name: 'الحصري' },
        { id: 'r2', kind: 'reciter', name: 'الحصري' },
      ]),
    ).toEqual({ label: 'الحاضران', names: 'أنت والشيخ الحصري' });
  });

  it('agrees with how many sat', () => {
    const card = closed({ members: [you, husary] }, at(19, 30), ...finish(1));
    expect(card.present).toEqual({
      label: 'الحاضران',
      names: 'أنت والشيخ الحصري',
    });
    const named = closed(
      { members: [{ id: 'p1', kind: 'person', name: 'مريم' }] },
      at(19, 30),
      ...finish(1),
    );
    expect(named.present).toEqual({ label: 'في المجلس', names: 'مريم' });
  });
});
