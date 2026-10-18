import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, type Page } from '@/data/mushaf';
import { loadPageFont } from './fonts';
import { fitLines, MushafPage } from './MushafPage';

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

const article = () => screen.getByRole('article');

beforeEach(() => {
  vi.mocked(loadPage).mockReset().mockResolvedValue(page77);
  vi.mocked(loadPageFont).mockReset().mockResolvedValue(undefined);
});

describe('a page whose font cannot load', () => {
  it('is drawn from its text, every line whole and in order', async () => {
    vi.mocked(loadPageFont).mockRejectedValue(new Error('blocked'));
    render(<MushafPage page={77} />);
    await waitFor(() =>
      expect(
        article().querySelector('.mushaf-lines')?.getAttribute('data-font'),
      ).toBe('text'),
    );
    expect(
      [...article().querySelectorAll('.mushaf-text')].map((l) => l.textContent),
    ).toEqual(LINES);
  });
});

describe('a page drawn in its own font', () => {
  it('carries each line as hidden text for screen readers', async () => {
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
