import { describe, expect, it } from 'vitest';
import { ayahIndex, firstAyahOfPage, surahRange } from '@/data/mushaf';
import {
  circleSummary,
  goalNote,
  goalWords,
  isTalqeen,
  placeSummary,
  resumeLines,
  rotations,
  sizeWords,
  talqeen,
  TEACHER,
} from './circleLabels';
import {
  defaultConfig,
  initialState,
  MAX_MEMBERS,
  newMember,
  reduce,
  type Config,
  type Member,
} from './state';

const you: Member = { id: 'p1', kind: 'person', name: '' };
const fatima: Member = { id: 'p2', kind: 'person', name: 'فاطمة' };
const minshawi: Member = { id: 'r1', kind: 'reciter', reciter: 'minshawi' };
const teacher: Member = { id: 'r2', kind: 'reciter', reciter: TEACHER };
const config = (c: Partial<Config> = {}): Config => ({
  ...defaultConfig,
  ...c,
});

describe('the teaching circle', () => {
  it('seats the teaching recording first, in repeat mode, three ayat a turn', () => {
    const next = talqeen(config())!;
    expect(next.members.map((m) => m.id)).toEqual(['r1', 'p1']);
    expect(next.members[0]).toMatchObject({ reciter: TEACHER });
    expect(next).toMatchObject({ mode: 'repeat', unit: 'ayah', size: 3 });
    expect(isTalqeen(next)).toBe(true);
    expect(isTalqeen(config())).toBe(false);
  });

  it('moves him first if he already sits, and keeps everyone else in order', () => {
    const next = talqeen(config({ members: [you, fatima, teacher] }))!;
    expect(next.members.map((m) => m.id)).toEqual(['r2', 'p1', 'p2']);
    // Pressed again, nothing moves.
    expect(talqeen(next)).toEqual(next);
  });

  it('finds no seat for him in a full circle he is not in', () => {
    const members: Member[] = [];
    for (let i = 0; i < MAX_MEMBERS; i++)
      members.push(newMember(members, 'person')!);
    expect(talqeen(config({ members }))).toBeNull();
    // In it already, he moves up whatever the count.
    members[MAX_MEMBERS - 1] = teacher;
    expect(talqeen(config({ members }))?.members[0]).toEqual(teacher);
  });

  it('lets go of swapping who starts, which repeat mode does not keep', () => {
    const next = talqeen(
      config({ members: [you, fatima], unit: 'ayah', rotate: 'page' }),
    )!;
    expect(next.rotate).toBe('none');
  });
});

describe('swapping who starts', () => {
  const two = { members: [you, fatima] };
  it('offers each page only to turns of ayat, and each surah to anything smaller', () => {
    expect(rotations(config({ ...two, unit: 'ayah' }))).toEqual([
      'none',
      'page',
      'surah',
    ]);
    expect(rotations(config({ ...two, unit: 'page' }))).toEqual([
      'none',
      'surah',
    ]);
    expect(rotations(config({ ...two, unit: 'rub' }))).toEqual([
      'none',
      'surah',
    ]);
    expect(rotations(config({ ...two, unit: 'surah' }))).toEqual(['none']);
  });

  it('offers nothing to one reader or in repeat mode', () => {
    expect(rotations(config({ unit: 'ayah' }))).toEqual(['none']);
    expect(rotations(config({ ...two, unit: 'ayah', mode: 'repeat' }))).toEqual(
      ['none'],
    );
  });
});

describe('the summary row', () => {
  it('says how much a turn reads in a few words', () => {
    expect(sizeWords('page', 1)).toBe('صفحة');
    expect(sizeWords('page', 2)).toBe('صفحتان');
    expect(sizeWords('page', 3)).toBe('٣ صفحات');
    expect(sizeWords('ayah', 1)).toBe('آية');
    expect(sizeWords('ayah', 2)).toBe('آيتان');
    expect(sizeWords('ayah', 10)).toBe('١٠ آيات');
    expect(sizeWords('rub', 1)).toBe('ربع حزب');
    expect(sizeWords('surah', 1)).toBe('سورة');
  });

  it('says only what applies', () => {
    expect(circleSummary(config())).toEqual({
      title: 'صفحة · يدوي',
      detail: '',
    });
    expect(
      circleSummary(config({ members: [you, fatima], unit: 'ayah', size: 2 })),
    ).toEqual({ title: 'التتابع · آيتان · يدوي', detail: '' });
    expect(
      circleSummary(
        config({
          members: [you, minshawi],
          mode: 'repeat',
          turnChange: 'reciter',
          goal: { to: 'surah' },
          fromMemory: true,
        }),
      ),
    ).toEqual({
      title: 'التكرار · صفحة · بتوقيت الشيخ',
      detail: 'إلى آخر السورة · من الحفظ',
    });
    // A circle of sheikhs alone has no turn to time or read from memory.
    expect(
      circleSummary(config({ members: [minshawi], fromMemory: true })),
    ).toEqual({ title: 'صفحة', detail: '' });
    expect(
      circleSummary(
        config({
          members: [you, fatima],
          unit: 'ayah',
          rotate: 'page',
          goal: { to: 'page', page: 60 },
        }),
      ).detail,
    ).toBe('إلى الصفحة ٦٠ · يتبدّل البادئ');
  });

  it('names each goal', () => {
    expect(goalWords({ to: 'none' })).toBe('');
    expect(goalWords({ to: 'juz' })).toBe('إلى آخر الجزء');
  });
});

describe('where the sitting starts', () => {
  it('names the surah, then the page and juz', () => {
    expect(placeSummary(surahRange(3).from, 'page')).toEqual({
      title: 'سورة آل عمران',
      detail: 'الصفحة ٥٠ · الجزء ٣',
    });
  });

  it('names the ayah too where a circle reads by the ayah', () => {
    expect(placeSummary(ayahIndex(2, 50), 'ayah')).toEqual({
      title: 'سورة البقرة',
      detail: 'الآية ٥٠ · الصفحة ٨ · الجزء ١',
    });
    expect(placeSummary(ayahIndex(2, 50), 'page').detail).toBe(
      'الصفحة ٨ · الجزء ١',
    );
    expect(placeSummary(ayahIndex(2, 1), 'ayah').detail).toBe(
      'الصفحة ٢ · الجزء ١',
    );
  });

  it('says what a goal comes to from there', () => {
    const imran = surahRange(3).from;
    expect(goalNote({ to: 'surah' }, imran)).toBe(
      'حتى آخر سورة آل عمران، في الصفحة ٧٦.',
    );
    expect(goalNote({ to: 'juz' }, imran)).toBe(
      // The fourth juz begins part-way down page 62.
      'حتى آخر الجزء ٣، في الصفحة ٦٢.',
    );
    expect(goalNote({ to: 'page', page: 60 }, imran)).toBe(
      'حتى آخر الصفحة ٦٠، في سورة آل عمران.',
    );
    expect(goalNote({ to: 'page', page: 10 }, imran)).toMatch(
      /^هذه الصفحة قبل موضع البدء.*اختاروا صفحة بعده\.$/,
    );
    expect(goalNote({ to: 'page', page: 10 }, imran, true)).toMatch(
      /اختر صفحة بعده\.$/,
    );
    expect(goalNote({ to: 'none' }, imran)).toBe('تقرؤون حتى تُنهوا المجلس.');
    expect(goalNote({ to: 'none' }, imran, true)).toBe('تقرأ حتى تُنهي المجلس.');
  });
});

describe('the card for a sitting left open', () => {
  const started = (c: Partial<Config>) =>
    reduce(initialState, { type: 'start', config: config(c), at: 0 }).session!;

  it('says where the circle is and whose turn it is', () => {
    const s = started({ members: [you, fatima], start: firstAyahOfPage(50) });
    expect(resumeLines(s)).toEqual({
      place: 'الصفحة ٥٠ · سورة آل عمران',
      turn: 'دورك',
    });
    expect(resumeLines({ ...s, turn: 1 }).turn).toBe('دور فاطمة');
  });

  it('names a turn of ayat by its ayat and surah', () => {
    const s = started({
      members: [minshawi, you],
      unit: 'ayah',
      size: 5,
      start: ayahIndex(18, 5),
    });
    expect(resumeLines(s)).toEqual({
      place: 'الآيات ٥–٩ · سورة الكهف',
      turn: 'يتلو المنشاوي',
    });
  });

  it('names a whole surah once', () => {
    const s = started({ unit: 'surah', start: surahRange(67).from });
    expect(resumeLines(s)).toEqual({
      place: 'سورة الملك',
      turn: 'قراءة فردية',
    });
  });

  it('tells a khatm from a goal reached', () => {
    const khatm = reduce(
      { ...initialState, session: started({ start: 6236 }) },
      { type: 'finishTurn' },
    ).session!;
    expect(resumeLines(khatm).turn).toBe('خُتم المصحف');
    const goal = reduce(
      {
        ...initialState,
        session: started({ start: 1, goal: { to: 'page', page: 1 } }),
      },
      { type: 'finishTurn' },
    ).session!;
    // Read alone, and spoken to as one.
    expect(resumeLines(goal)).toEqual({
      place: 'الصفحة ١ · سورة الفاتحة',
      turn: 'بلغتَ الغاية',
    });
    const together = reduce(
      {
        ...initialState,
        session: started({
          members: [you, fatima],
          start: 1,
          goal: { to: 'page', page: 1 },
        }),
      },
      { type: 'finishTurn' },
    ).session!;
    expect(resumeLines(together).turn).toBe('بلغتم الغاية');
  });

  it('listens with one sheikh alone', () => {
    expect(resumeLines(started({ members: [minshawi] })).turn).toBe(
      'استماع إلى المنشاوي',
    );
  });
});
