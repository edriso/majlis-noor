/* Arabic-Indic digits, and the agreement a counted noun takes. Everything the
   reader sees that carries a number goes through here, never `${n} صفحات`
   by hand: the noun after a number changes with the number. */

const numberFormat = new Intl.NumberFormat('ar-EG', { useGrouping: false });
export const arabic = (n: number) => numberFormat.format(n);

/**
 * The digits of a typed number, whichever numerals the keyboard produced. An
 * Arabic layout types ٢٤ and a Latin one 24; both mean the same page.
 */
export const digits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^0-9]/g, '');

export type CountedForms = {
  /** One carries its own word instead of a numeral: «صفحة واحدة». */
  one: string;
  /** The dual carries the two itself: «صفحتان». */
  two: string;
  /** Three to ten take the plural: «٣ صفحات». */
  few: string;
  /** Eleven to ninety-nine take the singular: «١١ صفحة». */
  many: string;
};

/**
 * A number with its counted noun. The band is read off `n % 100`, because
 * the noun follows the number beside it and not the whole figure: ١٠٣ صفحات
 * takes the plural of its three, and ١٢٠ صفحة the singular of its twenty.
 */
export function counted(n: number, forms: CountedForms) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const unit = n % 100;
  if (unit >= 3 && unit <= 10) return `${arabic(n)} ${forms.few}`;
  return `${arabic(n)} ${forms.many}`;
}

/** Pages, as a label with nothing governing it, so the dual is مرفوع. */
export const pagesCount = (n: number) =>
  counted(n, { one: 'صفحة واحدة', two: 'صفحتان', few: 'صفحات', many: 'صفحة' });

/** Surahs, as a label: «سورة واحدة», «سورتان», «٣ سور», «١١ سورة». */
export const surahsCount = (n: number) =>
  counted(n, { one: 'سورة واحدة', two: 'سورتان', few: 'سور', many: 'سورة' });

/** Ayat, as a label: «آية واحدة», «آيتان», «٣ آيات», «١١ آية». */
export const ayatCount = (n: number) =>
  counted(n, { one: 'آية واحدة', two: 'آيتان', few: 'آيات', many: 'آية' });

/** Minutes, as a label: «دقيقة واحدة», «دقيقتان», «٣ دقائق», «١١ دقيقة». */
export const minutesCount = (n: number) =>
  counted(n, {
    one: 'دقيقة واحدة',
    two: 'دقيقتان',
    few: 'دقائق',
    many: 'دقيقة',
  });

/** Hours, as a label: «ساعة واحدة», «ساعتان», «٣ ساعات», «١١ ساعة». */
export const hoursCount = (n: number) =>
  counted(n, { one: 'ساعة واحدة', two: 'ساعتان', few: 'ساعات', many: 'ساعة' });

/** Times, after a verb, «كرّر ٣ مرات», so the dual is the accusative
    «مرتين». */
export const timesCount = (n: number) =>
  counted(n, { one: 'مرة واحدة', two: 'مرتين', few: 'مرات', many: 'مرة' });

/** Seats in the circle, as a label. */
export const seatsCount = (n: number) =>
  counted(n, { one: 'مقعد واحد', two: 'مقعدان', few: 'مقاعد', many: 'مقعدًا' });

/**
 * A duration as «د:ثث», in Arabic-Indic digits. Guarded at both ends because
 * it renders every second off a number the clock computes: a negative or NaN
 * reads as zero, which is what a clock with nothing left should say.
 */
export function clock(ms: number) {
  const total = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 1000)) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = arabic(total % 60).padStart(2, '٠');
  return `${arabic(minutes)}:${seconds}`;
}

/** Ordinals, for the default reader names: «القارئ الثاني». */
const ordinals = [
  'الأول',
  'الثاني',
  'الثالث',
  'الرابع',
  'الخامس',
  'السادس',
  'السابع',
  'الثامن',
  'التاسع',
  'العاشر',
];
export const ordinal = (n: number) => ordinals[n - 1] ?? arabic(n);

/**
 * A name as it is said after a preposition or a noun it belongs to: «أبو»
 * is one of the five nouns, which show their case in their last letter,
 * so «أبو بكر الشاطري» is «استمع إلى أبي بكر الشاطري» and «أبو أحمد» is
 * «دور أبي أحمد». Only a whole word «أبو» before another word changes
 * (with the «و» of a list on it, «وأبو»); every other name reads the
 * same in any case.
 */
export const genitive = (name: string) =>
  name.replace(/(^|\s)(و?)أبو(?=\s)/g, '$1$2أبي');

/** «أنت وفاطمة», «أبو أحمد وسارة والشيخ الحصري»: a list of names as Arabic
    says it, every one after the first joined by «و», not by commas. */
export function joinNames(names: readonly string[]) {
  return names.join(' و');
}
