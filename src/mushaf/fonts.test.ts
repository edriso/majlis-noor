import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What each new FontFace's load will do, in order; `ok` once they run out. */
let outcomes: ('ok' | 'fail')[] = [];
/** Every FontFace made, by family: one per try. */
let made: string[] = [];
/** The document's font set, as far as the module uses it. */
const added = vi.fn();

class FakeFontFace {
  family: string;
  constructor(family: string) {
    this.family = family;
    made.push(family);
  }
  load() {
    return outcomes.shift() === 'fail'
      ? Promise.reject(new Error('network'))
      : Promise.resolve(this);
  }
}

// The module keeps which fonts are loading and when the host last failed,
// so each test takes a fresh copy of it.
const fonts = () => import('./fonts');

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubGlobal('FontFace', FakeFontFace);
  Object.defineProperty(document, 'fonts', {
    value: { add: added },
    configurable: true,
  });
  added.mockReset();
  outcomes = [];
  made = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadPageFont', () => {
  it('fetches a page font once, however often it is asked for', async () => {
    const { loadPageFont, isPageFontReady } = await fonts();
    const first = loadPageFont(3);
    expect(loadPageFont(3)).toBe(first);
    await first;
    expect(made).toEqual(['qpc-v2-p3']);
    expect(isPageFontReady(3)).toBe(true);
    expect(added).toHaveBeenCalledTimes(1);
  });

  it('tries a failed font twice more, after a pause each time', async () => {
    const { loadPageFont, isPageFontReady, RETRY_DELAYS } = await fonts();
    outcomes = ['fail', 'fail', 'ok'];
    const loading = loadPageFont(5);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[0] - 1);
    expect(made).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(made).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS[1]);
    await expect(loading).resolves.toBeUndefined();
    expect(made).toHaveLength(3);
    expect(isPageFontReady(5)).toBe(true);
  });

  it('gives up after three tries, and starts over when asked again', async () => {
    const { loadPageFont, isPageFontReady } = await fonts();
    outcomes = ['fail', 'fail', 'fail'];
    const loading = loadPageFont(5);
    const failed = expect(loading).rejects.toThrow('network');
    await vi.runAllTimersAsync();
    await failed;
    expect(made).toHaveLength(3);
    expect(isPageFontReady(5)).toBe(false);

    // The page's «أعد المحاولة»: a new fetch, not the old failure.
    const again = loadPageFont(5);
    expect(again).not.toBe(loading);
    await again;
    expect(made).toHaveLength(4);
    expect(isPageFontReady(5)).toBe(true);
  });

  it('tries each font once for a minute after one failed every try', async () => {
    const { loadPageFont, HOPELESS_FOR } = await fonts();
    outcomes = ['fail', 'fail', 'fail'];
    const first = expect(loadPageFont(5)).rejects.toThrow();
    await vi.runAllTimersAsync();
    await first;

    // The next page turn does not wait out the retries for a host that is
    // down: one try, and its text is drawn at once.
    outcomes = ['fail'];
    await expect(loadPageFont(6)).rejects.toThrow();
    expect(made).toHaveLength(4);

    await vi.advanceTimersByTimeAsync(HOPELESS_FOR);
    outcomes = ['fail', 'ok'];
    const later = loadPageFont(7);
    await vi.runAllTimersAsync();
    await expect(later).resolves.toBeUndefined();
    expect(made).toHaveLength(6);
  });

  it('tries the next fonts again as usual once one comes in', async () => {
    const { loadPageFont } = await fonts();
    outcomes = ['fail', 'fail', 'fail'];
    const first = expect(loadPageFont(5)).rejects.toThrow();
    await vi.runAllTimersAsync();
    await first;
    await loadPageFont(5);

    outcomes = ['fail', 'ok'];
    const next = loadPageFont(6);
    await vi.runAllTimersAsync();
    await expect(next).resolves.toBeUndefined();
  });

  it('does not retry while the browser knows it is offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { loadPageFont } = await fonts();
    outcomes = ['fail'];
    await expect(loadPageFont(5)).rejects.toThrow();
    expect(made).toHaveLength(1);
  });

  it('fails at once without FontFace, so the page is drawn from its text', async () => {
    vi.stubGlobal('FontFace', undefined);
    const { loadPageFont } = await fonts();
    await expect(loadPageFont(5)).rejects.toThrow();
  });
});
