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
 * same lines, each line made smaller if it would not fit.
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
  const sajdah = ready?.page.sajdah?.length;
  const linesRef = useRef<HTMLDivElement>(null);
  useFittedLines(linesRef, ready?.font === 'text' ? ready.page : null);

  return (
    <article
      className="mushaf-page"
      data-opening={opening || undefined}
      aria-label={`الصفحة ${arabic(page)}، سورة ${name}، الجزء ${arabic(juz)}`}
      aria-busy={!ready}
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
          <div
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

      <footer className="mushaf-folio" aria-hidden="true">
        <span>{arabic(page)}</span>
      </footer>

      {ready && sajdah ? (
        <p className="visually-hidden">في هذه الصفحة سجدة تلاوة.</p>
      ) : null}
    </article>
  );
}

/**
 * Makes each line of fallback text that is wider than the page smaller,
 * just enough to fit, so the whole line shows on its own row. A line that
 * fits keeps the normal size: nothing is ever made larger, and nothing is
 * spaced out letter by letter, which Arabic does not allow. The scale is
 * the line's `--fit`, read by mushaf.css.
 */
export function fitLines(texts: readonly HTMLElement[]) {
  for (const t of texts) t.style.removeProperty('--fit');
  const scale = texts.map(() => 1);
  // A second pass catches a line that rounding left a pixel too wide.
  for (let pass = 0; pass < 3; pass++) {
    // Every line is read before any is written, so the page is laid out
    // once a pass rather than once a line.
    const sizes = texts.map((t) => [t.scrollWidth, t.clientWidth] as const);
    let changed = false;
    sizes.forEach(([scroll, client], i) => {
      if (client <= 0 || scroll <= client) return;
      // A hair under the exact ratio, which the justified spacing takes up.
      scale[i] *= (client / scroll) * 0.99;
      texts[i].style.setProperty('--fit', scale[i].toFixed(4));
      changed = true;
    });
    if (!changed) return;
  }
}

/** Fits the fallback lines (`fitLines`) when they are drawn, again once
    the Quran font has loaded (until then they are measured in another),
    and whenever the page changes size. */
function useFittedLines(
  box: RefObject<HTMLDivElement | null>,
  content: unknown,
) {
  useLayoutEffect(() => {
    const lines = box.current;
    if (!content || !lines) return;
    const fit = () =>
      fitLines([...lines.querySelectorAll<HTMLElement>('.mushaf-text')]);
    fit();
    let live = true;
    // jsdom has neither; a browser without them still gets the first fit.
    const fonts = document.fonts as FontFaceSet | undefined;
    void fonts?.ready.then(() => {
      if (live) fit();
    });
    fonts?.addEventListener('loadingdone', fit);
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    resize?.observe(lines);
    return () => {
      live = false;
      resize?.disconnect();
      fonts?.removeEventListener('loadingdone', fit);
    };
  }, [box, content]);
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
