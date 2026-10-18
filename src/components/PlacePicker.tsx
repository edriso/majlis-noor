import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { arabic, counted, digits } from '@/data/arabic';
import {
  ayatOfPage,
  firstAyahOfPage,
  JUZ_COUNT,
  juzOfAyah,
  juzOfPage,
  juzRange,
  PAGE_COUNT,
  pageOfAyah,
  surah,
  surahOfAyah,
  surahRange,
  surahs,
  type Surah,
} from '@/data/mushaf';
import { Choice } from './Choice';

/** A place chosen: its first ayah, numbered through the whole Mushaf, and
    the page that ayah is on. */
export type PlaceChoice = { ayah: number; page: number };

type By = 'surah' | 'juz' | 'page';

/** Where a surah begins: its first ayah, and the page that ayah is on.
    Eighteen surahs have their header at the foot of the page before. */
const surahStart = (n: number): PlaceChoice => {
  const ayah = surahRange(n).from;
  return { ayah, page: pageOfAyah(ayah) };
};

/** Where a juz truly begins. Four of them (4, 7, 11 and 26) begin part-way
    down a page, at the ayah, not at the top of the page it is on. */
const juzStart = (j: number): PlaceChoice => {
  const ayah = juzRange(j).from;
  return { ayah, page: pageOfAyah(ayah) };
};

/**
 * Arabic as a reader types it, made comparable with a surah's name as the
 * Mushaf spells it: no vowel marks or tatweel, every alif with a hamza as a
 * bare alif, a lone hamza dropped, and the letters a keyboard swaps (ة and
 * ه, ى and ي) made one. So «النبأ», «النبإ» and «النبا» all find النبإ, and
 * «ابراهيم» finds إبراهيم however it is spelt. A leading «سورة» is left
 * out, since every name would match it.
 */
export function searchable(text: string) {
  return text
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ء/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^سوره(\s+|$)/, '');
}

const names = surahs.map((s) => searchable(s.name));

/**
 * The surahs a search finds. Digits, Arabic or Western, find a surah by its
 * number: that one first, then those whose numbers begin with them (١ finds
 * al-Fatihah, then 10 to 19 and 100 to 114). Anything else finds the names
 * that contain it.
 */
export function findSurahs(query: string): Surah[] {
  const number = digits(query);
  if (number) {
    const exact = surahs.filter((s) => String(s.n) === number);
    const rest = surahs.filter(
      (s) => String(s.n) !== number && String(s.n).startsWith(number),
    );
    return [...exact, ...rest];
  }
  const words = searchable(query);
  if (!words) return surahs;
  return surahs.filter((_, i) => names[i].includes(words));
}

const surahsCount = (n: number) =>
  counted(n, { one: 'سورة واحدة', two: 'سورتان', few: 'سور', many: 'سورة' });

/**
 * Where to read: a surah, a juz or a page. The one chooser the start
 * screen and the reading screen's jump share. A choice is reported at once
 * as the place's first ayah and its page (`PlaceChoice`), and what to do
 * with it, start there or jump there, is the caller's.
 *
 * - سورة: a search field over a list of the 114. It filters by name, as a
 *   reader spells it (`searchable`), or by number; Enter takes the first
 *   surah found, and the arrow keys walk the list.
 * - جزء: the thirty juz as a grid of buttons.
 * - صفحة: a page number, in either digits, with the surahs and juz it holds
 *   shown as it is typed, and «انتقل». Not `type="number"`, which throws
 *   away ٢٤.
 *
 * The current surah and juz say so with `aria-pressed`, and the list opens
 * scrolled to the current surah.
 */
export function PlacePicker({
  current,
  onChoose,
  initialBy = 'surah',
}: {
  /** Where the reader is now, marked in the lists. */
  current: PlaceChoice;
  onChoose: (place: PlaceChoice) => void;
  /** The tab it opens on. */
  initialBy?: By;
}) {
  const [by, setBy] = useState<By>(initialBy);
  return (
    <div className="place-picker">
      <Choice<By>
        legend="اختر حسب"
        hideLegend
        value={by}
        onChange={setBy}
        options={[
          { value: 'surah', label: 'سورة' },
          { value: 'juz', label: 'جزء' },
          { value: 'page', label: 'صفحة' },
        ]}
      />
      {by === 'surah' ? (
        <SurahSearch current={current} onChoose={onChoose} />
      ) : by === 'juz' ? (
        <JuzGrid current={current} onChoose={onChoose} />
      ) : (
        <PageField current={current} onChoose={onChoose} />
      )}
    </div>
  );
}

type Part = { current: PlaceChoice; onChoose: (place: PlaceChoice) => void };

/** Up and down between a list's buttons, and Home and End, so a list of a
    hundred and fourteen is not a hundred and fourteen presses of Tab. */
const STEPS: Partial<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };
const EDGES: Partial<Record<string, number>> = { Home: 0, End: -1 };

function walk(
  e: KeyboardEvent<HTMLButtonElement>,
  list: HTMLElement | null,
  /** Up from the first button: where focus goes instead of nowhere. */
  above?: HTMLElement | null,
) {
  const step = STEPS[e.key];
  const edge = EDGES[e.key];
  if (step === undefined && edge === undefined) return;
  const buttons = [...(list?.querySelectorAll('button') ?? [])];
  const at = buttons.indexOf(e.currentTarget);
  if (step === -1 && at === 0 && above) {
    e.preventDefault();
    above.focus();
    return;
  }
  const next =
    edge !== undefined
      ? buttons.at(edge)
      : buttons[Math.min(buttons.length - 1, Math.max(0, at + (step ?? 0)))];
  if (!next) return;
  e.preventDefault();
  next.focus();
}

function SurahSearch({ current, onChoose }: Part) {
  const id = useId();
  const [query, setQuery] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const found = findSurahs(query);
  const here = surahOfAyah(current.ayah);

  // Opened scrolled to where the reader is, which is otherwise as far down
  // as an-Nas, in the list's own scroll and nowhere else.
  useEffect(() => {
    const box = list.current;
    const item = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!box || !item) return;
    const offset =
      item.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop += offset - (box.clientHeight - item.offsetHeight) / 2;
  }, []);

  return (
    <div className="place-surahs">
      {/* The same words the empty field shows, so the field is called what
          a voice-control user sees in it. */}
      <label className="visually-hidden" htmlFor={`${id}-search`}>
        اسم السورة أو رقمها
      </label>
      <input
        ref={search}
        id={`${id}-search`}
        className="input place-search"
        type="search"
        enterKeyHint="go"
        autoComplete="off"
        placeholder="اسم السورة أو رقمها"
        aria-describedby={`${id}-count`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && found.length) {
            e.preventDefault();
            onChoose(surahStart(found[0].n));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            list.current?.querySelector('button')?.focus();
          }
        }}
      />
      <p id={`${id}-count`} className="place-count" aria-live="polite">
        {found.length ? surahsCount(found.length) : 'لا سورة بهذا الاسم أو الرقم'}
      </p>
      <ul className="place-list" ref={list}>
        {found.map((s) => {
          const start = surahStart(s.n);
          return (
            <li key={s.n}>
              <button
                type="button"
                className="place-item"
                aria-pressed={s.n === here}
                aria-label={`${arabic(s.n)}. ${s.name} — الصفحة ${arabic(start.page)}`}
                onClick={() => onChoose(start)}
                // Up from the first surah goes back to the search, as down
                // from the search came into the list.
                onKeyDown={(e) => walk(e, list.current, search.current)}
              >
                <span className="place-item-number">{arabic(s.n)}.</span>
                <span className="place-item-name">{s.name}</span>
                <span className="place-item-page">
                  الصفحة {arabic(start.page)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function JuzGrid({ current, onChoose }: Part) {
  const here = juzOfAyah(current.ayah);
  return (
    <ul className="place-juz" aria-label="الأجزاء">
      {Array.from({ length: JUZ_COUNT }, (_, i) => i + 1).map((j) => (
        <li key={j}>
          <button
            type="button"
            className="place-juz-button"
            aria-pressed={j === here}
            aria-label={`الجزء ${arabic(j)}`}
            onClick={() => onChoose(juzStart(j))}
          >
            <span className="place-juz-word">الجزء</span>
            <span className="place-juz-number">{arabic(j)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** «سورة البقرة · الجزء ١», or every surah a page holds when it holds more
    than one: «سورة الإخلاص · سورة الفلق · سورة الناس · الجزء ٣٠». */
function pageSummary(p: number) {
  const { from, to } = ayatOfPage(p);
  const first = surahOfAyah(from);
  const last = surahOfAyah(to - 1);
  const held = Array.from({ length: last - first + 1 }, (_, i) =>
    surah(first + i),
  );
  return [
    ...held.map((s) => `سورة ${s.name}`),
    `الجزء ${arabic(juzOfPage(p))}`,
  ].join(' · ');
}

function PageField({ current, onChoose }: Part) {
  const id = useId();
  const [draft, setDraft] = useState(arabic(current.page));
  const typed = Number(digits(draft));
  const valid = Number.isInteger(typed) && typed >= 1 && typed <= PAGE_COUNT;
  return (
    <form
      className="place-page"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onChoose({ ayah: firstAyahOfPage(typed), page: typed });
      }}
    >
      <label className="field-label" htmlFor={`${id}-page`}>
        رقم الصفحة
      </label>
      <div className="place-page-row">
        <input
          id={`${id}-page`}
          className="input place-page-input"
          type="text"
          inputMode="numeric"
          enterKeyHint="go"
          autoComplete="off"
          aria-describedby={`${id}-where`}
          aria-invalid={!valid || undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="submit"
          className="button button-primary"
          aria-disabled={!valid || undefined}
        >
          انتقل
        </button>
      </div>
      <output
        id={`${id}-where`}
        className="place-page-where"
        htmlFor={`${id}-page`}
      >
        {valid
          ? pageSummary(typed)
          : `اكتب رقمًا من ١ إلى ${arabic(PAGE_COUNT)}`}
      </output>
    </form>
  );
}
