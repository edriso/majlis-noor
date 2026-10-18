/* Every page of the Madani Mushaf is set in a font of its own, in which each
   word is one glyph drawn as the King Fahd Complex printed it. That is what
   makes the page look like the printed Mushaf and not like text in an Arabic
   font. Quran.com serves the 604 fonts with `access-control-allow-origin: *`
   and a year-long cache, so a page font is fetched once per device.

   The fonts are not in this repository; see NOTICE. */

const FONT_URL = (p: number) =>
  `https://static.qurancdn.com/fonts/quran/hafs/v2/woff2/p${p}.woff2`;

export const pageFontFamily = (p: number) => `qpc-v2-p${p}`;

/** How long to wait before each new try of a font that failed: a mosque's
    connection drops a request now and then, and a second try a moment
    later usually gets it. Short, since the page waits for them. */
export const RETRY_DELAYS = [400, 1200];

/** For this long after a font has failed every try, the next ones are tried
    once: the host is down or blocked, and making each page turn wait out
    the retries would only delay the readable text. */
export const HOPELESS_FOR = 60_000;

const loading = new Map<number, Promise<void>>();
const ready = new Set<number>();
let failedAt = -Infinity;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One page font, fetched afresh on every try: a FontFace that failed
    stays failed, so a retry needs a new one. */
function fetchFace(p: number, delays: readonly number[]): Promise<FontFace> {
  const face = new FontFace(pageFontFamily(p), `url(${FONT_URL(p)})`, {
    display: 'block',
  });
  return face.load().catch(async (error: unknown) => {
    if (!delays.length) throw error;
    await wait(delays[0]);
    return fetchFace(p, delays.slice(1));
  });
}

/**
 * Loads a page's font and resolves once text can be drawn in it. Safe to call
 * as often as a render likes: each page is fetched once. A failed fetch is
 * tried again after a moment, twice, and then given up and forgotten, so the
 * next call (the page's «أعد المحاولة», or the page opened again) starts
 * over, which is what a reader whose connection came back expects.
 */
export function loadPageFont(p: number): Promise<void> {
  let pending = loading.get(p);
  if (!pending) {
    // No FontFace (an old browser, a test runner): the page falls back to
    // its readable text, which is what a failed load does too.
    if (typeof FontFace === 'undefined')
      return Promise.reject(new Error('FontFace is not supported'));
    const hopeless =
      navigator.onLine === false || Date.now() - failedAt < HOPELESS_FOR;
    pending = fetchFace(p, hopeless ? [] : RETRY_DELAYS).then(
      (face) => {
        document.fonts.add(face);
        ready.add(p);
        failedAt = -Infinity;
      },
      (error: unknown) => {
        failedAt = Date.now();
        loading.delete(p);
        throw error;
      },
    );
    loading.set(p, pending);
  }
  return pending;
}

/** Whether a page's font is in, so a prefetched page draws at once. */
export const isPageFontReady = (p: number) => ready.has(p);
