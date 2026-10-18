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

/** Ayat, as a label: «آية واحدة», «آيتان», «٣ آيات», «١١ آية». */
export const ayatCount = (n: number) =>
  counted(n, { one: 'آية واحدة', two: 'آيتان', few: 'آيات', many: 'آية' });

/** Seats in the circle, as a label. */
export const seatsCount = (n: number) =>
  counted(n, { one: 'مقعد واحد', two: 'مقعدان', few: 'مقاعد', many: 'مقعدًا' });

/** Readers, as a label. */
export const readersCount = (n: number) =>
  counted(n, { one: 'قارئ واحد', two: 'قارئان', few: 'قرّاء', many: 'قارئًا' });

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

/** A duration in words for a screen reader and for labels: «دقيقة و٢٠ ثانية». */
export function durationWords(ms: number) {
  const total = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const m = minutes
    ? counted(minutes, {
        one: 'دقيقة',
        two: 'دقيقتان',
        few: 'دقائق',
        many: 'دقيقة',
      })
    : '';
  const s = seconds
    ? counted(seconds, {
        one: 'ثانية',
        two: 'ثانيتان',
        few: 'ثوانٍ',
        many: 'ثانية',
      })
    : '';
  if (m && s) return `${m} و${s}`;
  return m || s || 'أقل من ثانية';
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
