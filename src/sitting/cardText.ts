/* The close of a sitting in words: what the card says, line by line.

   One function for both the card on the screen and the picture saved from
   it, so the two can never say different things. Plain values in, plain
   strings out, tested without a browser. Nothing here is kept: the card is
   shown, may be saved as a picture by the reader, and is gone once closed
   (docs/ROADMAP.md, D2). */

import {
  arabic,
  ayatCount,
  hoursCount,
  joinNames,
  minutesCount,
  pagesCount,
} from '@/data/arabic';
import { surahTitle, verseOf } from '@/data/mushaf';
import type { Place, Sitter, Summary } from '@/halaqa/state';

export type CardText = {
  title: string;
  /** The day it closed: the Hijri date first, then the Gregorian. The Hijri
      is left out where the browser has no Umm al-Qura calendar, rather than
      showing the Gregorian twice. */
  dates: string[];
  /** From where to where; where the circle stopped, when a jump broke
      off what it read; or one gentle line when nothing was finished. */
  read: string[];
  /** «٤ صفحات · ٣٠ آية · ٢٥ دقيقة»; null when nothing was finished, since
      a card that read nothing has nothing to count. */
  amount: string | null;
  /** Who sat, under a word that agrees with how many they were; null for
      «أنت» alone, whom the card is already speaking to. */
  present: { label: string; names: string } | null;
  /** The closing supplication in its three phrases, each a line of its
      own where there is room: a supplication is said phrase by phrase. */
  supplication: string[];
  brand: string;
};

export const CARD_TITLE = 'ختام المجلس';

/* Where a line of the card may not break, whether the browser sets it or
   cardImage.ts does: a number and what it counts («الآية ١٠٥», «٢٢ آية»,
   «١٤٤٨ هـ»), a page in its brackets, a name of two or three words
   («الشيخ الحصري», «أبو أحمد»; a longer one could not fit a phone's line,
   and breaks only where «عبد», «أبو» or «بن» does not join it to the word
   after) and a separator with what it follows. At 320px «(الصفحة ٢٩٣)»
   otherwise left «٢٩٣)» alone on a line. */
const NBSP = '\u00a0';
const together = (s: string) => s.replaceAll(' ', NBSP);
const nameTogether = (name: string) =>
  name.split(' ').length <= 3
    ? together(name)
    : name.replace(/(?<=^|\s)(عبد|أبو|أم|بن|ابن|بنت) /g, `$1${NBSP}`);

/** The supplication that closes a gathering (kaffārat al-majlis). */
export const SUPPLICATION =
  'سبحانك اللهم وبحمدك، أشهد أن لا إله إلا أنت، أستغفرك وأتوب إليك';

export const BRAND = 'مجلس نور';

/** Said instead of from-and-to when the circle finished no turn. */
export const NOTHING_READ = 'لم تكتمل قراءة بعد';

/** Said instead of from-and-to when what was read is not one stretch:
    «من الفاتحة إلى الكهف» after a jump would claim every page between.
    One who read alone is spoken to as one. */
export const STOPPED_AT = 'وقفتم عند';
export const STOPPED_AT_ALONE = 'وقفتَ عند';

/* Both made once. The Hijri date is the Umm al-Qura calendar, the one most
   Arabic readers' phones and mosques keep, in Arabic-Indic digits; the
   Gregorian is in Arabic month names, and asks for the Gregorian calendar
   by name, since some Arabic locales default to the Hijri one. Both read
   the day in the device's own time zone, where the circle sat. */
const hijriFormat = new Intl.DateTimeFormat('ar-SA', {
  calendar: 'islamic-umalqura',
  numberingSystem: 'arab',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const gregorianFormat = new Intl.DateTimeFormat('ar', {
  calendar: 'gregory',
  numberingSystem: 'arab',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** «الأحد، ٧ جمادى الأولى ١٤٤٨ هـ» and «١٨ أكتوبر ٢٠٢٦». */
export function cardDates(at: number) {
  const day = new Date(at);
  const hijri =
    hijriFormat.resolvedOptions().calendar === 'islamic-umalqura'
      ? [hijriFormat.format(day)]
      : [];
  return [...hijri, gregorianFormat.format(day)].map((d) =>
    d.replace(/ هـ$/, `${NBSP}هـ`),
  );
}

/** «من سورة آل عمران، الآية ١ (الصفحة ٥٠)». */
export function placeLine(
  word: 'من' | 'إلى' | typeof STOPPED_AT | typeof STOPPED_AT_ALONE,
  place: Place,
) {
  const { surah, ayah } = verseOf(place.ayah);
  return `${word} ${surahTitle(surah)}، ${together(`الآية ${arabic(ayah)}`)} ${together(`(الصفحة ${arabic(place.page)})`)}`;
}

/** Longer than this is not a sitting's length but a halaqa left open and
    taken up again another day, which the resume card allows; the card
    then says nothing of how long rather than «١٩ ساعة». */
const LONGEST = 12 * 60 * 60_000;

/**
 * How long a sitting lasted, to the nearest minute: «أقل من دقيقة»,
 * «٢٥ دقيقة», «ساعة و٢٠ دقيقة», «ساعتان». Null when it is not known (a
 * sitting saved before its start was kept) or too long to be one sitting.
 */
export function sittingLength(ms: number | null) {
  if (ms === null || !Number.isFinite(ms) || ms < 0 || ms > LONGEST)
    return null;
  if (ms < 60_000) return 'أقل من دقيقة';
  const total = Math.round(ms / 60_000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours) return minutesCount(minutes);
  // Within «ساعة و…» each part stands without «واحدة», as speech has it.
  const h = hours === 1 ? 'ساعة' : hoursCount(hours);
  if (!minutes) return hours === 1 ? hoursCount(1) : h;
  return `${h} و${minutes === 1 ? 'دقيقة' : minutesCount(minutes)}`;
}

/** Whether the circle is only the unnamed «أنت». */
const aloneUnnamed = (members: readonly Sitter[]) =>
  members.length === 1 &&
  members[0].kind === 'person' &&
  members[0].name === 'أنت';

/**
 * Who sat: people by the names the circle knows them by, sheikhs as
 * «الشيخ الحصري». One sheikh seated twice (his teaching recording and his
 * other) was one voice in the room, and is named once. The word over them
 * agrees with how many there are, since the app counts as Arabic does:
 * «الحاضران» for two, «الحاضرون» from three, and for one, whose gender the
 * app cannot know, «في المجلس».
 */
export function presentLine(members: readonly Sitter[]) {
  if (members.length === 0 || aloneUnnamed(members)) return null;
  const names: string[] = [];
  for (const m of members) {
    const name = nameTogether(
      m.kind === 'reciter' ? `الشيخ ${m.name}` : m.name,
    );
    if (m.kind === 'reciter' && names.includes(name)) continue;
    names.push(name);
  }
  const label =
    names.length === 1
      ? 'في المجلس'
      : names.length === 2
        ? 'الحاضران'
        : 'الحاضرون';
  return { label, names: joinNames(names) };
}

/** Everything the card says, for the sitting `summary` closed at `endedAt`. */
export function cardText(summary: Summary, endedAt: number): CardText {
  const finished = summary.to !== null;
  const amount = finished
    ? [
        summary.pagesRead ? pagesCount(summary.pagesRead) : null,
        summary.ayatRead ? ayatCount(summary.ayatRead) : null,
        sittingLength(summary.durationMs),
      ]
        .filter((part) => part !== null)
        .map(together)
        .join(`${NBSP}· `)
    : null;
  return {
    title: CARD_TITLE,
    dates: cardDates(endedAt),
    read: !summary.to
      ? [NOTHING_READ]
      : summary.from
        ? [placeLine('من', summary.from), placeLine('إلى', summary.to)]
        : [
            placeLine(
              summary.members.length === 1 ? STOPPED_AT_ALONE : STOPPED_AT,
              summary.to,
            ),
          ],
    amount: amount || null,
    present: presentLine(summary.members),
    supplication: SUPPLICATION.split(/(?<=،) /),
    brand: BRAND,
  };
}
