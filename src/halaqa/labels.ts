import { arabic } from '@/data/arabic';
import {
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
