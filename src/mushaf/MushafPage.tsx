import { arabic } from '@/data/arabic';
import {
  juzOfPage,
  rubLabel,
  surah,
  surahOfPage,
  verseOf,
  type AyahRange,
  type Line,
} from '@/data/mushaf';
import { loadPageFont, pageFontFamily } from './fonts';
import { usePage } from './usePage';
import { ayatOfLine, entryTexts, pageWords, type GlyphWord } from './words';
import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

/** The basmala as al-Fatihah's first four words are drawn on page 1, so it
    is the Mushaf's own basmala wherever a surah opens. `mushaf.test.ts`
    checks these against page 1. */
export const BASMALA_GLYPHS = ['ﱁ', 'ﱂ', 'ﱃ', 'ﱄ'];
const BASMALA_TEXT = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ';

export const FONT_NOTE = 'تعذّر تحميل خطّ الصفحة، والنص معروض بخطّ بديل';
export const PAGE_MISSING =
  'هذه الصفحة غير محفوظة على جهازك بعد، وتحتاج إلى اتصال';
const RETRY = 'أعد المحاولة';
const RETRYING = 'جارٍ المحاولة…';

/** What is being recited: an ayah, by its number through the whole Mushaf,
    and the word of it being heard, or null to mark the ayah whole. */
export type Recited = { ayah: number; word: number | null };

/** The name of an ayah's end-of-ayah marker, which plays it. */
export const ayahButtonLabel = (ayah: number) => {
  const v = verseOf(ayah);
  return `الآية ${arabic(v.ayah)} من سورة ${surah(v.surah).name} — استمع إليها`;
};

export type MushafPageProps = {
  page: number;
  prefetch?: readonly number[];
  /** The turn's ayat, each word underlined. */
  turn?: AyahRange | null;
  /** The ayah, or the word, being recited, which lies on a wash. */
  recited?: Recited | null;
  /** The ayah chosen with a tap, outlined. */
  selected?: number | null;
  /** A tap on a word, or a press of an ayah's marker, gives its ayah and
      which word of it (null for the marker). Given, each marker is a
      button, so the keyboard and screen readers reach every ayah too.
      Keep it the same function from one drawing to the next, or the page
      is drawn again for nothing. */
  onAyahTap?: (ayah: number, word: number | null) => void;
};

/* How far a pointer may move between pressing and lifting and still be a
   tap. A swipe sideways turns the page, so it is given less room that way;
   a vertical drag scrolls the stage, which the browser takes over anyway. */
const TAP_SLOP_X = 6;
const TAP_SLOP_Y = 10;

/**
 * One page of the Madani Mushaf, laid out on its fifteen lines (eight on the
 * opening two pages) exactly as printed: the surah name at the top right,
 * the juz at the top left, the page number at the foot.
 *
 * Every line is justified edge to edge, as the print is, and every line is
 * the same height, so a surah header or a basmala takes one line's room and
 * the page never reflows. The size of everything comes from the page's own
 * width (`cqi`), which is what lets one component fill a phone and a desktop.
 *
 * When the page's font cannot load, its text is drawn in a Quran font on the
 * same lines, each line made smaller if it would not fit, and a note at the
 * foot says so and offers to try again. When its data cannot load, the page
 * says that instead of a skeleton that never ends.
 *
 * Marks (the turn, the recitation, a chosen ayah) are drawn around and
 * behind the glyphs (see marks.css) and never move one. The word being
 * recited changes a few times a second, so the page is drawn again only
 * when a prop changes by value, and of its lines only those whose marks
 * changed: one or two.
 */
export const MushafPage = memo(function MushafPage({
  page,
  prefetch,
  turn,
  recited,
  selected,
  onAyahTap,
}: MushafPageProps) {
  const state = usePage(page, prefetch);
  const opening = page <= 2;
  const name = surahOfPage(page).name;
  const juz = juzOfPage(page);
  const ready = state.status === 'ready' ? state : null;
  const missing = state.status === 'error' ? state : null;
  const fallback = ready?.font === 'text';
  const sajdah = ready?.page.sajdah?.length;
  const linesRef = useRef<HTMLDivElement>(null);
  const noteId = useId();
  useFittedLines(linesRef, fallback ? ready.page : null);
  const drawn = ready?.page;
  const words = useMemo(() => (drawn ? pageWords(drawn) : []), [drawn]);
  const lineAyat = useMemo(() => words.map(ayatOfLine), [words]);
  const tap = useTap(onAyahTap);
  useCopyText();

  return (
    <article
      className="mushaf-page"
      data-opening={opening || undefined}
      data-fallback={fallback || undefined}
      aria-label={`الصفحة ${arabic(page)}، سورة ${name}، الجزء ${arabic(juz)}`}
      aria-busy={state.status === 'loading'}
      lang="ar"
    >
      <header className="mushaf-running-head" aria-hidden="true">
        <span>سورة {name}</span>
        {sajdah ? <span className="mushaf-sajdah">۩ سجدة</span> : null}
        <span>
          الجزء {arabic(juz)}
          {ready ? (
            <span className="mushaf-rub">
              {' '}
              · {rubLabel(ready.page.rubs[0])}
            </span>
          ) : null}
        </span>
      </header>

      <div className="mushaf-frame">
        {ready ? (
          // Keyed by the font, so a page that gets its font on a retry is
          // drawn afresh, the basmala in its glyphs too.
          <div
            key={ready.font}
            ref={linesRef}
            className="mushaf-lines"
            {...tap}
            data-font={ready.font}
            style={
              ready.font === 'glyphs'
                ? { fontFamily: `${pageFontFamily(page)}, var(--font-quran)` }
                : undefined
            }
          >
            {ready.page.lines.map((line, i) => {
              // Each line hears only of the marks on its own ayat, so a
              // mark that moves draws again only the lines it leaves and
              // reaches.
              const on = (ayah: number | null | undefined) =>
                ayah != null && lineAyat[i].includes(ayah);
              const reciting = on(recited?.ayah);
              return (
                <MushafLine
                  key={i}
                  line={line}
                  words={words[i]}
                  turnFrom={turn?.from ?? 0}
                  turnTo={turn?.to ?? 0}
                  reciteAyah={reciting ? recited!.ayah : null}
                  reciteWord={reciting ? recited!.word : null}
                  selected={on(selected) ? selected! : null}
                  buttons={!!onAyahTap}
                />
              );
            })}
            {fallback ? <Probes lines={ready.page.lines} /> : null}
          </div>
        ) : missing ? (
          <div className="mushaf-missing">
            {/* Said by the status below, so a screen reader hears it once. */}
            <p aria-hidden="true">{PAGE_MISSING}</p>
            <PageRetry retrying={missing.retrying} onClick={missing.retry} />
          </div>
        ) : (
          <div className="mushaf-lines mushaf-skeleton" aria-hidden="true">
            {Array.from({ length: opening ? 8 : 15 }, (_, i) => (
              <div key={i} className="mushaf-line">
                <span className="skeleton-bar" />
              </div>
            ))}
          </div>
        )}
      </div>

      {fallback ? (
        // In the folio's place: the page number is in the bar above, and
        // the note needs the room more.
        <div className="mushaf-note">
          <p id={noteId}>{FONT_NOTE}</p>
          <PageRetry
            retrying={ready.retrying}
            onClick={ready.retryFont}
            describedBy={noteId}
          />
        </div>
      ) : (
        <footer className="mushaf-folio" aria-hidden="true">
          <span>{arabic(page)}</span>
        </footer>
      )}

      {/* Polite, and not a status: the reading screen's one status is whose
          turn it is. Empty while a retry is under way, so that each failure
          is said again. */}
      <p className="visually-hidden" aria-live="polite" aria-atomic="true">
        {missing && !missing.retrying ? PAGE_MISSING : ''}
      </p>

      {ready && sajdah ? (
        <p className="visually-hidden">في هذه الصفحة سجدة تلاوة.</p>
      ) : null}
    </article>
  );
}, sameProps);

/** Whether two sets of props draw the same page: ranges and marks by value,
    since a caller works them out afresh each time it is drawn. */
function sameProps(a: MushafPageProps, b: MushafPageProps) {
  return (
    a.page === b.page &&
    a.prefetch === b.prefetch &&
    (a.turn?.from ?? 0) === (b.turn?.from ?? 0) &&
    (a.turn?.to ?? 0) === (b.turn?.to ?? 0) &&
    (a.recited?.ayah ?? null) === (b.recited?.ayah ?? null) &&
    (a.recited?.word ?? null) === (b.recited?.word ?? null) &&
    (a.selected ?? null) === (b.selected ?? null) &&
    a.onAyahTap === b.onAyahTap
  );
}

/**
 * A tap on a word, or a press of a marker, told to `onAyahTap`, from one
 * handler on the lines rather than one on every word. The lines are not a
 * control, only where the words' clicks meet: the keyboard's way in is the
 * markers, which are buttons, and their clicks come here too.
 *
 * A finger that moved is a swipe, or the start of one, and is not a tap:
 * the click a pointer ends with is measured against where it pressed. A
 * click that leaves words selected (a double-click, a short drag) is a
 * reader choosing words to copy, and is not a tap either. A click from the
 * keyboard, or from a screen reader, has no press before it and always
 * counts.
 *
 * A mouse drawn across the words selects them, as it does any text, so it
 * does not turn the page too: the stage (MushafView) never hears the end
 * of that stroke. A finger selects with a long press, which the browser
 * takes over, and still turns the page with a stroke.
 *
 * The handlers are props of the lines, so they are there from the moment
 * the lines are, a page drawn afresh for its font included.
 */
function useTap(onAyahTap: MushafPageProps['onAyahTap']) {
  const pressed = useRef<{ x: number; y: number } | null>(null);
  if (!onAyahTap) return undefined;
  return {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      pressed.current = e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && selecting(e.currentTarget))
        e.stopPropagation();
    },
    onClick: (e: MouseEvent<HTMLDivElement>) => {
      const from = pressed.current;
      pressed.current = null;
      const target = (e.target as Element).closest<HTMLElement>('[data-ayah]');
      if (!target || !e.currentTarget.contains(target)) return;
      if (
        e.detail > 0 &&
        ((from &&
          (Math.abs(e.clientX - from.x) > TAP_SLOP_X ||
            Math.abs(e.clientY - from.y) > TAP_SLOP_Y)) ||
          selecting(e.currentTarget))
      )
        return;
      const { ayah, word } = target.dataset;
      onAyahTap(Number(ayah), word ? Number(word) : null);
    },
  };
}

/** Whether some of a page's lines are selected. */
function selecting(lines: Node) {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return false;
  for (let i = 0; i < selection.rangeCount; i++)
    if (selection.getRangeAt(i).intersectsNode(lines)) return true;
  return false;
}

/** The words on a page drawn in its glyphs, each a span (a marker a
    button), in reading order, the right-hand page's first in a spread. */
const GLYPH_WORDS = '.mushaf-lines[data-font="glyphs"] .mushaf-words > *';

/** Whether a range takes in any of a glyph's text, not only touches it:
    a drag that ends at the edge of a word leaves that word out. */
function takesIn(range: Range, word: Element) {
  // A marker's glyph is in a span of its own, inside the button.
  const text = (word.firstElementChild ?? word).firstChild;
  if (!text) return false;
  const own = document.createRange();
  own.selectNodeContents(text);
  return (
    range.compareBoundaryPoints(Range.END_TO_START, own) < 0 &&
    range.compareBoundaryPoints(Range.START_TO_END, own) > 0
  );
}

/**
 * The Uthmani text of the words a selection takes in, on every page drawn
 * in its glyphs, in reading order and joined by spaces, a word partly
 * selected given whole; an ayah's marker gives its number as the text
 * writes it, ﴿١٤﴾. Null when it takes in no word, so whatever else is
 * selected is copied as it is.
 *
 * Each word's text is its line's (`entryTexts`), read from the line's
 * hidden text, so a selection over the two pages of a spread needs only
 * the page, not either page's data.
 */
export function selectedText(selection: Selection): string | null {
  if (selection.isCollapsed || selection.rangeCount === 0) return null;
  const ranges = Array.from({ length: selection.rangeCount }, (_, i) =>
    selection.getRangeAt(i),
  );
  const lines = new Map<Element, string[]>();
  const picked: string[] = [];
  for (const word of document.querySelectorAll(GLYPH_WORDS)) {
    if (!ranges.some((range) => takesIn(range, word))) continue;
    const line = word.closest('.mushaf-line');
    if (!line) continue;
    let texts = lines.get(line);
    if (!texts) {
      texts = entryTexts(line.querySelector('.mushaf-text')?.textContent ?? '');
      lines.set(line, texts);
    }
    const text = texts[[...word.parentElement!.children].indexOf(word)];
    if (text) picked.push(text);
  }
  return picked.length ? picked.join(' ') : null;
}

/**
 * Copying words selected on the page gives their Uthmani text. Left to
 * itself the browser copies what the page is made of: glyph codes, which
 * are private-use code points and paste as «مي» or as boxes.
 *
 * Heard on the whole document, since a selection may start outside the
 * page, or be all of it; each page drawn listens, and whichever hears the
 * copy first answers for every page.
 */
function useCopyText() {
  useEffect(() => {
    const copy = (e: ClipboardEvent) => {
      if (e.defaultPrevented || !e.clipboardData) return;
      const selection = document.getSelection();
      const text = selection && selectedText(selection);
      if (!text) return;
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    };
    document.addEventListener('copy', copy);
    return () => document.removeEventListener('copy', copy);
  }, []);
}

function PageRetry({
  retrying,
  onClick,
  describedBy,
}: {
  retrying: boolean;
  onClick: () => void;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      className="mushaf-retry"
      onClick={onClick}
      aria-disabled={retrying || undefined}
      aria-describedby={describedBy}
    >
      {retrying ? RETRYING : RETRY}
    </button>
  );
}

/**
 * Makes each line of fallback text that is wider than the page smaller,
 * just enough to fit, so the whole line shows on its own row. A line that
 * fits keeps the normal size: nothing is ever made larger, and nothing is
 * spaced out letter by letter, which Arabic does not allow. The scale is
 * the line's `--fit`, read by mushaf.css.
 *
 * A line's natural width is read from its probe, the same text unfitted,
 * never from the line itself: once fitted, a line measures its fitted
 * width, and learning its natural one again would mean clearing `--fit`
 * and laying the page out once a line. The probe never changes when a
 * line is fitted, and changes size when a font for its letters comes in,
 * which is the moment to measure again.
 */
export function fitLines(
  lines: readonly HTMLElement[],
  probes: readonly HTMLElement[],
) {
  // Every width is read before any line is changed, so the page is laid
  // out once rather than once a line.
  const sizes = lines.map((line, i) => ({
    natural: probes[i]?.getBoundingClientRect().width ?? 0,
    room: line.getBoundingClientRect().width,
  }));
  sizes.forEach(({ natural, room }, i) => {
    if (room > 0 && natural > room)
      // A hair under the exact ratio, for rounding, which the justified
      // spacing takes up.
      lines[i].style.setProperty('--fit', ((room / natural) * 0.99).toFixed(4));
    else lines[i].style.removeProperty('--fit');
  });
}

/** Fits the fallback lines (`fitLines`) when they are drawn, whenever the
    page changes size, and again whenever a font they use comes in: until
    then they are drawn, and measured, in another.

    A font's arrival is seen through the probes, whose width changes when
    it does. The font set's own events come too early: when `loadingdone`
    fires, and a frame after it, the text can still be laid out in the font
    being replaced. */
function useFittedLines(
  box: RefObject<HTMLDivElement | null>,
  content: unknown,
) {
  useLayoutEffect(() => {
    const lines = box.current;
    if (!content || !lines) return;
    const probes = [...lines.querySelectorAll<HTMLElement>(PROBE)];
    const fit = () =>
      fitLines(
        [...lines.querySelectorAll<HTMLElement>('.mushaf-text')],
        probes,
      );
    fit();
    // jsdom has none; a browser without one still gets the first fit.
    if (typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(fit);
    resize.observe(lines);
    for (const probe of probes) resize.observe(probe);
    return () => resize.disconnect();
  }, [box, content]);
}

const PROBE = '.mushaf-probes > span';

/** Each line's text again, unseen and unfitted, at its natural width,
    which changes when a font for any of its letters comes in. */
function Probes({ lines }: { lines: readonly Line[] }) {
  return (
    <div className="mushaf-probes" aria-hidden="true">
      {lines.map((line, i) =>
        line.t === 'text' ? <span key={i}>{line.x}</span> : null,
      )}
    </div>
  );
}

/**
 * One line: its glyphs, each carrying its ayah and word and the marks on
 * them, and its text. Its props are plain values, so it is drawn again only
 * when a mark on it changes.
 */
const MushafLine = memo(function MushafLine({
  line,
  words,
  turnFrom,
  turnTo,
  reciteAyah,
  reciteWord,
  selected,
  buttons,
}: {
  line: Line;
  words: readonly GlyphWord[];
  /** The turn's ayat, `turnTo` not included. */
  turnFrom: number;
  turnTo: number;
  /** The ayah recited, if it is on this line, and its word, or null for
      the whole ayah. */
  reciteAyah: number | null;
  reciteWord: number | null;
  selected: number | null;
  /** Whether each marker is a button. */
  buttons: boolean;
}) {
  if (line.t === 'surah') return <SurahHeader n={line.s} />;
  if (line.t === 'basmala') return <Basmala />;
  return (
    <div className="mushaf-line">
      {/* The glyphs are private-use code points that mean nothing to a screen
          reader or to the font fallback; this is the same line as text.
          Before the glyphs, so a screen reader reads a line and then the
          buttons of the ayat it ends; out of the flow in glyph mode and
          alone in it in text mode, so where it sits moves nothing. */}
      <span className="mushaf-text">{line.x}</span>
      <span className="mushaf-words">
        {line.w.map(([code], i) => {
          const { ayah, word } = words[i];
          const marks = {
            'data-ayah': ayah,
            'data-word': word ?? undefined,
            'data-turn': (ayah >= turnFrom && ayah < turnTo) || undefined,
            'data-recite':
              (ayah === reciteAyah &&
                (reciteWord === null || reciteWord === word)) ||
              undefined,
            'data-selected': ayah === selected || undefined,
          };
          // The marker lays out exactly as the glyph alone did (marks.css):
          // a button only by what it does and how it is named.
          return word === null && buttons ? (
            <button
              key={i}
              type="button"
              {...marks}
              aria-label={ayahButtonLabel(ayah)}
            >
              {/* A code point that means nothing as text: what the button
                  shows is the ayah's number, which its name says. */}
              <span aria-hidden="true">{code}</span>
            </button>
          ) : (
            <span key={i} {...marks} aria-hidden="true">
              {code}
            </span>
          );
        })}
      </span>
    </div>
  );
});

function SurahHeader({ n }: { n: number }) {
  const s = surah(n);
  return (
    <div className="mushaf-line surah-header">
      <svg className="surah-ornament" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 21 12 12 21 3 12Z" />
        <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" />
      </svg>
      <h2 className="surah-name">سورة {s.name}</h2>
      <svg className="surah-ornament" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 21 12 12 21 3 12Z" />
        <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" />
      </svg>
    </div>
  );
}

function Basmala() {
  const [glyphs, setGlyphs] = useState(false);
  useEffect(() => {
    let live = true;
    loadPageFont(1).then(
      () => live && setGlyphs(true),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="mushaf-line basmala">
      {glyphs ? (
        <span
          className="basmala-glyphs"
          style={{ fontFamily: pageFontFamily(1) }}
          aria-hidden="true"
        >
          {BASMALA_GLYPHS.join(' ')}
        </span>
      ) : (
        <span className="basmala-text" aria-hidden="true">
          {BASMALA_TEXT}
        </span>
      )}
      <span className="visually-hidden">{BASMALA_TEXT}</span>
    </div>
  );
}
