import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encodeAyahWords,
  encodeSpans,
  type Span,
  type WordSpan,
} from '@/data/audio';
import { ayahIndex } from '@/data/mushaf';
import { loadWords, readWords, type Timings } from '@/data/timings';
import { FakeMedia } from '@/halaqa/fakeMedia';
import { player } from '@/halaqa/useRecitation';
import { LEAD_MS, recitedAt, surahOfUrl, useFollow } from './useFollow';

vi.mock('@/data/timings', async (actual) => ({
  ...(await actual<typeof import('@/data/timings')>()),
  loadWords: vi.fn(),
}));

const media = new FakeMedia();
vi.stubGlobal('Audio', function Audio() {
  return media;
});

// Al-Fatihah as one reciter recites it: a pause between ayat 2 and 3.
const spans: Span[] = [
  [1000, 5000],
  [5000, 9000],
  [9500, 13000],
  [13000, 16000],
  [16000, 20000],
  [20000, 24000],
  [24000, 32000],
];
const timings: Timings = {
  audio: 'https://example.test/{nnn}.mp3',
  files: [],
  ayat: [encodeSpans(spans)],
  pages: [],
};
const url = 'https://example.test/001.mp3';

// His words: every word of ayah 2 heard, one going back to take up word 2
// again; ayah 3 missing its last word.
const heard: WordSpan[][] = [
  [
    [1, 1000, 2000],
    [2, 2000, 3000],
    [3, 3000, 4000],
    [4, 4000, 5000],
  ],
  [
    [1, 5000, 6000],
    [2, 6000, 7000],
    [2, 7200, 8000],
    [3, 8000, 8600],
    [4, 8600, 9000],
  ],
  [[1, 9800, 11000]],
];
const words = readWords({
  source: 'test',
  surah: 1,
  partial: [3],
  ayat: heard.map((w, i) => encodeAyahWords(spans[i], w)),
});

describe('recitedAt', () => {
  it('names the ayah being recited, by its number through the Mushaf', () => {
    expect(recitedAt(timings, 1, 2000)).toEqual({ ayah: 1, word: null });
    expect(recitedAt(timings, 1, 25_000)).toEqual({ ayah: 7, word: null });
  });

  it('leads the voice a little', () => {
    expect(recitedAt(timings, 1, 5000 - LEAD_MS)).toEqual({
      ayah: 2,
      word: null,
    });
    expect(recitedAt(timings, 1, 5000 - LEAD_MS - 1)?.ayah).toBe(1);
  });

  it('keeps the ayah just recited through the pause after it', () => {
    expect(recitedAt(timings, 1, 9200)?.ayah).toBe(2);
  });

  it('marks nothing before the first ayah or after the last', () => {
    expect(recitedAt(timings, 1, 0)).toBeNull();
    expect(recitedAt(timings, 1, 40_000)).toBeNull();
  });

  it('marks nothing in a surah or an ayah the file does not fit', () => {
    expect(recitedAt({ ...timings, untimed: [1] }, 1, 2000)).toBeNull();
    expect(recitedAt({ ...timings, misplaced: [2] }, 1, 6000)).toBeNull();
  });

  it('keeps the lead inside the ayat being played', () => {
    const within = { from: 1, to: 2 };
    // Ayah 1 alone: in its last moment the lead would reach ayah 2.
    expect(recitedAt(timings, 1, 4900, null, within)?.ayah).toBe(1);
    expect(recitedAt(timings, 1, 4900)?.ayah).toBe(2);
    expect(recitedAt(timings, 1, 6000, null, within)).toBeNull();
  });

  it('follows the word, found by time, where the ayah is timed whole', () => {
    expect(recitedAt(timings, 1, 6500 - LEAD_MS, words)).toEqual({
      ayah: 2,
      word: 2,
    });
    // Taken up again after a breath: word 2 a second time, and between
    // the two, the word last heard.
    expect(recitedAt(timings, 1, 7050 - LEAD_MS, words)?.word).toBe(2);
    expect(recitedAt(timings, 1, 7500 - LEAD_MS, words)?.word).toBe(2);
    expect(recitedAt(timings, 1, 8100 - LEAD_MS, words)?.word).toBe(3);
  });

  it('marks the ayah whole where its words are not all timed', () => {
    expect(recitedAt(timings, 1, 10_000, words)).toEqual({
      ayah: 3,
      word: null,
    });
  });

  it('gives an ayah’s first word before it is heard', () => {
    // The ayah has begun (with the lead) but its first word not yet.
    expect(recitedAt(timings, 1, 4900, words)).toEqual({ ayah: 2, word: 1 });
  });

  it('ignores words of another surah', () => {
    expect(recitedAt(timings, 1, 6500, { ...words, surah: 2 })?.word).toBe(
      null,
    );
  });

  it('counts ayat through the Mushaf in any surah', () => {
    const t = { ...timings, ayat: [[], encodeSpans(spans)] };
    expect(recitedAt(t, 2, 2000)?.ayah).toBe(ayahIndex(2, 1));
  });
});

describe('surahOfUrl', () => {
  it('finds the surah of a file by the reciter’s address', () => {
    expect(surahOfUrl(timings, url)).toBe(1);
    expect(surahOfUrl(timings, 'https://example.test/114.mp3')).toBe(114);
    expect(surahOfUrl(timings, 'https://elsewhere.test/1.mp3')).toBeNull();
  });
});

describe('useFollow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(loadWords).mockReset().mockResolvedValue(words);
  });
  afterEach(() => {
    act(() => player.stop());
    vi.useRealTimers();
  });

  const reciting = async (key: string, from = 1000) => {
    act(() => player.play(key, [{ url, from, to: 32_000, page: 1 }]));
    act(() => media.load());
    await act(() => vi.advanceTimersByTimeAsync(0));
  };
  const at = async (ms: number) => {
    media.currentTime = ms / 1000;
    await act(() => vi.advanceTimersByTimeAsync(16));
  };

  it('follows the ayah, the same object until it changes', async () => {
    await reciting('listen:1');
    const { result } = renderHook(() =>
      useFollow({ key: 'listen:1', reciter: 'x', timings, follow: 'ayah' }),
    );
    expect(result.current).toEqual({ ayah: 1, word: null });
    const first = result.current;
    await at(2000);
    await at(3000);
    expect(result.current).toBe(first);
    await at(6000);
    expect(result.current).toEqual({ ayah: 2, word: null });
    expect(loadWords).not.toHaveBeenCalled();
  });

  it('follows the word once the reciter’s words are in', async () => {
    await reciting('turn:1', 5000);
    const { result } = renderHook(() =>
      useFollow({ key: 'turn:1', reciter: 'x', timings, follow: 'word' }),
    );
    // The ayah whole while his words load.
    expect(result.current).toEqual({ ayah: 2, word: null });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(loadWords).toHaveBeenCalledWith('x', 1);
    expect(result.current).toEqual({ ayah: 2, word: 1 });
    await at(6200);
    expect(result.current).toEqual({ ayah: 2, word: 2 });
  });

  it('follows only its own recitation, and nothing while paused', async () => {
    await reciting('listen:1');
    const other = renderHook(() =>
      useFollow({ key: 'turn:9', reciter: 'x', timings, follow: 'ayah' }),
    );
    expect(other.result.current).toBeNull();
    const own = renderHook(() =>
      useFollow({ key: 'listen:1', reciter: 'x', timings, follow: 'ayah' }),
    );
    expect(own.result.current).not.toBeNull();
    act(() => player.pause());
    expect(own.result.current).toBeNull();
  });

  it('follows nothing without a key or timings', async () => {
    await reciting('listen:1');
    for (const props of [
      { key: null, timings },
      { key: '', timings },
      { key: 'listen:1', timings: undefined },
    ]) {
      const { result } = renderHook(() =>
        useFollow({ ...props, reciter: 'x', follow: 'ayah' }),
      );
      expect(result.current).toBeNull();
    }
  });
});
