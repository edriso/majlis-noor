import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ayahIndex, loadPage, type Page } from '@/data/mushaf';
import { loadPageFont } from './fonts';
import {
  ayahButtonLabel,
  FONT_NOTE,
  fitLines,
  MushafPage,
  PAGE_MISSING,
  type MushafPageProps,
} from './MushafPage';
import { misnamed, unnamed } from '@/test-names';

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
    expect(article().querySelector('.mushaf-probes')).toBeNull();
  });
});

describe('the fallback lines', () => {
  it('are measured by an unseen copy of each, hidden from screen readers', async () => {
    vi.mocked(loadPageFont).mockRejectedValue(new Error('blocked'));
    render(<MushafPage page={77} />);
    await screen.findByText(FONT_NOTE);
    const probes = article().querySelector('.mushaf-probes');
    expect(probes?.getAttribute('aria-hidden')).toBe('true');
    expect([...(probes?.children ?? [])].map((p) => p.textContent)).toEqual(
      LINES,
    );
  });
});

describe('fitLines', () => {
  /** An element `width` pixels wide, as a browser would measure it. */
  function sized(width: () => number) {
    const el = document.createElement('span');
    el.getBoundingClientRect = () => new DOMRect(0, 0, width(), 20);
    return el;
  }

  /** A line whose text is `natural` pixels long at its normal size, in a
      row `room` pixels wide, and its probe. `drawn()` is how wide the text
      is drawn at the `--fit` it was given. */
  function line(natural: number, room: number) {
    const probe = sized(() => natural);
    const el = sized(() => room);
    const drawn = () =>
      natural * Number(el.style.getPropertyValue('--fit') || 1);
    return { el, probe, drawn, room };
  }

  const fit = (lines: ReturnType<typeof line>[]) =>
    fitLines(
      lines.map((l) => l.el),
      lines.map((l) => l.probe),
    );

  it('makes a line that is too wide just small enough to fit', () => {
    const wide = line(347, 330);
    fit([wide]);
    expect(wide.drawn()).toBeLessThanOrEqual(330);
    expect(wide.drawn()).toBeGreaterThan(325);
  });

  it('never makes a line larger than its normal size', () => {
    const short = line(200, 330);
    fit([short]);
    expect(short.el.style.getPropertyValue('--fit')).toBe('');
  });

  it('fits each line on its own', () => {
    const lines = [line(300, 330), line(400, 330), line(331, 330)];
    fit(lines);
    expect(lines[0].el.style.getPropertyValue('--fit')).toBe('');
    for (const l of lines) expect(l.drawn()).toBeLessThanOrEqual(l.room);
    expect(lines[1].drawn()).toBeGreaterThan(325);
    expect(lines[2].drawn()).toBeGreaterThan(325);
  });

  it('measures afresh, and lets a line that fits again be its own size', () => {
    let natural = 347;
    const probe = sized(() => natural);
    const el = sized(() => 330);
    fitLines([el], [probe]);
    expect(el.style.getPropertyValue('--fit')).not.toBe('');
    // The Quran font comes in, narrower than the one standing in for it.
    natural = 320;
    fitLines([el], [probe]);
    expect(el.style.getPropertyValue('--fit')).toBe('');
  });
});

describe('a page with its ayat marked and tappable', () => {
  // Page 1 as it is: al-Fatihah, ayat 1 to 7 through the whole Mushaf.
  const page1 = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../../public/pages/1.json'),
      'utf8',
    ),
  ) as Page;
  beforeEach(() => {
    vi.mocked(loadPage).mockResolvedValue(page1);
  });

  const drawn = async (props: Partial<MushafPageProps> = {}) => {
    const view = render(<MushafPage page={1} {...props} />);
    await waitFor(() =>
      expect(article().querySelector('[data-font="glyphs"]')).not.toBeNull(),
    );
    return view;
  };
  const word = (ayah: number, n: number | null) =>
    article().querySelector<HTMLElement>(
      n === null
        ? `[data-ayah="${ayah}"]:not([data-word])`
        : `[data-ayah="${ayah}"][data-word="${n}"]`,
    )!;
  const marked = (mark: string) =>
    [...article().querySelectorAll<HTMLElement>(`[data-${mark}]`)].map(
      (el) => `${el.dataset.ayah}:${el.dataset.word ?? 'end'}`,
    );

  it('underlines every word of the turn’s ayat, their markers too', async () => {
    await drawn({ turn: { from: 3, to: 5 } });
    expect(marked('turn')).toEqual([
      '3:1',
      '3:2',
      '3:end',
      '4:1',
      '4:2',
      '4:3',
      '4:end',
    ]);
  });

  it('lays the recitation’s wash on an ayah, or on one word of it', async () => {
    const view = await drawn({ recited: { ayah: 6, word: null } });
    expect(marked('recite')).toEqual(['6:1', '6:2', '6:3', '6:end']);
    view.rerender(<MushafPage page={1} recited={{ ayah: 6, word: 2 }} />);
    expect(marked('recite')).toEqual(['6:2']);
    view.rerender(<MushafPage page={1} />);
    expect(marked('recite')).toEqual([]);
  });

  it('marks the chosen ayah', async () => {
    await drawn({ selected: 2 });
    expect(marked('selected')).toEqual(['2:1', '2:2', '2:3', '2:4', '2:end']);
  });

  it('touches only the line the recited word moves along', async () => {
    const view = await drawn({ recited: { ayah: 5, word: 1 } });
    const lines = [...article().querySelectorAll('.mushaf-words')];
    const before = lines.map((l) => l.innerHTML);
    // Al-Fatihah 5 is on line 5, with the start of 6: nothing else moves.
    const watch = new MutationObserver(() => {});
    watch.observe(article(), { subtree: true, attributes: true });
    view.rerender(<MushafPage page={1} recited={{ ayah: 5, word: 2 }} />);
    const changed = new Set(
      watch
        .takeRecords()
        .map((r) => (r.target as Element).closest('.mushaf-line')),
    );
    watch.disconnect();
    expect(changed.size).toBe(1);
    expect(
      lines.map((l) => l.innerHTML).filter((h, i) => h !== before[i]),
    ).toHaveLength(1);
  });

  it('keeps the glyphs from screen readers, and each line’s text first', async () => {
    await drawn({ onAyahTap: () => {} });
    for (const glyph of article().querySelectorAll('.mushaf-words > span'))
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
    const line = article().querySelectorAll('.mushaf-line')[1];
    expect(line.firstElementChild?.className).toBe('mushaf-text');
  });

  it('makes each marker a button named by its ayah, which reports it', async () => {
    const user = userEvent.setup();
    const onAyahTap = vi.fn();
    await drawn({ onAyahTap });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(7);
    expect(unnamed()).toEqual([]);
    expect(misnamed()).toEqual([]);
    expect(buttons[6].getAttribute('aria-label')).toBe(
      'الآية ٧ من سورة الفاتحة — استمع إليها',
    );
    expect(ayahButtonLabel(ayahIndex(3, 7))).toBe(
      'الآية ٧ من سورة آل عمران — استمع إليها',
    );
    buttons[2].focus();
    await user.keyboard('{Enter}');
    expect(onAyahTap).toHaveBeenLastCalledWith(3, null);
  });

  it('draws no buttons when nothing listens for a tap', async () => {
    await drawn();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reports a tapped word: its ayah and which word of it', async () => {
    const user = userEvent.setup();
    const onAyahTap = vi.fn();
    await drawn({ onAyahTap });
    await user.click(word(5, 3));
    expect(onAyahTap).toHaveBeenLastCalledWith(5, 3);
    await user.click(word(7, null));
    expect(onAyahTap).toHaveBeenLastCalledWith(7, null);
  });

  it('takes a finger that moved for a swipe, not a tap', async () => {
    const onAyahTap = vi.fn();
    await drawn({ onAyahTap });
    const target = word(5, 2);
    const press = (x: number, y: number) =>
      fireEvent.pointerDown(target, {
        isPrimary: true,
        clientX: x,
        clientY: y,
      });
    const lift = (x: number, y: number) =>
      fireEvent.click(target, { detail: 1, clientX: x, clientY: y });
    press(100, 100);
    lift(140, 102); // sideways: the page turning
    press(100, 100);
    lift(100, 130); // a drag down the page
    expect(onAyahTap).not.toHaveBeenCalled();
    press(100, 100);
    lift(103, 104); // a finger's wobble
    expect(onAyahTap).toHaveBeenCalledWith(5, 2);
  });
});
