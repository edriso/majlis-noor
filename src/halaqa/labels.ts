import { arabic, ayatCount, clock, counted, pagesCount } from '@/data/arabic';
import {
  PAGE_COUNT,
  pagesOfRange,
  rubLabel,
  rubOfAyah,
  rubRange,
  surah,
  surahOfAyah,
  surahRange,
  surahTitle,
  verseOf,
  type AyahRange,
} from '@/data/mushaf';
import type { PlayerStatus } from './player';
import type { Unit } from './schedule';

/**
 * A turn's pages as a label: «الصفحة ٢٤», «الصفحتان ٢٤ و٢٥»,
 * «الصفحات ٢٤–٢٦». A turn cut short by the end of the Mushaf can hold fewer
 * pages than the halaqa reads per turn, so this reads the pages themselves.
 */
export function pagesLabel(pages: readonly number[]) {
  if (pages.length === 0) return '';
  if (pages.length === 1) return `الصفحة ${arabic(pages[0])}`;
  if (pages.length === 2)
    return `الصفحتان ${arabic(pages[0])} و${arabic(pages[1])}`;
  return `الصفحات ${arabic(pages[0])}–${arabic(pages[pages.length - 1])}`;
}

/** The same, short enough for a seat in the circle: «ص ٢٤» or «ص ٢٤–٢٥». */
export function pagesShort(pages: readonly number[]) {
  if (pages.length === 0) return '';
  if (pages.length === 1) return `ص ${arabic(pages[0])}`;
  return `ص ${arabic(pages[0])}–${arabic(pages[pages.length - 1])}`;
}

/** The first and last ayah of a range, where they are. */
const endsOf = ({ from, to }: AyahRange) => [verseOf(from), verseOf(to - 1)];

/**
 * A run of ayat: «الآية ٧ من سورة الكهف», «الآيات ٥–٩ من سورة الكهف». A
 * turn counted through the Mushaf may cross from one surah into the next,
 * and then it names both: «من الفاتحة ٧ إلى البقرة ٣».
 */
export function ayatLabel(range: AyahRange) {
  if (range.to <= range.from) return '';
  const [first, last] = endsOf(range);
  if (first.surah !== last.surah)
    return `من ${surah(first.surah).name} ${arabic(first.ayah)} إلى ${surah(last.surah).name} ${arabic(last.ayah)}`;
  const of = `من ${surahTitle(first.surah)}`;
  if (first.ayah === last.ayah) return `الآية ${arabic(first.ayah)} ${of}`;
  return `الآيات ${arabic(first.ayah)}–${arabic(last.ayah)} ${of}`;
}

/** The same, short enough for a seat: «الكهف ٧», «الكهف ٥–٩». */
export function ayatShort(range: AyahRange) {
  if (range.to <= range.from) return '';
  const [first, last] = endsOf(range);
  if (first.surah !== last.surah)
    return `${surah(first.surah).name} ${arabic(first.ayah)} – ${surah(last.surah).name} ${arabic(last.ayah)}`;
  const name = surah(first.surah).name;
  if (first.ayah === last.ayah) return `${name} ${arabic(first.ayah)}`;
  return `${name} ${arabic(first.ayah)}–${arabic(last.ayah)}`;
}

const same = (a: AyahRange, b: AyahRange) => a.from === b.from && a.to === b.to;

/**
 * What a turn reads, in the words of its unit: «الصفحة ٢٤», «الآيات ٥–٩ من
 * سورة الكهف», «ربع الحزب ٣» as the margin names the quarter, «سورة الملك».
 * A quarter or a surah cut short (at the end of the Mushaf, or where the
 * sitting means to stop) is named by its ayat instead, so the label never
 * promises more than the turn holds.
 */
export function rangeLabel(unit: Unit, range: AyahRange) {
  if (range.to <= range.from) return '';
  if (unit === 'page') return pagesLabel(pagesOfRange(range));
  if (unit === 'rub') {
    const n = rubOfAyah(range.from);
    if (same(range, rubRange(n))) return rubLabel(n);
  }
  if (unit === 'surah') {
    const s = surahOfAyah(range.from);
    if (same(range, surahRange(s))) return surahTitle(s);
  }
  return ayatLabel(range);
}

/** The same, short enough for a seat in the circle: «ص ٢٤», «الكهف ٥–٩»,
    «ربع الحزب ٣», «الملك». */
export function rangeShort(unit: Unit, range: AyahRange) {
  if (range.to <= range.from) return '';
  if (unit === 'page') return pagesShort(pagesOfRange(range));
  if (unit === 'rub') {
    const n = rubOfAyah(range.from);
    if (same(range, rubRange(n))) return rubLabel(n);
  }
  if (unit === 'surah') {
    const s = surahOfAyah(range.from);
    if (same(range, surahRange(s))) return surah(s).name;
  }
  return ayatShort(range);
}

/**
 * What a turn reads, at the length of a line beside a name: «الصفحة ٢٤»,
 * «الآيات ٥–٩», «الآية ٧», «ربع الحزب ٣», «سورة الملك». A run of ayat
 * leaves its surah to the page, whose head names it; one that crosses
 * into the next surah names both, «الفاتحة ٧ – البقرة ٣».
 */
export function portionLabel(unit: Unit, range: AyahRange) {
  if (range.to <= range.from) return '';
  if (unit === 'page') return pagesLabel(pagesOfRange(range));
  // A quarter or a surah is named as itself only when whole, as above.
  if (unit === 'rub') {
    const n = rubOfAyah(range.from);
    if (same(range, rubRange(n))) return rubLabel(n);
  }
  if (unit === 'surah') {
    const s = surahOfAyah(range.from);
    if (same(range, surahRange(s))) return surahTitle(s);
  }
  const [first, last] = endsOf(range);
  if (first.surah !== last.surah) return ayatShort(range);
  if (first.ayah === last.ayah) return `الآية ${arabic(first.ayah)}`;
  return `الآيات ${arabic(first.ayah)}–${arabic(last.ayah)}`;
}

/** The same where a phone's line has room for less: pages as «ص ٢٤»,
    which every reader of a Mushaf knows; a run of ayat has no shorter
    name that is still plain words, so it keeps its own. */
export function portionNarrow(unit: Unit, range: AyahRange) {
  return unit === 'page'
    ? pagesShort(pagesOfRange(range))
    : portionLabel(unit, range);
}

/* ---------- The reading screen's words ----------

   Everything the reading screen says about a turn, worked out from plain
   values, so each sentence is tested here rather than found by reading a
   component. A control's name always begins with the words it shows (WCAG
   2.5.3), so someone who speaks to their device can say what they see. */

/** A text and the shorter form a phone shows instead; the same when there
    is no shorter one. */
export type Sized = { long: string; short: string };

/** How a sitting with nothing left ended, as the model says it. */
type End = 'khatm' | 'goal';

/** «خُتم المصحف» or «بلغتم الغاية»: the line at the top once nothing is
    left to read. */
export const endTitle = (end: End) =>
  end === 'khatm' ? 'خُتم المصحف' : 'بلغتم الغاية';

/** What finishing the last turn leads to, under «تمّ» and in «تخطَّ». */
const endNote = (end: End) =>
  end === 'khatm' ? 'وبه يُختم المصحف' : 'وبه تبلغون الغاية';

/** The chip in the top bar that opens the jump: the page open, «ص ٥٠»,
    as every reader of a Mushaf writes it, and a name that begins with
    those words, says them in full and then what a press does. */
export function placeChip(page: number) {
  const text = `ص ${arabic(page)}`;
  return {
    text,
    name: `${text}: الصفحة ${arabic(page)}، انتقل إلى موضع آخر`,
  };
}

/**
 * The quiet line under the reader's name at the top: what the turn reads,
 * when it is counted in something other than the page the chip beside it
 * names («الآيات ٥–٩»), and who reads after it («ثم عمر»). Nobody follows
 * in a circle of one, nor after the turn that ends the sitting.
 */
export function stripDetail({
  unit,
  range,
  next,
  end,
}: {
  unit: Unit;
  range: AyahRange;
  next: Next;
  end: End | null;
}) {
  return {
    portion: unit === 'page' ? '' : portionLabel(unit, range),
    after: next.name && !end ? `ثم ${next.name}` : '',
  };
}

/**
 * The slim line along the top of the buttons: how far the sitting has come
 * towards the goal it set itself, or, with none, where it is in the
 * Mushaf. `share` is the part of it done, from 0 to 1; `name` and `text`
 * are what a screen reader hears of it. What is left is counted in pages
 * where the circle reads pages, in ayat otherwise, so a turn of five ayat
 * is not told it has a page to go when it has three ayat.
 */
export function sittingProgress({
  unit,
  page,
  place,
  from,
  until,
}: {
  unit: Unit;
  /** The page open. */
  page: number;
  /** The first ayah not yet left behind (`placeOf`). */
  place: number;
  /** Where the sitting began, and where its goal is reached (exclusive). */
  from: number;
  until: number | null;
}) {
  if (until === null || until <= from)
    return {
      name: 'الموضع في المصحف',
      text: `الصفحة ${arabic(page)} من ${arabic(PAGE_COUNT)}`,
      share: Math.min(1, Math.max(0, page / PAGE_COUNT)),
    };
  const at = Math.min(Math.max(place, from), until);
  const left =
    unit === 'page'
      ? pagesCount(pagesOfRange({ from: at, to: until }).length)
      : ayatCount(until - at);
  return {
    name: 'الطريق إلى الغاية',
    text: at >= until ? 'بلغتم الغاية' : `${left} إلى الغاية`,
    share: (at - from) / (until - from),
  };
}

/** «القارئ السابق»'s words: the page before within the turn, or the turn
    before, which is someone else's in a circle and the reader's own
    alone, where it is the page before in a circle of pages. */
export function backLabel({
  pageInTurn,
  alone,
  unit,
}: {
  pageInTurn: number;
  alone: boolean;
  unit: Unit;
}) {
  if (pageInTurn > 0) return 'الصفحة السابقة';
  if (!alone) return 'القارئ السابق';
  return unit === 'page' ? 'الصفحة السابقة' : 'الدور السابق';
}

/** Who reads next and what, as the turn passing on shows it. */
export type Next = {
  /** Null in a circle of one, where there is nobody else to name. */
  name: string | null;
  unit: Unit;
  range: AyahRange;
};

/** «عمر · الصفحة ٥١», or the portion alone in a circle of one. A phone
    too narrow for both keeps who reads next, which matters more than
    what they read, and which the circle shows anyway. */
function nextLine({ name, unit, range }: Next): Sized {
  const long = portionLabel(unit, range);
  return name
    ? { long: `${name} · ${long}`, short: name }
    : { long, short: portionNarrow(unit, range) };
}

/**
 * The main button on a reader's turn. Within a turn of several pages it
 * turns to the next: «الصفحة التالية», «٢ من ٢ · ثم فاطمة». On the last
 * it passes the turn: «تمّ — التالي», «فاطمة · الصفحة ٥١», or, alone with
 * a turn of pages, «الصفحة التالية». A phone's line keeps the first half
 * of each («٢ من ٢», «فاطمة»). When nothing is left after it, «تمّ»
 * and what it completes.
 */
export function doneLabels({
  step,
  next,
  end,
}: {
  /** The page the button turns to within the turn, and how many it has;
      null on the turn's last page. */
  step: { at: number; of: number } | null;
  next: Next;
  /** What finishing this turn completes, when nothing comes after it. */
  end: End | null;
}): { main: Sized; sub: Sized | null } {
  const plain = (text: string): Sized => ({ long: text, short: text });
  // «الصفحة التالية» beside its arrow is wider than the button on the
  // narrowest phone, which keeps «التالية» and the page under it.
  const nextPage = { long: 'الصفحة التالية', short: 'التالية' };
  if (step) {
    const where = `${arabic(step.at)} من ${arabic(step.of)}`;
    const line = next.name ? `${where} · ثم ${next.name}` : where;
    return { main: nextPage, sub: { long: line, short: where } };
  }
  if (end) return { main: plain('تمّ'), sub: plain(endNote(end)) };
  const alonePaging = !next.name && next.unit === 'page';
  return {
    main: alonePaging ? nextPage : plain('تمّ — التالي'),
    sub: nextLine(next),
  };
}

/** «تخطَّ»'s name: where skipping a reciter's turn leads. */
export function skipLabel(next: Next, end: End | null) {
  if (end) return `تخطَّ، ${endNote(end)}`;
  const portion = portionLabel(next.unit, next.range);
  return next.name ? `تخطَّ إلى ${next.name}، ${portion}` : `تخطَّ إلى ${portion}`;
}

/** A button's two lines and its name, which begins with them. */
export type ButtonLabels = { main: string; sub: Sized; name: string };

/** «لا تتوفّر تلاوة هذه الصفحة بصوت الشيخ الحصري»: a recording that does
    not fit its timings is never played (see timings.ts), and trying again
    would not change it, so this is said instead of «تعذّر». */
export function untimedLabel(unit: Unit, range: AyahRange, reciter: string) {
  const several = pagesOfRange(range).length > 1;
  const what =
    unit === 'page'
      ? several
        ? 'هذه الصفحات'
        : 'هذه الصفحة'
      : unit === 'rub'
        ? 'هذا الربع'
        : unit === 'surah'
          ? 'هذه السورة'
          : range.to - range.from > 1
            ? 'هذه الآيات'
            : 'هذه الآية';
  return `لا تتوفّر تلاوة ${what} بصوت الشيخ ${reciter}`;
}

/**
 * The main button on a reciter's turn says what a press does, and under it
 * how long is left (`left`, once known): «إيقاف مؤقت», «بقي ٤:١٤»;
 * «متابعة» once paused. When the browser held the sound back for a tap,
 * «استمع» «إلى عبد الباسط». When his recitation will not play, the way on
 * is to skip him: «تخطَّ», and why; trying again is the button beside it,
 * unless his recording of the turn does not fit its timings (`untimed`),
 * which no retry mends.
 */
export function recitationLabels({
  status,
  untimed,
  reciter,
  left,
  next,
  end,
  unit,
  range,
}: {
  status: PlayerStatus;
  untimed: boolean;
  /** His short name. */
  reciter: string;
  left: number | null;
  next: Next;
  end: End | null;
  /** What his turn reads. */
  unit: Unit;
  range: AyahRange;
}): ButtonLabels {
  const time = left !== null ? `بقي ${clock(left)}` : '';
  const his = `تلاوة ${reciter}`;
  const named = (main: string, sub: Sized, after: string): ButtonLabels => ({
    main,
    sub,
    name: [main, sub.long, after].filter(Boolean).join('، '),
  });
  const plain = (s: string): Sized => ({ long: s, short: s });
  if (untimed || status === 'error') {
    const portion = portionLabel(next.unit, next.range);
    const after = end
      ? endNote(end)
      : `التالي: ${next.name ? `${next.name}، ` : ''}${portion}`;
    return named(
      'تخطَّ',
      untimed
        ? {
            long: untimedLabel(unit, range, reciter),
            short: 'التلاوة غير متوفّرة',
          }
        : plain('تعذّر تشغيل التلاوة'),
      after,
    );
  }
  switch (status) {
    case 'loading':
      return named('إيقاف مؤقت', plain('جارٍ التحميل…'), his);
    case 'paused':
      return named('متابعة', plain(time || 'متوقفة'), his);
    case 'blocked':
    case 'idle': {
      const sub = `إلى ${reciter}`;
      return { main: 'استمع', sub: plain(sub), name: `استمع ${sub}` };
    }
    case 'playing':
    case 'ended':
      return named('إيقاف مؤقت', plain(time), his);
  }
}

/** The countdown of a timed turn, which is also its pause. It shows the
    time where there is room for it, so its name begins with it; while the
    reciter's timings load there is no time to show yet, and it says so
    rather than «less than a second». */
export function timerLabel(paused: boolean, left: number | null) {
  const action = paused ? 'استئناف التوقيت' : 'إيقاف التوقيت مؤقتًا';
  return left === null
    ? `جارٍ تحميل التوقيت، ${action}`
    : `${clock(left)}، ${action}`;
}

/**
 * «استمع»: the word its button shows where there is room, and its name,
 * which begins with that word and says what is heard (`what`: «الصفحة ٢٤»,
 * «الآيات ٥–٩ من سورة الكهف»). Where the listening sheikh's recording does
 * not fit (`untimed`, the sentence `untimedLabel` makes), the button offers
 * another sheikh instead of a retry that cannot work.
 */
export function listenLabels(
  status: PlayerStatus,
  what: string,
  untimed: string | null,
): { text: string; name: string } {
  if (untimed) return { text: 'شيخ آخر', name: `شيخ آخر: ${untimed}` };
  switch (status) {
    case 'loading':
      return {
        text: 'جارٍ التحميل…',
        name: `جارٍ التحميل…، إيقاف الاستماع إلى ${what}`,
      };
    case 'playing':
      return {
        text: 'إيقاف مؤقت',
        name: `إيقاف مؤقت للاستماع إلى ${what}`,
      };
    case 'paused':
      return { text: 'متابعة', name: `متابعة الاستماع إلى ${what}` };
    case 'error':
      return {
        text: 'تعذّر التشغيل',
        name: `تعذّر التشغيل، أعد محاولة الاستماع إلى ${what}`,
      };
    case 'idle':
    case 'ended':
    case 'blocked':
      return { text: 'استمع', name: `استمع إلى ${what}` };
  }
}

/**
 * What a screen reader hears when the turn moves, or anything about it
 * changes: whose turn it is and what it reads, the page if the turn has
 * more than one, and what a reciter's turn needs from the room: a tap the
 * browser waits for, or «تخطَّ» when his recitation will not play.
 */
export function turnAnnouncement(t: {
  end: End | null;
  /** «دورك», «دور عمر», «يتلو الحصري». */
  phrase: string;
  unit: Unit;
  range: AyahRange;
  page: number;
  /** A seated reciter's short name and his recitation's status, on his
      turn, and whether his recording of it does not fit its timings. */
  reciter: { name: string; status: PlayerStatus; untimed: boolean } | null;
}) {
  if (t.end) return `${endTitle(t.end)}. تقبّل الله منكم.`;
  const pages = pagesOfRange(t.range);
  const where = pages.length > 1 ? `، الآن الصفحة ${arabic(t.page)}` : '';
  const said = `${t.phrase}، ${rangeLabel(t.unit, t.range)}${where}`;
  const r = t.reciter;
  if (r?.untimed)
    return `${said}. ${untimedLabel(t.unit, t.range, r.name)}: اضغط «تخطَّ» لتنتقل إلى التالي.`;
  if (r?.status === 'blocked')
    return `${said}. اضغط «استمع إلى ${r.name}» لتبدأ تلاوته.`;
  if (r?.status === 'error')
    return `${said}. تعذّر تشغيل التلاوة: اضغط «تخطَّ» لتنتقل إلى التالي، أو أعد المحاولة.`;
  return said;
}

/** A round of repeat mode read by everyone: shown for a moment above the
    buttons, and said in full. */
export function roundDone(unit: Unit, range: AyahRange) {
  return {
    text: `قرأ الجميع ${portionLabel(unit, range)}`,
    said: `قرأ الجميع ${rangeLabel(unit, range)}.`,
  };
}

/** How much a sitting has read, in the unit it counts: «قرأتم ٣ صفحات في
    هذا المجلس», or that nothing is read yet. The count follows a verb
    here, so its dual is the accusative «صفحتين». */
export function sittingNote(unit: Unit, pagesRead: number, ayatRead: number) {
  if (unit === 'page')
    return pagesRead
      ? `قرأتم ${counted(pagesRead, { one: 'صفحة واحدة', two: 'صفحتين', few: 'صفحات', many: 'صفحة' })} في هذا المجلس`
      : 'لم تُقرأ صفحة بعد';
  return ayatRead
    ? `قرأتم ${counted(ayatRead, { one: 'آية واحدة', two: 'آيتين', few: 'آيات', many: 'آية' })} في هذا المجلس`
    : 'لم تُقرأ آية بعد';
}

/**
 * The middle of the circle: where the circle is, a word and, large, a
 * number. A turn of pages shows the page open («الصفحة», ٢٤; «تكرار»
 * instead in repeat mode, as everyone reads it); a turn of ayat its surah
 * and ayat («الكهف», ٥–٩); a quarter its name and hizb («ربع الحزب», ٣);
 * a surah, «سورة» and its name.
 */
export function circleCenter(
  unit: Unit,
  range: AyahRange,
  page: number,
  repeat: boolean,
): { label: string; value: string } {
  const pageCenter = {
    label: repeat ? 'تكرار' : 'الصفحة',
    value: arabic(page),
  };
  if (unit === 'page' || range.to <= range.from) return pageCenter;
  if (unit === 'rub') {
    const n = rubOfAyah(range.from);
    if (same(range, rubRange(n)))
      return {
        label: rubLabel(n).replace(/ [٠-٩]+$/, ''),
        value: arabic(Math.ceil(n / 4)),
      };
  }
  if (unit === 'surah') {
    const s = surahOfAyah(range.from);
    if (same(range, surahRange(s)))
      return { label: 'سورة', value: surah(s).name };
  }
  const [first, last] = endsOf(range);
  const label =
    first.surah === last.surah
      ? surah(first.surah).name
      : `${surah(first.surah).name} – ${surah(last.surah).name}`;
  const value =
    first.surah === last.surah && first.ayah === last.ayah
      ? arabic(first.ayah)
      : `${arabic(first.ayah)}–${arabic(last.ayah)}`;
  return { label, value };
}

/**
 * What a seat in the circle says under its name: reading now, read (or
 * passed over, in repeat mode, by a jump made after their turn), next, or
 * what its next turn reads.
 */
export function seatStatus(seat: {
  reciter: boolean;
  active: boolean;
  /** Its place in repeat mode's round, if the circle repeats. */
  round: 'done' | 'now' | 'waiting' | 'skipped' | null;
  next: boolean;
  /** Its next turn, short, in continue mode. */
  upcoming: string;
}) {
  if (seat.active) return seat.reciter ? 'يتلو الآن' : 'يقرأ الآن';
  if (seat.round === 'done') return seat.reciter ? 'تلا' : 'قرأ';
  if (seat.round === 'skipped') return seat.reciter ? 'لم يتلُها' : 'لم يقرأها';
  if (seat.next) return 'التالي';
  return seat.upcoming;
}
