import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadedPage, loadPage, type Page } from '@/data/mushaf';
import { isPageFontReady, loadPageFont } from './fonts';
import { usePage } from './usePage';

vi.mock('@/data/mushaf', () => ({ loadPage: vi.fn(), loadedPage: vi.fn() }));
vi.mock('./fonts', () => ({
  loadPageFont: vi.fn(),
  isPageFontReady: vi.fn(),
}));

const page = (n: number): Page => ({
  page: n,
  surahs: [4],
  juz: 4,
  rubs: [31],
  lines: [{ t: 'text', w: [['ﱁ', '4:1']], x: 'يَـٰٓأَيُّهَا' }],
});

/** A promise and the hands that settle it, for a load the test finishes. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(loadPage).mockReset();
  vi.mocked(loadedPage).mockReset();
  vi.mocked(loadPageFont).mockReset().mockResolvedValue(undefined);
  vi.mocked(isPageFontReady).mockReset().mockReturnValue(false);
});

describe('usePage', () => {
  it('draws a page once its data and its font are in', async () => {
    vi.mocked(loadPage).mockResolvedValue(page(7));
    const { result } = renderHook(() => usePage(7));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ font: 'glyphs', page: page(7) });
  });

  it('says so when the page cannot load, instead of loading for good', async () => {
    vi.mocked(loadPage).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePage(7));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current).toMatchObject({ retrying: false });
  });

  it('asks for the page again on retry, and draws it when it comes', async () => {
    const second = later<Page>();
    vi.mocked(loadPage)
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => usePage(7));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => {
      if (result.current.status === 'error') result.current.retry();
    });
    expect(result.current).toMatchObject({ status: 'error', retrying: true });
    expect(loadPage).toHaveBeenCalledTimes(2);

    await act(async () => second.resolve(page(7)));
    expect(result.current).toMatchObject({ status: 'ready', font: 'glyphs' });
  });

  it('stays on the error when a retry fails too', async () => {
    vi.mocked(loadPage).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePage(7));
    await waitFor(() => expect(result.current.status).toBe('error'));
    await act(async () => {
      if (result.current.status === 'error') result.current.retry();
    });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'error',
        retrying: false,
      }),
    );
    expect(loadPage).toHaveBeenCalledTimes(2);
  });

  it('draws the page from its text when its font cannot load', async () => {
    vi.mocked(loadPage).mockResolvedValue(page(7));
    vi.mocked(loadPageFont).mockRejectedValue(new Error('blocked'));
    const { result } = renderHook(() => usePage(7));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ font: 'text', retrying: false });
  });

  it('turns the text into glyphs when a retry gets the font', async () => {
    const retried = later<void>();
    vi.mocked(loadPage).mockResolvedValue(page(7));
    vi.mocked(loadPageFont)
      .mockRejectedValueOnce(new Error('blocked'))
      .mockReturnValueOnce(retried.promise);
    const { result } = renderHook(() => usePage(7));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      if (result.current.status === 'ready') result.current.retryFont();
    });
    expect(result.current).toMatchObject({ font: 'text', retrying: true });

    await act(async () => retried.resolve());
    expect(result.current).toMatchObject({ font: 'glyphs', retrying: false });
  });

  it('keeps the text when the font fails again', async () => {
    vi.mocked(loadPage).mockResolvedValue(page(7));
    vi.mocked(loadPageFont).mockRejectedValue(new Error('blocked'));
    const { result } = renderHook(() => usePage(7));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      if (result.current.status === 'ready') result.current.retryFont();
    });
    await waitFor(() =>
      expect(result.current).toMatchObject({ font: 'text', retrying: false }),
    );
    expect(loadPageFont).toHaveBeenCalledTimes(2);
  });

  it('lets a retry that ends after the page turned change nothing', async () => {
    const retried = later<Page>();
    vi.mocked(loadPage)
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(retried.promise)
      .mockResolvedValue(page(8));
    const { result, rerender } = renderHook(({ n }) => usePage(n), {
      initialProps: { n: 7 },
    });
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => {
      if (result.current.status === 'error') result.current.retry();
    });
    rerender({ n: 8 });
    await waitFor(() =>
      expect(result.current).toMatchObject({ page: page(8) }),
    );
    await act(async () => retried.resolve(page(7)));
    expect(result.current).toMatchObject({ page: page(8) });
  });

  it('fetches the pages around it once it is drawn', async () => {
    vi.mocked(loadPage).mockResolvedValue(page(7));
    renderHook(() => usePage(7, [8, 6]));
    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(8));
    expect(loadPage).toHaveBeenCalledWith(6);
    expect(loadPageFont).toHaveBeenCalledWith(8);
    expect(loadPageFont).toHaveBeenCalledWith(6);
  });

  it('draws a page fetched ahead at once, with no frame of skeleton', () => {
    vi.mocked(loadPage).mockReturnValue(new Promise(() => {}));
    vi.mocked(loadedPage).mockReturnValue(page(8));
    vi.mocked(isPageFontReady).mockReturnValue(true);
    const { result } = renderHook(() => usePage(8));
    expect(result.current).toMatchObject({ status: 'ready', font: 'glyphs' });
  });
});
