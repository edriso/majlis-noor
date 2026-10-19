/* What the start screen says about the circle before it sits, and the one
   change it makes in a single press, the teaching circle. Plain functions,
   so every sentence is tested here rather than found by reading a
   component. Where the model decides what is allowed, these ask it
   (`sanitizeConfig`), so the screen never offers what the model would
   quietly drop. */

import { arabic, ayatCount, genitive, pagesCount } from '@/data/arabic';
import {
  firstAyahOfPage,
  juzOfAyah,
  pageOfAyah,
  surahOfAyah,
  surahTitle,
  verseOf,
} from '@/data/mushaf';
import {
  completion,
  currentPage,
  currentRange,
  goalEnd,
  memberName,
  newMember,
  placeOf,
  planOf,
  sanitizeConfig,
  turnPhrase,
  type Config,
  type Goal,
  type Session,
} from './state';
import { endTitle, portionLabel } from './labels';
import { readerOf, type Rotate, type Unit } from './schedule';

/** The recording a teaching circle seats first: al-Husary's teaching
    Mushaf, which leaves a silence after each ayah for the learner. */
export const TEACHER = 'husary-muallim';

/**
 * «حلقة تلقين»: the sheikh recites a few ayat, then each one present reads
 * them. Repeat mode, three ayat a turn, and the teaching recording in the
 * first seat, added if he is not in the circle and moved first if he is.
 * Null when he is not in it and the circle is full, since there is no seat
 * to give him.
 */
export function talqeen(config: Config): Config | null {
  const at = config.members.findIndex(
    (m) => m.kind === 'reciter' && m.reciter === TEACHER,
  );
  let members = config.members;
  if (at === -1) {
    const sheikh = newMember(config.members, 'reciter', TEACHER);
    if (!sheikh) return null;
    members = [sheikh, ...config.members];
  } else if (at > 0)
    members = [
      config.members[at],
      ...config.members.filter((_, i) => i !== at),
    ];
  return sanitizeConfig({
    ...config,
    members,
    mode: 'repeat',
    unit: 'ayah',
    size: 3,
  });
}

/** Whether the circle is already a teaching circle: what `talqeen` makes,
    with someone after the sheikh to repeat after him. */
export function isTalqeen(c: Config) {
  const first = c.members[0];
  return (
    c.members.length > 1 &&
    c.mode === 'repeat' &&
    c.unit === 'ayah' &&
    c.size === 3 &&
    first.kind === 'reciter' &&
    first.reciter === TEACHER
  );
}

/** Who opens each page (or surah) may move round only where the model
    keeps it: in continue mode, with two or more, and in a unit smaller
    than the line. The choices it keeps, «لا» first. */
export function rotations(c: Config): Rotate[] {
  const kept = (['page', 'surah'] as const).filter(
    (rotate) => sanitizeConfig({ ...c, rotate }).rotate === rotate,
  );
  return ['none', ...kept];
}

/** How much a turn reads, as a few words: «صفحة», «صفحتان», «آيتان»,
    «٣ آيات», «ربع حزب», «سورة». One stands alone, without «واحدة», as
    it would be said. */
export function sizeWords(unit: Unit, size: number) {
  if (unit === 'rub') return 'ربع حزب';
  if (unit === 'surah') return 'سورة';
  if (unit === 'page') return size === 1 ? 'صفحة' : pagesCount(size);
  return size === 1 ? 'آية' : ayatCount(size);
}

/** «إلى آخر السورة», «إلى آخر الجزء», «إلى الصفحة ٦٠»; nothing for a
    sitting with no goal. */
export function goalWords(goal: Goal) {
  if (goal.to === 'surah') return 'إلى آخر السورة';
  if (goal.to === 'juz') return 'إلى آخر الجزء';
  if (goal.to === 'page') return `إلى الصفحة ${arabic(goal.page)}`;
  return '';
}

/**
 * The circle's way of reading as one row: what it does on every turn in
 * the title, «كلٌّ يُكمل · صفحة · بضغطة «تمّ»», and what it does besides
 * in the detail, «إلى آخر السورة · من الحفظ». Only what applies: a circle
 * of one has no mode, a circle of sheikhs alone no turn to time and
 * nothing to read from memory. Each part is said in words a newcomer
 * knows, the words its choice shows, rather than a name for it («التتابع»,
 * «يدوي») that has to be learnt.
 */
export function circleSummary(c: Config): { title: string; detail: string } {
  const people = c.members.some((m) => m.kind === 'person');
  const title = [
    c.members.length > 1 ? (c.mode === 'repeat' ? 'كلٌّ يكرّر' : 'كلٌّ يُكمل') : '',
    sizeWords(c.unit, c.size),
    people ? (c.turnChange === 'reciter' ? 'بتوقيت الشيخ' : 'بضغطة «تمّ»') : '',
  ];
  const detail = [
    goalWords(c.goal),
    c.rotate !== 'none' ? 'يتبدّل البادئ' : '',
    people && c.fromMemory ? 'من الحفظ' : '',
  ];
  const join = (parts: string[]) => parts.filter(Boolean).join(' · ');
  return { title: join(title), detail: join(detail) };
}

/**
 * Where a sitting will start, as the start screen's row shows it: the
 * surah, large, and under it the page and juz, «الصفحة ٥٠ · الجزء ٣».
 * A circle reading by the ayah starts on the ayah itself, so one inside a
 * surah is named too: «الآية ٥٠ · الصفحة ٨ · الجزء ١».
 */
export function placeSummary(start: number, unit: Unit) {
  const { ayah } = verseOf(start);
  const detail = [
    unit === 'ayah' && ayah > 1 ? `الآية ${arabic(ayah)}` : '',
    `الصفحة ${arabic(pageOfAyah(start))}`,
    `الجزء ${arabic(juzOfAyah(start))}`,
  ];
  return {
    title: surahTitle(surahOfAyah(start)),
    detail: detail.filter(Boolean).join(' · '),
  };
}

/**
 * What a goal comes to from where the sitting starts, said under the
 * choice: «حتى آخر سورة آل عمران، في الصفحة ٧٦». A page before the start
 * is no goal at all, and the model drops it; the reader is told so. A
 * circle of one (`alone`) is spoken to as one.
 */
export function goalNote(goal: Goal, from: number, alone = false) {
  if (goal.to === 'none')
    return alone ? 'تقرأ حتى تُنهي المجلس.' : 'تقرؤون حتى تُنهوا المجلس.';
  const end = goalEnd(goal, from);
  if (end === null)
    return `هذه الصفحة قبل موضع البدء، فلا غاية بها. ${alone ? 'اختر' : 'اختاروا'} صفحة بعده.`;
  const last = pageOfAyah(end - 1);
  if (goal.to === 'surah')
    return `حتى آخر ${surahTitle(surahOfAyah(from))}، في الصفحة ${arabic(last)}.`;
  if (goal.to === 'juz')
    return `حتى آخر الجزء ${arabic(juzOfAyah(from))}، في الصفحة ${arabic(last)}.`;
  return `حتى آخر الصفحة ${arabic(last)}، في ${surahTitle(surahOfAyah(end - 1))}.`;
}

/**
 * The card for a sitting left open: where it is, «الصفحة ٢ · سورة البقرة»
 * or «الآيات ٥–٩ · سورة الكهف», and whose turn it is, «دورك», «دور
 * فاطمة», «يتلو الحصري»; or how it ended, a khatm or the goal reached.
 */
export function resumeLines(s: Session) {
  const { config } = s;
  const end = completion(s);
  const range = currentRange(s);
  const page = currentPage(s);
  const first = surahOfAyah(range.from);
  let place: string;
  // A page is named by the surah read on it: the one it begins in, or the
  // one the turn begins at part-way down it.
  if (end || config.unit === 'page')
    place = `الصفحة ${arabic(page)} · ${surahTitle(surahOfAyah(end ? firstAyahOfPage(page) : placeOf(s)))}`;
  else {
    const label = portionLabel(config.unit, range);
    // A whole surah is named by itself, and a run across two surahs
    // names both already.
    const named =
      label.startsWith('سورة') || first !== surahOfAyah(range.to - 1);
    place = named ? label : `${label} · ${surahTitle(first)}`;
  }
  const member = config.members[readerOf(planOf(config), s.turn)];
  const turn = end
    ? endTitle(end, config.members.length === 1)
    : config.members.length > 1
      ? turnPhrase(member)
      : member.kind === 'reciter'
        ? `استماع إلى ${genitive(memberName(member))}`
        : 'قراءة فردية';
  return { place, turn };
}
