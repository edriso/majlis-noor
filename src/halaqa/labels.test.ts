import { describe, expect, it } from 'vitest';
import {
  ayahIndex,
  ayatOfPage,
  rubRange,
  surahRange,
  AYAH_COUNT,
} from '@/data/mushaf';
import {
  ayatLabel,
  backLabel,
  circleCenter,
  doneLabels,
  endTitle,
  listenLabels,
  pagesLabel,
  pagesShort,
  placeChip,
  portionLabel,
  portionNarrow,
  rangeLabel,
  rangeShort,
  recitationLabels,
  roundDone,
  seatStatus,
  sittingNote,
  sittingProgress,
  skipLabel,
  stripDetail,
  timerLabel,
  turnAnnouncement,
  untimedLabel,
} from './labels';
import type { PlayerStatus } from './player';
import type { Unit } from './schedule';

/** Al-Kahf `a` to `b`, as a half-open range. */
const kahf = (a: number, b: number) => ({
  from: ayahIndex(18, a),
  to: ayahIndex(18, b) + 1,
});

describe('pages', () => {
  it('names one, two or several', () => {
    expect(pagesLabel([24])).toBe('الصفحة ٢٤');
    expect(pagesLabel([24, 25])).toBe('الصفحتان ٢٤ و٢٥');
    expect(pagesLabel([24, 25, 26])).toBe('الصفحات ٢٤–٢٦');
    expect(pagesLabel([])).toBe('');
    expect(pagesShort([24])).toBe('ص ٢٤');
    expect(pagesShort([24, 25])).toBe('ص ٢٤–٢٥');
  });
});

describe('a turn, in its own unit', () => {
  it('names pages by their numbers', () => {
    expect(rangeLabel('page', ayatOfPage(24))).toBe('الصفحة ٢٤');
    expect(
      rangeLabel('page', { from: ayatOfPage(24).from, to: ayatOfPage(25).to }),
    ).toBe('الصفحتان ٢٤ و٢٥');
    expect(rangeShort('page', ayatOfPage(24))).toBe('ص ٢٤');
  });

  it('names ayat within their surah', () => {
    expect(rangeLabel('ayah', kahf(5, 9))).toBe('الآيات ٥–٩ من سورة الكهف');
    expect(rangeLabel('ayah', kahf(7, 7))).toBe('الآية ٧ من سورة الكهف');
    expect(rangeShort('ayah', kahf(5, 9))).toBe('الكهف ٥–٩');
    expect(rangeShort('ayah', kahf(7, 7))).toBe('الكهف ٧');
  });

  it('names both surahs when a turn of ayat crosses from one to the next', () => {
    const across = { from: ayahIndex(1, 7), to: ayahIndex(2, 3) + 1 };
    expect(ayatLabel(across)).toBe('من الفاتحة ٧ إلى البقرة ٣');
    expect(rangeShort('ayah', across)).toBe('الفاتحة ٧ – البقرة ٣');
  });

  it('names a quarter as the margin does', () => {
    expect(rangeLabel('rub', rubRange(10))).toBe('ربع الحزب ٣');
    expect(rangeLabel('rub', rubRange(9))).toBe('الحزب ٣');
    expect(rangeShort('rub', rubRange(11))).toBe('نصف الحزب ٣');
  });

  it('names a surah', () => {
    expect(rangeLabel('surah', surahRange(67))).toBe('سورة الملك');
    expect(rangeShort('surah', surahRange(67))).toBe('الملك');
  });

  it('names a quarter or a surah cut short by its ayat', () => {
    // A sitting that stops at the end of juz 1 cuts al-Baqarah at 141.
    const cut = { from: surahRange(2).from, to: ayahIndex(2, 141) + 1 };
    expect(rangeLabel('surah', cut)).toBe('الآيات ١–١٤١ من سورة البقرة');
    const quarter = rubRange(240);
    expect(rangeLabel('rub', { ...quarter, to: quarter.to - 3 })).toBe(
      'من العاديات ٩ إلى الناس ٣',
    );
    expect(rangeLabel('rub', rubRange(240))).toBe('ثلاثة أرباع الحزب ٦٠');
    expect(rubRange(240).to).toBe(AYAH_COUNT + 1);
  });

  it('says nothing for a turn with nothing left', () => {
    expect(rangeLabel('ayah', { from: 9, to: 9 })).toBe('');
    expect(rangeShort('surah', { from: 9, to: 9 })).toBe('');
  });
});

/** Words alone, as someone speaking to their device says them: no marks
    between them, one space each. */
const words = (s: string) =>
  s
    .replace(/[،؛:.…·—–()«»/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** Whether a name begins with what its control shows (WCAG 2.5.3). */
const begins = (name: string, ...shown: string[]) =>
  words(name).startsWith(words(shown.filter(Boolean).join(' ')));

describe('a turn at the length of a line', () => {
  it('leaves the surah of a run of ayat to the page', () => {
    expect(portionLabel('ayah', kahf(5, 9))).toBe('الآيات ٥–٩');
    expect(portionLabel('ayah', kahf(7, 7))).toBe('الآية ٧');
    expect(portionLabel('page', ayatOfPage(24))).toBe('الصفحة ٢٤');
    expect(portionLabel('rub', rubRange(10))).toBe('ربع الحزب ٣');
    expect(portionLabel('surah', surahRange(67))).toBe('سورة الملك');
    const across = { from: ayahIndex(1, 7), to: ayahIndex(2, 3) + 1 };
    expect(portionLabel('ayah', across)).toBe('الفاتحة ٧ – البقرة ٣');
  });

  it('names a quarter or a surah cut short by its ayat', () => {
    const cut = { from: surahRange(2).from, to: ayahIndex(2, 141) + 1 };
    expect(portionLabel('surah', cut)).toBe('الآيات ١–١٤١');
  });

  it('shortens only pages on a phone', () => {
    expect(portionNarrow('page', ayatOfPage(294))).toBe('ص ٢٩٤');
    expect(portionNarrow('ayah', kahf(5, 9))).toBe('الآيات ٥–٩');
  });
});

describe('the top bar', () => {
  it('shows the page in the chip, and names it by those words first', () => {
    const chip = placeChip(50);
    expect(chip.text).toBe('ص ٥٠');
    expect(chip.name).toBe('ص ٥٠: الصفحة ٥٠، انتقل إلى موضع آخر');
    expect(begins(chip.name, chip.text)).toBe(true);
  });

  it('says under the name what the turn reads, and who reads after', () => {
    const omar = { name: 'عمر', unit: 'ayah' as Unit, range: kahf(10, 14) };
    expect(
      stripDetail({ unit: 'ayah', range: kahf(5, 9), next: omar, end: null }),
    ).toEqual({ portion: 'الآيات ٥–٩', after: 'ثم عمر' });
    // A turn of pages leaves the page to the chip beside it.
    expect(
      stripDetail({
        unit: 'page',
        range: ayatOfPage(24),
        next: { ...omar, unit: 'page', range: ayatOfPage(25) },
        end: null,
      }),
    ).toEqual({ portion: '', after: 'ثم عمر' });
    // Nobody after a reader alone, nor after the turn that ends it all.
    const alone = { ...omar, name: null };
    expect(
      stripDetail({ unit: 'ayah', range: kahf(5, 9), next: alone, end: null })
        .after,
    ).toBe('');
    expect(
      stripDetail({ unit: 'ayah', range: kahf(5, 9), next: omar, end: 'goal' })
        .after,
    ).toBe('');
  });
});

describe('the progress line', () => {
  it('shows the place in the Mushaf when there is no goal', () => {
    expect(
      sittingProgress({
        unit: 'page',
        page: 151,
        place: ayatOfPage(151).from,
        from: 1,
        until: null,
      }),
    ).toEqual({
      name: 'الموضع في المصحف',
      text: 'الصفحة ١٥١ من ٦٠٤',
      share: 0.25,
    });
  });

  it('shows the way to the goal, and counts what is left in the unit', () => {
    const from = ayatOfPage(50).from;
    const until = ayatOfPage(53).to;
    const pages = sittingProgress({
      unit: 'page',
      page: 51,
      place: ayatOfPage(51).from,
      from,
      until,
    });
    expect(pages.name).toBe('الطريق إلى الغاية');
    expect(pages.text).toBe('٣ صفحات إلى الغاية');
    expect(pages.share).toBeGreaterThan(0);
    expect(pages.share).toBeLessThan(0.5);
    const ayat = sittingProgress({
      unit: 'ayah',
      page: 294,
      place: kahf(5, 9).from,
      from: kahf(1, 1).from,
      until: kahf(10, 10).from,
    });
    expect(ayat.text).toBe('٥ آيات إلى الغاية');
    expect(ayat.share).toBeCloseTo(4 / 9);
    const reached = sittingProgress({
      unit: 'ayah',
      page: 294,
      place: kahf(10, 10).from,
      from: kahf(1, 1).from,
      until: kahf(10, 10).from,
    });
    expect(reached).toMatchObject({ text: 'بلغتم الغاية', share: 1 });
    // One reading alone is spoken to as one.
    expect(
      sittingProgress({
        unit: 'ayah',
        page: 294,
        place: kahf(10, 10).from,
        from: kahf(1, 1).from,
        until: kahf(10, 10).from,
        alone: true,
      }).text,
    ).toBe('بلغتَ الغاية');
  });
});

describe('the button back', () => {
  it('goes back a page within the turn, or to the turn before', () => {
    expect(backLabel({ pageInTurn: 1, alone: false, unit: 'page' })).toBe(
      'الصفحة السابقة',
    );
    expect(backLabel({ pageInTurn: 0, alone: false, unit: 'ayah' })).toBe(
      'القارئ السابق',
    );
    expect(backLabel({ pageInTurn: 0, alone: true, unit: 'page' })).toBe(
      'الصفحة السابقة',
    );
    expect(backLabel({ pageInTurn: 0, alone: true, unit: 'ayah' })).toBe(
      'الدور السابق',
    );
  });
});

describe('the main button on a reader’s turn', () => {
  const next = (name: string | null, unit: Unit = 'page') => ({
    name,
    unit,
    range: unit === 'page' ? ayatOfPage(51) : kahf(10, 14),
  });

  it('passes the turn on, naming who reads next and what', () => {
    expect(doneLabels({ step: null, next: next('فاطمة'), end: null })).toEqual({
      main: { long: 'تمّ — التالي', short: 'تمّ — التالي' },
      sub: { long: 'فاطمة · الصفحة ٥١', short: 'فاطمة' },
    });
    expect(
      doneLabels({ step: null, next: next('عمر', 'ayah'), end: null }).sub,
    ).toEqual({ long: 'عمر · الآيات ١٠–١٤', short: 'عمر' });
  });

  it('turns the page within a turn of several', () => {
    expect(
      doneLabels({ step: { at: 2, of: 2 }, next: next('فاطمة'), end: null }),
    ).toEqual({
      main: { long: 'الصفحة التالية', short: 'التالية' },
      sub: { long: '٢ من ٢ · ثم فاطمة', short: '٢ من ٢' },
    });
  });

  it('says «الصفحة التالية» to someone reading pages alone', () => {
    expect(doneLabels({ step: null, next: next(null), end: null })).toEqual({
      main: { long: 'الصفحة التالية', short: 'التالية' },
      sub: { long: 'الصفحة ٥١', short: 'ص ٥١' },
    });
    expect(
      doneLabels({ step: null, next: next(null, 'ayah'), end: null }).main.long,
    ).toBe('تمّ — التالي');
  });

  it('says what the last turn completes', () => {
    expect(doneLabels({ step: null, next: next('عمر'), end: 'khatm' })).toEqual(
      {
        main: { long: 'تمّ', short: 'تمّ' },
        sub: { long: 'وبه يُختم المصحف', short: 'وبه يُختم المصحف' },
      },
    );
    expect(
      doneLabels({ step: null, next: next('عمر'), end: 'goal' }).sub?.long,
    ).toBe('وبه تبلغون الغاية');
    // Nobody next: a circle of one, spoken to as one.
    expect(
      doneLabels({ step: null, next: next(null), end: 'goal' }).sub?.long,
    ).toBe('وبه تبلغ الغاية');
  });
});

describe('a reciter’s turn', () => {
  const base = {
    reciter: 'عبد الباسط',
    left: 254_000,
    next: { name: 'عمر', unit: 'page' as Unit, range: ayatOfPage(51) },
    end: null,
    unit: 'page' as Unit,
    range: ayatOfPage(50),
    untimed: false,
  };
  const statuses: PlayerStatus[] = [
    'idle',
    'loading',
    'playing',
    'paused',
    'blocked',
    'error',
    'ended',
  ];

  it('says what a press does, and how long is left', () => {
    expect(recitationLabels({ ...base, status: 'playing' })).toEqual({
      main: 'إيقاف مؤقت',
      sub: { long: 'بقي ٤:١٤', short: 'بقي ٤:١٤' },
      name: 'إيقاف مؤقت، بقي ٤:١٤، تلاوة عبد الباسط',
    });
    expect(recitationLabels({ ...base, status: 'paused' }).main).toBe('متابعة');
    expect(recitationLabels({ ...base, status: 'blocked' })).toMatchObject({
      main: 'استمع',
      name: 'استمع إلى عبد الباسط',
    });
  });

  it('offers to skip a recitation that will not play', () => {
    expect(recitationLabels({ ...base, status: 'error' })).toEqual({
      main: 'تخطَّ',
      sub: { long: 'تعذّر تشغيل التلاوة', short: 'تعذّر تشغيل التلاوة' },
      name: 'تخطَّ، تعذّر تشغيل التلاوة، التالي: عمر، الصفحة ٥١',
    });
    expect(
      recitationLabels({ ...base, status: 'error', end: 'khatm' }).name,
    ).toBe('تخطَّ، تعذّر تشغيل التلاوة، وبه يُختم المصحف');
  });

  it('says plainly when his recording of the turn cannot be played', () => {
    const labels = recitationLabels({
      ...base,
      status: 'error',
      untimed: true,
    });
    expect(labels.main).toBe('تخطَّ');
    expect(labels.sub.long).toBe(
      'لا تتوفّر تلاوة هذه الصفحة بصوت الشيخ عبد الباسط',
    );
    expect(labels.sub.short).toBe('التلاوة غير متوفّرة');
    expect(untimedLabel('ayah', kahf(5, 9), 'الحصري')).toBe(
      'لا تتوفّر تلاوة هذه الآيات بصوت الشيخ الحصري',
    );
    expect(untimedLabel('surah', surahRange(67), 'الحصري')).toBe(
      'لا تتوفّر تلاوة هذه السورة بصوت الشيخ الحصري',
    );
  });

  it('names the button by the words it shows, in every state', () => {
    for (const status of statuses)
      for (const untimed of [false, true])
        for (const left of [null, 61_000]) {
          const l = recitationLabels({ ...base, status, untimed, left });
          expect(
            begins(l.name, l.main, l.sub.long),
            `${status} ${untimed}`,
          ).toBe(true);
        }
  });

  it('names «تخطَّ» by where it leads', () => {
    expect(skipLabel(base.next, null)).toBe('تخطَّ إلى عمر، الصفحة ٥١');
    expect(skipLabel({ ...base.next, name: null }, null)).toBe(
      'تخطَّ إلى الصفحة ٥١',
    );
    expect(skipLabel(base.next, 'goal')).toBe('تخطَّ، وبه تبلغون الغاية');
    expect(skipLabel({ ...base.next, name: null }, 'goal')).toBe(
      'تخطَّ، وبه تبلغ الغاية',
    );
  });
});

describe('the timer and «استمع»', () => {
  it('begins the timer’s name with its time, and says when there is none yet', () => {
    expect(timerLabel(false, 73_000)).toBe('١:١٣، إيقاف التوقيت مؤقتًا');
    expect(timerLabel(true, 73_000)).toBe('١:١٣، استئناف التوقيت');
    expect(timerLabel(false, null)).toBe(
      'جارٍ تحميل التوقيت، إيقاف التوقيت مؤقتًا',
    );
    expect(timerLabel(false, null)).not.toContain('أقل من ثانية');
  });

  it('names «استمع» by the words it shows, in every state', () => {
    const statuses: PlayerStatus[] = [
      'idle',
      'loading',
      'playing',
      'paused',
      'blocked',
      'error',
      'ended',
    ];
    for (const status of statuses) {
      const l = listenLabels(status, 'الصفحة ٢٤', null);
      expect(begins(l.name, l.text), status).toBe(true);
      expect(l.name).toContain('الصفحة ٢٤');
    }
  });

  it('offers another sheikh where his recording cannot be played', () => {
    const untimed = untimedLabel('page', ayatOfPage(24), 'الحصري');
    expect(listenLabels('error', 'الصفحة ٢٤', untimed)).toEqual({
      text: 'شيخ آخر',
      name: 'شيخ آخر: لا تتوفّر تلاوة هذه الصفحة بصوت الشيخ الحصري',
    });
  });
});

describe('what a screen reader hears', () => {
  const turn = {
    end: null,
    phrase: 'دور القارئ الثاني',
    unit: 'page' as Unit,
    range: ayatOfPage(2),
    page: 2,
    reciter: null,
  };

  it('says whose turn it is and what it reads', () => {
    expect(turnAnnouncement(turn)).toBe('دور القارئ الثاني، الصفحة ٢');
    expect(
      turnAnnouncement({
        ...turn,
        phrase: 'دور عمر',
        unit: 'ayah',
        range: kahf(5, 9),
        page: 294,
      }),
    ).toBe('دور عمر، الآيات ٥–٩ من سورة الكهف');
  });

  it('says which page of a turn of several is open', () => {
    expect(
      turnAnnouncement({
        ...turn,
        range: { from: ayatOfPage(2).from, to: ayatOfPage(3).to },
        page: 3,
      }),
    ).toBe('دور القارئ الثاني، الصفحتان ٢ و٣، الآن الصفحة ٣');
  });

  it('says what a reciter’s turn needs from the room', () => {
    const reciter = (status: PlayerStatus, untimed = false) =>
      turnAnnouncement({
        ...turn,
        phrase: 'يتلو الحصري',
        reciter: { name: 'الحصري', status, untimed },
      });
    expect(reciter('playing')).toBe('يتلو الحصري، الصفحة ٢');
    expect(reciter('blocked')).toBe(
      'يتلو الحصري، الصفحة ٢. اضغط «استمع إلى الحصري» لتبدأ تلاوته.',
    );
    expect(reciter('error')).toContain('تعذّر تشغيل التلاوة');
    expect(reciter('error', true)).toBe(
      'يتلو الحصري، الصفحة ٢. لا تتوفّر تلاوة هذه الصفحة بصوت الشيخ الحصري: اضغط «تخطَّ» لتنتقل إلى التالي.',
    );
  });

  it('says how the sitting ended', () => {
    expect(turnAnnouncement({ ...turn, end: 'khatm' })).toBe(
      'خُتم المصحف. تقبّل الله منكم.',
    );
    expect(turnAnnouncement({ ...turn, end: 'goal' })).toBe(
      'بلغتم الغاية. تقبّل الله منكم.',
    );
    expect(endTitle('goal')).toBe('بلغتم الغاية');
    expect(turnAnnouncement({ ...turn, end: 'goal', alone: true })).toBe(
      'بلغتَ الغاية. تقبّل الله منك.',
    );
    expect(endTitle('goal', true)).toBe('بلغتَ الغاية');
    expect(endTitle('khatm', true)).toBe('خُتم المصحف');
  });

  it('says a round of repeat mode is read', () => {
    expect(roundDone('page', ayatOfPage(24))).toEqual({
      text: 'قرأ الجميع الصفحة ٢٤',
      said: 'قرأ الجميع الصفحة ٢٤.',
    });
    expect(roundDone('ayah', kahf(5, 9))).toEqual({
      text: 'قرأ الجميع الآيات ٥–٩',
      said: 'قرأ الجميع الآيات ٥–٩ من سورة الكهف.',
    });
  });
});

describe('the circle', () => {
  it('shows in its middle where the circle is', () => {
    expect(circleCenter('page', ayatOfPage(24), 24, false)).toEqual({
      label: 'الصفحة',
      value: '٢٤',
    });
    expect(circleCenter('page', ayatOfPage(24), 24, true).label).toBe('تكرار');
    expect(circleCenter('ayah', kahf(5, 9), 294, false)).toEqual({
      label: 'الكهف',
      value: '٥–٩',
    });
    expect(circleCenter('rub', rubRange(10), 24, false)).toEqual({
      label: 'ربع الحزب',
      value: '٣',
    });
    expect(circleCenter('surah', surahRange(67), 562, false)).toEqual({
      label: 'سورة',
      value: 'الملك',
    });
  });

  it('counts what the sitting has read, in its unit', () => {
    expect(sittingNote('page', 0, 0)).toBe('لم تُقرأ صفحة بعد');
    expect(sittingNote('page', 2, 9)).toBe('قرأتم صفحتين في هذا المجلس');
    expect(sittingNote('page', 3, 9)).toBe('قرأتم ٣ صفحات في هذا المجلس');
    expect(sittingNote('ayah', 1, 0)).toBe('لم تُقرأ آية بعد');
    expect(sittingNote('ayah', 0, 11)).toBe('قرأتم ١١ آية في هذا المجلس');
    // One reading alone is spoken to as one, «قرأتَ», not «قرأتم».
    expect(sittingNote('page', 1, 9, true)).toBe(
      'قرأتَ صفحة واحدة في هذا المجلس',
    );
    expect(sittingNote('ayah', 0, 2, true)).toBe('قرأتَ آيتين في هذا المجلس');
  });

  it('says what each seat does', () => {
    const seat = {
      reciter: false,
      active: false,
      round: null,
      next: false,
      upcoming: 'ص ٢٥',
    };
    expect(seatStatus({ ...seat, active: true })).toBe('يقرأ الآن');
    expect(seatStatus({ ...seat, reciter: true, active: true })).toBe(
      'يتلو الآن',
    );
    expect(seatStatus({ ...seat, round: 'done' })).toBe('قرأ');
    expect(seatStatus({ ...seat, round: 'skipped' })).toBe('لم يقرأها');
    expect(seatStatus({ ...seat, reciter: true, round: 'skipped' })).toBe(
      'لم يتلُها',
    );
    expect(seatStatus({ ...seat, next: true })).toBe('التالي');
    expect(seatStatus(seat)).toBe('ص ٢٥');
  });
});
