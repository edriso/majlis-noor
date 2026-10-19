import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Headphones,
  LoaderCircle,
  RotateCcw,
  Square,
  X,
} from '@/components/icons';
import { arabic, timesCount } from '@/data/arabic';
import {
  loadedPage,
  loadPage,
  pageOfAyah,
  surah,
  verseKey,
  verseOf,
  type Page,
} from '@/data/mushaf';
import { reciterById } from '@/data/reciters';
import {
  ayahTimed,
  ayatRecitation,
  loadWords,
  type Segment,
  type Timings,
} from '@/data/timings';
import type { AyahStatus } from '@/halaqa/useAyahListen';
import { ayahText } from './words';

/** What the bar needs of `useAyahListen`, which the reading screen holds
    (its turn's `ayah`), so Space and the one pause reach the ayah too. */
export type AyahListen = {
  id: string | null;
  status: AyahStatus;
  play: (
    id: string,
    stretches: readonly Segment[],
    options?: { times?: number },
  ) => void;
  stop: () => void;
};

/** How many times «كرّر» recites the ayah: enough to repeat after the
    sheikh, as a teacher has a class do. */
export const REPEAT = 3;

/** Every way the bar plays its ayah, as the `id` it plays under. */
const ids = (key: string, word: number | null) => ({
  once: key,
  repeat: `${key}×${REPEAT}`,
  word: `${key}@${word}`,
});

export const COPIED = 'نُسخت الآية';
/** Where the browser has no clipboard to give (a page not served
    securely) or refuses it, the ayah can still be copied by hand: words
    selected on the page copy as their text (MushafPage). */
export const COPY_FAILED = 'تعذّر نسخ الآية؛ حدّد كلماتها في الصفحة وانسخها';

/** How long «نُسخت الآية» stays before the bar's note is its own again. */
const COPIED_MS = 3000;

/** An ayah as «انسخ الآية» copies it from its page: its text, ending in
    its number, and where it is, «… ﴿١٤﴾ [النمل: ١٤]». */
export function ayahToCopy(page: Page, ayah: number) {
  const v = verseOf(ayah);
  return `${ayahText(page, ayah)} [${surah(v.surah).name}: ${arabic(v.ayah)}]`;
}

/** Where a word of an ayah is first heard in the reciter's recording, and
    so where «من هذه الكلمة» starts; null until his words are in, and for
    good where he has no time for it. */
function useWordStart(
  reciter: string,
  ayah: number,
  word: number | null,
  timed: boolean,
) {
  const [found, setFound] = useState<{ key: string; ms: number | null }>();
  const key = `${reciter}/${ayah}/${word}`;
  useEffect(() => {
    if (word === null || !timed) return;
    let live = true;
    const v = verseOf(ayah);
    const done = (ms: number | null) =>
      live && setFound({ key: `${reciter}/${ayah}/${word}`, ms });
    loadWords(reciter, v.surah).then(
      (w) =>
        done(
          w.ayat[v.ayah - 1]?.words.find((x) => x.word === word)?.from ?? null,
        ),
      () => done(null),
    );
    return () => {
      live = false;
    };
  }, [reciter, ayah, word, timed]);
  return found?.key === key ? found.ms : null;
}

/**
 * One ayah, chosen by a tap on the page or by its marker: its name, and
 * the sheikh reciting it once, three times, or from the word tapped, to
 * hear how it is read or to repeat after him; and its text to copy, with
 * where it is, which the page's glyphs cannot give. Docked above the
 * action bar by the reading screen.
 *
 * It plays through the reading screen's `useAyahListen`, so whatever was
 * playing (a sheikh's turn, «استمع») waits and carries on after. Closing
 * it, by its button, Escape or a tap anywhere but on it or on another word
 * of the page, stops the ayah. When it opens it takes the focus, and the
 * button or Escape that closes it gives the focus back to whatever had it,
 * a marker most often; a tap elsewhere leaves it where the tap put it.
 */
export function AyahBar({
  ayah,
  word = null,
  reciter,
  timings,
  listen,
  onClose,
}: {
  /** By its number through the whole Mushaf. */
  ayah: number;
  /** The word tapped, if one was. */
  word?: number | null;
  /** The sheikh who recites it, by id. */
  reciter: string;
  /** His timings: undefined while they load, null if they would not. */
  timings: Timings | null | undefined;
  listen: AyahListen;
  onClose: () => void;
}) {
  const v = verseOf(ayah);
  const key = verseKey(ayah);
  const titleId = useId();
  const bar = useRef<HTMLElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const sheikh = reciterById(reciter).short;
  const timed = !!timings && ayahTimed(timings, ayah);
  const wordStart = useWordStart(reciter, ayah, word, timed);
  const play = ids(key, word);
  const mine =
    listen.status !== 'idle' &&
    listen.id !== null &&
    Object.values(play).includes(listen.id)
      ? listen.id
      : null;
  const sounding =
    !!mine && (listen.status === 'playing' || listen.status === 'loading');
  // What the last «انسخ الآية» came to, for the ayah it copied: done, said
  // for a moment, or not, said until the reader does something else.
  const [copied, setCopied] = useState<{ ayah: number; ok: boolean }>();
  const copyNote =
    copied?.ayah === ayah ? (copied.ok ? COPIED : COPY_FAILED) : '';

  useEffect(() => {
    if (!copied?.ok) return;
    const clear = setTimeout(() => setCopied(undefined), COPIED_MS);
    return () => clearTimeout(clear);
  }, [copied]);

  const copy = () => {
    const n = pageOfAyah(ayah);
    const page = loadedPage(n);
    // Async, so a browser with no clipboard at all rejects like one that
    // says no.
    const write = async (p: Page) =>
      navigator.clipboard.writeText(ayahToCopy(p, ayah));
    // Written in the press itself where its page is in, as it always is
    // once drawn: a browser may allow the clipboard only then.
    (page ? write(page) : loadPage(n).then(write)).then(
      () => setCopied({ ayah, ok: true }),
      () => setCopied({ ayah, ok: false }),
    );
  };

  const stretches = (from?: number): Segment[] =>
    timings
      ? ayatRecitation(timings, ayah).map((s, i) => ({
          url: s.url,
          from: i === 0 && from !== undefined ? from : s.from,
          to: s.to,
          page: pageOfAyah(ayah),
        }))
      : [];

  const close = (giveBack: boolean) => {
    if (mine) listen.stop();
    onClose();
    const back = opener.current;
    if (giveBack && back instanceof HTMLElement && back.isConnected)
      back.focus();
  };
  // The listeners are set once, and close as the bar stands now.
  const closeFromOutside = useEffectEvent(close);

  // The focus comes to the bar when it opens and whenever another ayah is
  // chosen while it is open, from a marker by the keyboard most often.
  useEffect(() => {
    const had = document.activeElement;
    if (!bar.current?.contains(had)) opener.current = had;
    first.current?.focus();
  }, [ayah, word]);

  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // A sheet open over the screen takes its own Escape.
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('dialog[open], [role="dialog"]')) return;
      e.preventDefault();
      closeFromOutside(true);
    };
    const press = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target || bar.current?.contains(target)) return;
      // Another word of the page chooses another ayah: the bar stays.
      if (target.closest('.mushaf-lines [data-ayah]')) return;
      closeFromOutside(false);
    };
    document.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', press, true);
    return () => {
      document.removeEventListener('keydown', escape);
      document.removeEventListener('pointerdown', press, true);
    };
  }, []);

  const toggle = (id: string, start: () => void) => () => {
    setCopied(undefined);
    if (mine === id && sounding) listen.stop();
    else start();
  };
  const action = (id: string, words: string) =>
    mine === id && sounding ? 'أوقف' : words;
  const icon = (id: string, idle: ReactNode) =>
    mine === id && listen.status === 'loading' ? (
      <LoaderCircle size={20} className="ayah-bar-spin" aria-hidden="true" />
    ) : mine === id && sounding ? (
      <Square size={18} aria-hidden="true" />
    ) : (
      idle
    );

  const note = copyNote
    ? copyNote
    : timings === undefined
      ? 'جارٍ تحميل التلاوة…'
      : timings === null
        ? `تعذّر تحميل تلاوة الشيخ ${sheikh}`
        : timings && !timed
          ? `لا تتوفّر تلاوة هذه الآية بصوت الشيخ ${sheikh}`
          : mine && listen.status === 'loading'
            ? 'جارٍ التحميل…'
            : mine && listen.status === 'error'
              ? 'تعذّر تشغيل الآية'
              : '';

  return (
    <section ref={bar} className="ayah-bar" aria-labelledby={titleId} lang="ar">
      <div className="ayah-bar-head">
        <p id={titleId} className="ayah-bar-title">
          الآية {arabic(v.ayah)} · {surah(v.surah).name}
        </p>
        <button
          ref={timed || timings === undefined ? undefined : first}
          type="button"
          className="icon-button"
          aria-label="إغلاق"
          onClick={() => close(true)}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="ayah-bar-actions">
        {timed || timings === undefined ? (
          <>
            <button
              ref={first}
              type="button"
              className="button ayah-bar-button"
              aria-disabled={!timed || undefined}
              onClick={toggle(play.once, () => {
                if (timed) listen.play(play.once, stretches());
              })}
            >
              {icon(play.once, <Headphones size={20} aria-hidden="true" />)}
              {action(play.once, 'استمع')}
            </button>
            <button
              type="button"
              className="button ayah-bar-button"
              aria-disabled={!timed || undefined}
              onClick={toggle(play.repeat, () => {
                if (timed)
                  listen.play(play.repeat, stretches(), { times: REPEAT });
              })}
            >
              {icon(play.repeat, <RotateCcw size={20} aria-hidden="true" />)}
              {action(play.repeat, `كرّر ${timesCount(REPEAT)}`)}
            </button>
            {wordStart !== null ? (
              <button
                type="button"
                className="button ayah-bar-button"
                onClick={toggle(play.word, () =>
                  listen.play(play.word, stretches(wordStart)),
                )}
              >
                {icon(play.word, null)}
                {action(play.word, 'من هذه الكلمة')}
              </button>
            ) : null}
          </>
        ) : null}
        <button
          type="button"
          className="button ayah-bar-button ayah-bar-copy"
          onClick={copy}
        >
          انسخ الآية
        </button>
      </div>
      {/* Polite, and not a status: the reading screen's one status is
          whose turn it is. */}
      <p className="ayah-bar-note" aria-live="polite">
        {note}
      </p>
    </section>
  );
}
