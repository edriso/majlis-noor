import { useEffect, useState } from 'react';
import { loadedPage, loadPage, type Page } from '@/data/mushaf';
import { isPageFontReady, loadPageFont } from './fonts';

export type PageFont = 'glyphs' | 'text';

export type PageState =
  | { status: 'loading' }
  | {
      /** The page's own data could not load: offline, and never opened on
          this device. Nothing to draw until `retry` gets it. */
      status: 'error';
      retrying: boolean;
      retry: () => void;
    }
  | {
      status: 'ready';
      page: Page;
      font: PageFont;
      /** Whether `retryFont` is under way. */
      retrying: boolean;
      /** Tries the page's font again, for a page drawn from its text. */
      retryFont: () => void;
    };

type Settled =
  | { n: number; status: 'ready'; page: Page; font: PageFont }
  | { n: number; status: 'error' };

type Loaded = Settled & { retrying?: boolean };

/** A page and its font, both in, or why not. Never rejects. */
async function settle(n: number): Promise<Settled> {
  let page: Page;
  try {
    page = await loadPage(n);
  } catch {
    return { n, status: 'error' };
  }
  const font = await loadPageFont(n).then(
    () => 'glyphs' as const,
    () => 'text' as const,
  );
  return { n, status: 'ready', page, font };
}

/**
 * A Mushaf page and its font. The page is drawn only once both are in, so the
 * glyph codes never flash as boxes. If the font cannot load (offline on a
 * first visit, the font host down) the page is drawn from its readable text
 * instead, on the same fifteen lines, which is a page that still reads; if
 * the page's data itself cannot load, the state says so rather than leaving
 * the skeleton up for good. Either can be tried again.
 *
 * The pages on either side are fetched as soon as this one is ready, which is
 * what makes «تمّ» feel instant: the next reader's page is already here.
 */
export function usePage(
  n: number,
  prefetch: readonly number[] = [],
): PageState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let live = true;
    void settle(n).then((result) => {
      if (live) setLoaded(result);
    });
    return () => {
      live = false;
    };
  }, [n]);

  // Fetched again when a retried font comes in: the neighbours' fonts
  // failed with it, and the host is back.
  const drawn = loaded?.n === n && loaded.status === 'ready' && loaded.font;
  const key = prefetch.join(',');
  useEffect(() => {
    if (!drawn) return;
    for (const p of key.split(',').map(Number)) {
      if (!p) continue;
      loadPage(p).catch(() => {});
      loadPageFont(p).catch(() => {});
    }
  }, [drawn, n, key]);

  // Only the page still on screen takes the answer: a retry that ends
  // after the reader turned the page changes nothing.
  const keep = (result: Loaded) =>
    setLoaded((current) => (current?.n === result.n ? result : current));

  const retry = () => {
    if (loaded?.n !== n || loaded.retrying) return;
    keep({ ...loaded, retrying: true });
    void settle(n).then(keep);
  };

  const retryFont = () => {
    if (loaded?.n !== n || loaded.status !== 'ready' || loaded.retrying) return;
    const drawn = loaded;
    keep({ ...drawn, retrying: true });
    loadPageFont(n).then(
      () => keep({ ...drawn, font: 'glyphs' }),
      () => keep({ ...drawn, font: 'text' }),
    );
  };

  if (loaded?.n === n) {
    if (loaded.status === 'error')
      return { status: 'error', retrying: !!loaded.retrying, retry };
    return {
      status: 'ready',
      page: loaded.page,
      font: loaded.font,
      retrying: !!loaded.retrying,
      retryFont,
    };
  }
  // A page fetched ahead of time is drawn in the same frame as the turn
  // that asked for it, rather than after a frame of skeleton.
  const early = loadedPage(n);
  if (early && isPageFontReady(n))
    return {
      status: 'ready',
      page: early,
      font: 'glyphs',
      retrying: false,
      retryFont: () => {},
    };
  return { status: 'loading' };
}
