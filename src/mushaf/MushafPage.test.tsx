import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, type Page } from '@/data/mushaf';
import { loadPageFont } from './fonts';
import { FONT_NOTE, fitLines, MushafPage, PAGE_MISSING } from './MushafPage';

vi.mock('@/data/mushaf', async (actual) => ({
  ...(await actual<typeof import('@/data/mushaf')>()),
  loadPage: vi.fn(),
  loadedPage: vi.fn(),
}));
vi.mock('./fonts', async (actual) => ({
  ...(await actual<typeof import('./fonts')>()),
  loadPageFont: vi.fn(),
  isPageFontReady: vi.fn(() => false),
}));

const LINES = [
  'يَـٰٓأَيُّهَا ٱلنَّاسُ ٱتَّقُوا۟ رَبَّكُمُ ٱلَّذِى خَلَقَكُم',
  'زَوْجَهَا وَبَثَّ مِنْهُمَا رِجَالًا كَثِيرًا وَنِسَآءً',
];

const page77: Page = {
  page: 77,
  surahs: [4],
  juz: 4,
  rubs: [31],
  lines: [
    { t: 'basmala' },
    ...LINES.map((x) => ({ t: 'text' as const, w: [['ﱁ', '4:1']], x })),
  ] as Page['lines'],
};

function later<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

const article = () => screen.getByRole('article');
const retry = () => screen.getByRole('button', { name: 'أعد المحاولة' });

beforeEach(() => {
  vi.mocked(loadPage).mockReset().mockResolvedValue(page77);
  vi.mocked(loadPageFont).mockReset().mockResolvedValue(undefined);
});

describe('a page whose data cannot load', () => {
  beforeEach(() => {
    vi.mocked(loadPage).mockRejectedValue(new Error('offline'));
  });

  it('says why, politely, and is no longer busy', async () => {
    render(<MushafPage page={77} />);
    expect(article().getAttribute('aria-busy')).toBe('true');
    await screen.findByRole('button', { name: 'أعد المحاولة' });
    expect(article().getAttribute('aria-busy')).toBe('false');
    const live = article().querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe(PAGE_MISSING);
    // Seen on the page, and heard once, from the live region.
    expect(screen.getByText(PAGE_MISSING, { selector: 'p[aria-hidden]' }));
  });

  it('asks for the page again, and draws it when it comes', async () => {
    const user = userEvent.setup();
    const second = later<Page>();
    vi.mocked(loadPage)
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(second.promise);
    render(<MushafPage page={77} />);
    await user.click(await screen.findByRole('button', { name: /أعد/ }));

    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', { name: 'جارٍ المحاولة…' }).ariaDisabled,
    ).toBe('true');
    // Emptied, so that a second failure is said again.
    expect(article().querySelector('[aria-live]')?.textContent).toBe('');

    await act(async () => second.resolve(page77));
    expect(screen.queryByText(PAGE_MISSING)).toBeNull();
    expect(article().querySelectorAll('.mushaf-text')).toHaveLength(2);
  });
});

describe('a page whose font cannot load', () => {
  beforeEach(() => {
    vi.mocked(loadPageFont).mockRejectedValue(new Error('blocked'));
  });

  it('is drawn from its text, every line whole and in order', async () => {
    render(<MushafPage page={77} />);
    await screen.findByText(FONT_NOTE);
    const lines = article().querySelector('.mushaf-lines');
    expect(lines?.getAttribute('data-font')).toBe('text');
    expect(
      [...article().querySelectorAll('.mushaf-text')].map((l) => l.textContent),
    ).toEqual(LINES);
  });

  it('says so in place of the folio, with a retry the note describes', async () => {
    render(<MushafPage page={77} />);
    await screen.findByText(FONT_NOTE);
    expect(article().dataset.fallback).toBe('true');
    expect(article().querySelector('.mushaf-folio')).toBeNull();
    const button = retry();
    const note = document.getElementById(
      button.getAttribute('aria-describedby') ?? '',
    );
    expect(note?.textContent).toBe(FONT_NOTE);
  });

  it('draws the glyphs when a retry gets the font', async () => {
    const user = userEvent.setup();
    const retried = later<void>();
    // Page 77's font fails, then comes on the retry; the basmala asks for
    // page 1's, which the host still refuses.
    let page77Tries = 0;
    vi.mocked(loadPageFont).mockImplementation((p) =>
      p === 77 && page77Tries++ > 0
        ? retried.promise
        : Promise.reject(new Error('blocked')),
    );
    render(<MushafPage page={77} />);
    await screen.findByText(FONT_NOTE);
    await user.click(retry());
    expect(screen.getByRole('button', { name: 'جارٍ المحاولة…' }));

    await act(async () => retried.resolve());
    await waitFor(() =>
      expect(
        article().querySelector('.mushaf-lines')?.getAttribute('data-font'),
      ).toBe('glyphs'),
    );
    expect(screen.queryByText(FONT_NOTE)).toBeNull();
    expect(article().dataset.fallback).toBeUndefined();
    expect(article().querySelector('.mushaf-folio')?.textContent).toBe('٧٧');
  });

  it('keeps the note when the font fails again', async () => {
    const user = userEvent.setup();
    render(<MushafPage page={77} />);
    await screen.findByText(FONT_NOTE);
    await user.click(retry());
    await waitFor(() => expect(retry()));
    expect(screen.getByText(FONT_NOTE));
    expect(loadPageFont).toHaveBeenCalledWith(77);
  });
});

describe('a page drawn in its own font', () => {
  it('carries each line as hidden text for screen readers, and no note', async () => {
    render(<MushafPage page={77} />);
    await waitFor(() =>
      expect(
        article().querySelector('.mushaf-lines')?.getAttribute('data-font'),
      ).toBe('glyphs'),
    );
    expect(article().getAttribute('aria-busy')).toBe('false');
    expect(
      [...article().querySelectorAll('.mushaf-text')].map((l) => l.textContent),
    ).toEqual(LINES);
    expect(screen.queryByText(FONT_NOTE)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('fitLines', () => {
  /** A line of text `natural` pixels long at its normal size, in a row
      `room` pixels wide, that grows and shrinks with its `--fit`. */
  function line(natural: number, room: number) {
    const el = document.createElement('span');
    const fit = () => Number(el.style.getPropertyValue('--fit') || 1);
    Object.defineProperties(el, {
      clientWidth: { get: () => room },
      // A line that fits is justified to the full row; one that does not
      // overflows it. Browsers round both to whole pixels.
      scrollWidth: {
        get: () => Math.max(room, Math.round(natural * fit())),
      },
    });
    return el;
  }

  it('makes a line that is too wide just small enough to fit', () => {
    const wide = line(347, 330);
    fitLines([wide]);
    const scale = Number(wide.style.getPropertyValue('--fit'));
    expect(scale).toBeLessThan(330 / 347);
    expect(scale).toBeGreaterThan(0.94);
    expect(wide.scrollWidth).toBeLessThanOrEqual(wide.clientWidth);
  });

  it('never makes a line larger than its normal size', () => {
    const short = line(200, 330);
    fitLines([short]);
    expect(short.style.getPropertyValue('--fit')).toBe('');
  });

  it('fits each line on its own', () => {
    const lines = [line(300, 330), line(400, 330), line(331, 330)];
    fitLines(lines);
    const scales = lines.map((l) => l.style.getPropertyValue('--fit'));
    expect(scales[0]).toBe('');
    expect(Number(scales[1])).toBeLessThan(Number(scales[2]));
    for (const l of lines)
      expect(l.scrollWidth).toBeLessThanOrEqual(l.clientWidth);
  });

  it('measures afresh each time, as when the page is resized', () => {
    const wide = line(347, 330);
    fitLines([wide]);
    const first = wide.style.getPropertyValue('--fit');
    fitLines([wide]);
    expect(wide.style.getPropertyValue('--fit')).toBe(first);
  });
});
