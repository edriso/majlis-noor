import { arabic } from '@/data/arabic';
import {
  juzOfPage,
  rubLabel,
  surah,
  surahOfPage,
  type Line,
} from '@/data/mushaf';
import { loadPageFont, pageFontFamily } from './fonts';
import { usePage } from './usePage';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
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
 */
export function MushafPage({
  page,
  prefetch,
}: {
  page: number;
  prefetch?: readonly number[];
}) {
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
            data-font={ready.font}
            style={
              ready.font === 'glyphs'
                ? { fontFamily: `${pageFontFamily(page)}, var(--font-quran)` }
                : undefined
            }
          >
            {ready.page.lines.map((line, i) => (
              <MushafLine key={i} line={line} />
            ))}
            {fallback ? <Probes lines={ready.page.lines} /> : null}
          </div>
        ) : missing ? (
          <div className="mushaf-missing">
            {/* Said by the status below, so a screen reader hears it once. */}
            <p aria-hidden="true">{PAGE_MISSING}</p>
            <RetryButton retrying={missing.retrying} onClick={missing.retry} />
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
          <RetryButton
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
}

function RetryButton({
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
 * never from the line itself just after its size was changed: that is laid
 * out at once only when nothing animates, and with reduced motion every
 * property is given a transition, if a short one.
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

function MushafLine({ line }: { line: Line }) {
  if (line.t === 'surah') return <SurahHeader n={line.s} />;
  if (line.t === 'basmala') return <Basmala />;
  return (
    <div className="mushaf-line">
      <span className="mushaf-words" aria-hidden="true">
        {line.w.map(([code], i) => (
          <span key={i}>{code}</span>
        ))}
      </span>
      {/* The glyphs are private-use code points that mean nothing to a screen
          reader or to the font fallback; this is the same line as text. */}
      <span className="mushaf-text">{line.x}</span>
    </div>
  );
}

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
