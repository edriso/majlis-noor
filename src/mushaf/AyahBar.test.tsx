import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeAyahWords, encodeSpans, type Span } from '@/data/audio';
import {
  ayahIndex,
  loadedPage,
  loadPage,
  pageOfAyah,
  type Page,
} from '@/data/mushaf';
import { loadWords, readWords, type Timings } from '@/data/timings';
import type { AyahStatus } from '@/halaqa/useAyahListen';
import { misnamed, unnamed } from '@/test-names';
import {
  AyahBar,
  ayahToCopy,
  COPIED,
  COPY_FAILED,
  type AyahListen,
} from './AyahBar';
import { ayahText } from './words';

vi.mock('@/data/timings', async (actual) => ({
  ...(await actual<typeof import('@/data/timings')>()),
  loadWords: vi.fn(),
}));
vi.mock('@/data/mushaf', async (actual) => ({
  ...(await actual<typeof import('@/data/mushaf')>()),
  loadedPage: vi.fn(),
  loadPage: vi.fn(),
}));

// Al Imran's first seven ayat, ten seconds each from the start of its file.
const spans: Span[] = Array.from({ length: 7 }, (_, i) => [
  i * 10_000,
  (i + 1) * 10_000,
]);
const timings: Timings = {
  audio: 'https://example.test/{n}.mp3',
  files: [],
  ayat: [[], [], encodeSpans(spans)],
  pages: [],
};
const ayah = ayahIndex(3, 7);
const once = [
  { url: 'https://example.test/3.mp3', from: 60_000, to: 70_000, page: 50 },
];

// His words in Al Imran: ayah 7's second word heard at 62.5 seconds.
const words = readWords({
  source: 'test',
  surah: 3,
  partial: [],
  ayat: spans.map((span, i) =>
    encodeAyahWords(
      span,
      i === 6
        ? [
            [1, 60_000, 62_500],
            [2, 62_500, 64_000],
          ]
        : [],
    ),
  ),
});

function listening(status: AyahStatus = 'idle', id: string | null = null) {
  return {
    id,
    status,
    play: vi.fn(),
    stop: vi.fn(),
  } satisfies AyahListen;
}

function bar(
  props: Partial<Parameters<typeof AyahBar>[0]> = {},
  listen = listening(),
) {
  const onClose = vi.fn();
  const view = render(
    <AyahBar
      ayah={ayah}
      reciter="husary"
      timings={timings}
      listen={listen}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...view, onClose, listen };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.mocked(loadWords).mockReset().mockResolvedValue(words);
});

describe('the ayah bar', () => {
  it('names its ayah, takes the focus, and names every button by its words', () => {
    bar();
    expect(screen.getByRole('region', { name: 'الآية ٧ · آل عمران' }));
    expect(document.activeElement).toBe(button('استمع'));
    expect(unnamed()).toEqual([]);
    expect(misnamed()).toEqual([]);
  });

  it('recites the ayah once, or three times over', async () => {
    const user = userEvent.setup();
    const { listen } = bar();
    expect(pageOfAyah(ayah)).toBe(50);
    await user.click(button('استمع'));
    expect(listen.play).toHaveBeenLastCalledWith('3:7', once);
    await user.click(button('كرّر ٣ مرات'));
    expect(listen.play).toHaveBeenLastCalledWith('3:7×3', once, { times: 3 });
  });

  it('stops what it plays from the same button', async () => {
    const user = userEvent.setup();
    const { listen } = bar({}, listening('playing', '3:7×3'));
    expect(button('استمع'));
    await user.click(button('أوقف'));
    expect(listen.stop).toHaveBeenCalled();
    expect(listen.play).not.toHaveBeenCalled();
  });

  it('says what it is doing, and when it could not', () => {
    const { rerender, onClose } = bar({}, listening('loading', '3:7'));
    expect(screen.getByText('جارٍ التحميل…'));
    rerender(
      <AyahBar
        ayah={ayah}
        reciter="husary"
        timings={timings}
        listen={listening('error', '3:7')}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('تعذّر تشغيل الآية'));
  });

  it('pays no mind to another ayah playing', () => {
    bar({}, listening('playing', '3:8'));
    expect(button('استمع'));
    expect(screen.queryByRole('button', { name: 'أوقف' })).toBeNull();
  });

  it('says so where the sheikh’s recording of the ayah cannot be played', () => {
    bar({ timings: { ...timings, misplaced: [ayah] } });
    expect(screen.getByText('لا تتوفّر تلاوة هذه الآية بصوت الشيخ الحصري'));
    expect(screen.queryByRole('button', { name: 'استمع' })).toBeNull();
    // The focus goes to the one button left.
    expect(document.activeElement).toBe(button('إغلاق'));
  });

  it('waits for the sheikh’s timings, and says when they will not come', () => {
    const { rerender, listen, onClose } = bar({ timings: undefined });
    expect(button('استمع').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('جارٍ تحميل التلاوة…'));
    fireEvent.click(button('استمع'));
    expect(listen.play).not.toHaveBeenCalled();
    rerender(
      <AyahBar
        ayah={ayah}
        reciter="husary"
        timings={null}
        listen={listen}
        onClose={onClose}
      />,
    );
    expect(screen.getByText('تعذّر تحميل تلاوة الشيخ الحصري'));
  });

  it('recites from the word tapped, where the sheikh times it', async () => {
    const user = userEvent.setup();
    const { listen } = bar({ word: 2 });
    await user.click(
      await screen.findByRole('button', { name: 'من هذه الكلمة' }),
    );
    expect(loadWords).toHaveBeenCalledWith('husary', 3);
    expect(listen.play).toHaveBeenLastCalledWith('3:7@2', [
      { ...once[0], from: 62_500 },
    ]);
  });

  it('offers no word without one tapped, or one he does not time', async () => {
    bar();
    bar({ word: 5 });
    await waitFor(() => expect(loadWords).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(screen.queryByRole('button', { name: 'من هذه الكلمة' })).toBeNull();
  });

  it('closes on Escape, stopping its ayah, and gives the focus back', async () => {
    const user = userEvent.setup();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { onClose, listen } = bar({}, listening('playing', '3:7'));
    expect(document.activeElement).not.toBe(opener);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    expect(listen.stop).toHaveBeenCalled();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('closes on a tap outside it, but not on another word of the page', () => {
    const page = document.createElement('div');
    page.className = 'mushaf-lines';
    page.innerHTML = '<span data-ayah="301" data-word="2">ﱁ</span>';
    document.body.append(page);
    const { onClose, listen } = bar();
    fireEvent.pointerDown(button('استمع'));
    fireEvent.pointerDown(page.firstElementChild!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    // Nothing of its own was playing, so nothing is stopped.
    expect(listen.stop).not.toHaveBeenCalled();
    page.remove();
  });
});

describe('«انسخ الآية»', () => {
  // Page 50 as it is, which holds Al Imran 7.
  const page50 = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '../../public/pages/50.json'),
      'utf8',
    ),
  ) as Page;
  const text = `${ayahText(page50, ayah)} [آل عمران: ٧]`;
  /** A clipboard that answers as given, or none at all; its writeText. */
  const clipboard = (answer?: () => Promise<void>) => {
    const writeText = vi.fn(answer);
    Object.defineProperty(navigator, 'clipboard', {
      value: answer ? { writeText } : undefined,
      configurable: true,
    });
    return writeText;
  };

  beforeEach(() => {
    vi.mocked(loadedPage).mockReset().mockReturnValue(page50);
    vi.mocked(loadPage).mockReset().mockResolvedValue(page50);
  });

  it('copies the ayah’s text and where it is, and says so', async () => {
    const writeText = clipboard(() => Promise.resolve());
    const { listen } = bar();
    // Compared composed: the Mushaf's text writes آ as ا and its madda.
    expect(text.normalize()).toMatch(
      new RegExp(`^${'هُوَ ٱلَّذِىٓ'.normalize()} .* ﴿٧﴾ \\[آل عمران: ٧\\]$`),
    );
    expect(ayahToCopy(page50, ayah)).toBe(text);
    fireEvent.click(button('انسخ الآية'));
    expect(writeText).toHaveBeenCalledWith(text);
    expect(await screen.findByText(COPIED));
    // Whatever the reader does next, the bar's note is its own again.
    fireEvent.click(button('استمع'));
    expect(listen.play).toHaveBeenCalled();
    expect(screen.queryByText(COPIED)).toBeNull();
  });

  it('waits for the ayah’s page where it is not in yet', async () => {
    const writeText = clipboard(() => Promise.resolve());
    vi.mocked(loadedPage).mockReturnValue(undefined);
    bar();
    fireEvent.click(button('انسخ الآية'));
    expect(await screen.findByText(COPIED));
    expect(loadPage).toHaveBeenCalledWith(50);
    expect(writeText).toHaveBeenCalledWith(text);
  });

  it('says how to copy it by hand where the clipboard will not take it', async () => {
    clipboard(() => Promise.reject(new Error('denied')));
    const first = bar();
    fireEvent.click(button('انسخ الآية'));
    expect(await screen.findByText(COPY_FAILED));
    first.unmount();
    clipboard(); // none at all: a page not served securely
    bar();
    fireEvent.click(button('انسخ الآية'));
    expect(await screen.findByText(COPY_FAILED));
  });

  it('is there where the sheikh’s recitation is not', () => {
    bar({ timings: null });
    expect(button('انسخ الآية'));
  });
});
