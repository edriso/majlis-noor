/* The reciters whose pace a turn can be timed by, whose recording of a
   page can be played, and who can take a seat in the circle. Each is a
   Quran.com recitation (`qdc`), because that source carries per-ayah
   timestamps for whole surah files, which is what lets a page be measured
   and played on its own. `npm run build:timings` turns them into
   src/data/timings/<id>.json.

   Ordered from the most deliberate to the swiftest, by `secondsPerPage`:
   a halaqa reading at a teaching pace wants the top of the list. That
   number is the reciter's average page in those timings, written here so
   the list can show it and band it without loading ten files first;
   timings.test.ts checks it against the files.

   `photo` is a file in public/reciters, cropped from Wikimedia Commons; NOTICE
   names the source and licence of each. A reciter with no freely licensed
   photo shows his initial instead, which is why the field is optional. */

export type Reciter = {
  id: string;
  /** Quran.com recitation id. */
  qdc: number;
  name: string;
  /** Where there is only room for one name. */
  short: string;
  /** Style of the recording, shown under the name. */
  style: string;
  /** His average Mushaf page, in seconds. */
  secondsPerPage: number;
  photo?: string;
};

export const reciters: readonly Reciter[] = [
  {
    id: 'husary-muallim',
    qdc: 12,
    // The teaching recording, which leaves a silence after each ayah for
    // the learner to repeat it, is named apart from his murattal
    // everywhere, in the list as in a seat.
    name: 'الحصري (المعلّم)',
    short: 'الحصري المعلّم',
    style: 'المصحف المعلّم',
    secondsPerPage: 284,
    photo: 'husary.webp',
  },
  {
    id: 'husary',
    qdc: 6,
    name: 'محمود خليل الحصري',
    short: 'الحصري',
    style: 'مرتّل',
    secondsPerPage: 254,
    photo: 'husary.webp',
  },
  {
    id: 'abdulbasit',
    qdc: 2,
    name: 'عبد الباسط عبد الصمد',
    short: 'عبد الباسط',
    style: 'مرتّل',
    secondsPerPage: 183,
    photo: 'abdulbasit.webp',
  },
  {
    id: 'alafasy',
    qdc: 7,
    name: 'مشاري راشد العفاسي',
    short: 'العفاسي',
    style: 'مرتّل',
    secondsPerPage: 176,
    photo: 'alafasy.webp',
  },
  {
    id: 'minshawi',
    qdc: 9,
    name: 'محمد صديق المنشاوي',
    short: 'المنشاوي',
    style: 'مرتّل',
    secondsPerPage: 172,
    photo: 'minshawi.webp',
  },
  {
    id: 'dosari',
    qdc: 97,
    name: 'ياسر الدوسري',
    short: 'الدوسري',
    style: 'مرتّل',
    secondsPerPage: 154,
    photo: 'dosari.webp',
  },
  {
    id: 'shatri',
    qdc: 4,
    name: 'أبو بكر الشاطري',
    short: 'الشاطري',
    style: 'مرتّل',
    secondsPerPage: 154,
  },
  {
    id: 'rifai',
    qdc: 5,
    name: 'هاني الرفاعي',
    short: 'الرفاعي',
    style: 'مرتّل',
    secondsPerPage: 151,
  },
  {
    id: 'sudais',
    qdc: 3,
    name: 'عبد الرحمن السديس',
    short: 'السديس',
    style: 'مرتّل',
    secondsPerPage: 125,
    photo: 'sudais.webp',
  },
  {
    id: 'shuraim',
    qdc: 10,
    name: 'سعود الشريم',
    short: 'الشريم',
    style: 'مرتّل',
    secondsPerPage: 108,
    photo: 'shuraim.webp',
  },
];

export const defaultReciter = 'husary';

export function reciterById(id: string): Reciter {
  return (
    reciters.find((r) => r.id === id) ??
    reciters.find((r) => r.id === defaultReciter)!
  );
}

/** How deliberately a reciter recites, in the words a halaqa uses, from his
    average page: the band the list groups him under. */
export function paceLabel(secondsPerPage: number) {
  if (secondsPerPage >= 240) return 'متأنٍّ جدًّا';
  if (secondsPerPage >= 165) return 'متأنٍّ';
  if (secondsPerPage >= 140) return 'معتدل';
  return 'سريع';
}
