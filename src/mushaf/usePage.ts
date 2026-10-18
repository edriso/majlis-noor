import { useEffect, useState } from 'react';
import { loadedPage, loadPage, type Page } from '@/data/mushaf';
import { isPageFontReady, loadPageFont } from './fonts';

export type PageFont = 'glyphs' | 'text';

export type PageState =
  | { status: 'loading' }
  | {
      status: 'ready';
      page: Page;
      font: PageFont;
      /** Whether `retryFont` is under way. */
      retrying: boolean;
      /** Tries the page's font again, for a page drawn from its text. */
      retryFont: () => void;
    };

type Loaded = { n: number; page: Page; font: PageFont; retrying?: boolean };

/**
 * A Mushaf page and its font. The page is drawn only once both are in, so the
 * glyph codes never flash as boxes. If the font cannot load (offline on a
 * first visit, the font host down) the page is drawn from its readable text
 * instead, on the same fifteen lines, which is a page that still reads, and
 * the font can be tried again.
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
    loadPage(n)
      .then(async (page) => {
        const font = await loadPageFont(n).then(
          () => 'glyphs' as const,
          () => 'text' as const,
        );
        if (live) setLoaded({ n, page, font });
      })
      .catch(() => {
        // The page's own data failed, which only happens offline before the
        // chunk was ever cached. Stay on the loading state; the next render
        // with a new page number retries.
      });
    return () => {
      live = false;
    };
  }, [n]);

  // Fetched again when a retried font comes in: the neighbours' fonts
  // failed with it, and the host is back.
  const drawn = loaded?.n === n && loaded.font;
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

  const retryFont = () => {
    if (loaded?.n !== n || loaded.retrying) return;
    const drawn = loaded;
    keep({ ...drawn, retrying: true });
    loadPageFont(n).then(
      () => keep({ ...drawn, font: 'glyphs' }),
      () => keep({ ...drawn, font: 'text' }),
    );
  };

  if (loaded?.n === n)
    return {
      status: 'ready',
      page: loaded.page,
      font: loaded.font,
      retrying: !!loaded.retrying,
      retryFont,
    };
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
