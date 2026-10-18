import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { encodeSpans } from '@/data/audio';
import { ayahIndex, ayatOfPage } from '@/data/mushaf';
import type { Timings } from '@/data/timings';
import { FakeMedia } from './fakeMedia';
import { player, useListen, useReciterTurn, useSample } from './useRecitation';

// Every element the app makes is a fake one, in the order it makes them:
// the halaqa's player's first (made below), then the samples'.
const made: FakeMedia[] = [];
vi.stubGlobal('Audio', function Audio() {
  const media = new FakeMedia();
  made.push(media);
  return media;
});
let main: FakeMedia;
beforeAll(() => {
  player.prime();
  main = made[0];
});
afterEach(() => {
  act(() => player.stop());
});

/** The newest sample element, once a sample has been asked for. */
const sampleMedia = () => made[made.length - 1];
const settle = () => act(async () => {});

// Al-Fatiha for the samples, and page 2 for a turn.
const timings: Timings = {
  audio: 'https://example.test/{n}.mp3',
  // Playback reads only the page stretches.
  files: [],
  ayat: [],
  pages: [[[1, 0, 48_000]], [[2, 0, 90_000]]],
};

describe('a sample', () => {
  it('says so when his recording would not load', async () => {
    const { result } = renderHook(() => useSample({ husary: timings }));
    act(() => result.current.toggle('husary'));
    expect(result.current.phase('husary')).toBe('loading');
    expect(result.current.failed('husary')).toBe(false);
    act(() => sampleMedia().emit('error'));
    expect(result.current.phase('husary')).toBeUndefined();
    expect(result.current.failed('husary')).toBe(true);
    expect(result.current.failed('minshawi')).toBe(false);
  });

  it('tries again on the next press', async () => {
    const { result } = renderHook(() => useSample({ husary: timings }));
    act(() => result.current.toggle('husary'));
    act(() => sampleMedia().emit('error'));
    act(() => result.current.toggle('husary'));
    expect(result.current.phase('husary')).toBe('loading');
    expect(result.current.failed('husary')).toBe(false);
  });

  it('says so when his timings would not load', async () => {
    const { result } = renderHook(() =>
      useSample({ husary: null, minshawi: timings }),
    );
    act(() => result.current.toggle('husary'));
    expect(result.current.failed('husary')).toBe(true);
    expect(result.current.phase('husary')).toBeUndefined();
    // Another reciter's press is a new choice.
    act(() => result.current.toggle('minshawi'));
    expect(result.current.failed('husary')).toBe(false);
  });

  it('carries the halaqa’s recitation on when it fails', async () => {
    act(() =>
      player.play('turn', [
        { url: 'https://example.test/2.mp3', from: 0, to: 90_000, page: 2 },
      ]),
    );
    act(() => main.load());
    await settle();
    expect(player.getState().status).toBe('playing');
    const { result } = renderHook(() => useSample({ husary: timings }));
    act(() => result.current.toggle('husary'));
    expect(player.getState().status).toBe('paused');
    act(() => sampleMedia().emit('error'));
    expect(player.getState().status).toBe('loading');
    await settle();
    expect(player.getState().status).toBe('playing');
  });
});

describe('a reciter’s turn', () => {
  const turn = (t: Timings | null) =>
    renderHook(() =>
      useReciterTurn({
        reciter: 'husary',
        turnKey: '1',
        range: ayatOfPage(2),
        page: 2,
        timings: { husary: t },
        rate: 1,
        onPage: () => {},
        onDone: () => {},
        onRetry: () => {},
      }),
    );

  it('lets the screen offer to skip when his recording fails', async () => {
    const { result } = turn(timings);
    act(() => main.load());
    await settle();
    expect(result.current).toMatchObject({ status: 'playing', failed: false });
    act(() => main.emit('error'));
    expect(result.current).toMatchObject({ status: 'error', failed: true });
    // Trying again is the same button.
    act(() => result.current.toggle());
    expect(result.current).toMatchObject({ status: 'loading', failed: false });
  });

  it('names his recitation for following its position', async () => {
    const { result } = turn(timings);
    act(() => main.load());
    await settle();
    expect(result.current.key).toBe('turn:1:husary');
    expect(player.getState().key).toBe(result.current.key);
  });

  it('lets the screen offer to skip when his timings would not load', () => {
    const { result } = turn(null);
    expect(result.current).toMatchObject({ status: 'error', failed: true });
  });

  it('recites nothing on a page his recording does not fit, and waits', async () => {
    // As al-Sudais's an-Nisa, whose file is 99 s shorter than its timings:
    // played, it would be the wrong ayat; skipped, the circle would race on.
    const onDone = vi.fn();
    const { result } = renderHook(() =>
      useReciterTurn({
        reciter: 'husary',
        turnKey: '2',
        range: { from: ayatOfPage(1).from, to: ayatOfPage(2).to },
        page: 1,
        timings: { husary: { ...timings, untimed: [2] } },
        rate: 1,
        onPage: () => {},
        onDone,
        onRetry: () => {},
      }),
    );
    await settle();
    expect(result.current).toMatchObject({
      status: 'error',
      failed: true,
      untimed: true,
    });
    expect(player.getState().key).not.toBe(result.current.key);
    act(() => result.current.toggle());
    await settle();
    expect(player.getState().key).not.toBe(result.current.key);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('is drawn again as his recitation changes, not as it plays', async () => {
    // The screen holding the turn draws the Mushaf page; four position
    // updates a second must reach only what shows the time.
    let draws = 0;
    const { result } = renderHook(() => {
      draws++;
      return useReciterTurn({
        reciter: 'husary',
        turnKey: '3',
        range: ayatOfPage(2),
        page: 2,
        timings: { husary: timings },
        rate: 1,
        onPage: () => {},
        onDone: () => {},
        onRetry: () => {},
      });
    });
    act(() => main.load());
    await settle();
    expect(result.current.status).toBe('playing');
    const before = draws;
    for (const s of [10, 20, 30]) act(() => main.at(s));
    expect(draws).toBe(before);
    expect(result.current.time?.left()).toBe(60_000);
    expect(result.current.time?.total).toBe(90_000);
  });

  it('recites exactly a turn of ayat, and turns the page with it', async () => {
    // Al-Baqarah 4 to 7: two ayat at the foot of page 2 and two at the
    // head of page 3, each ten seconds in this recording.
    const spans = Array.from(
      { length: 20 },
      (_, i) => [i * 10_000, (i + 1) * 10_000] as [number, number],
    );
    const ayat: Timings = {
      ...timings,
      ayat: [[], encodeSpans(spans)],
      pages: [[[1, 0, 48_000]], [[2, 0, 50_000]], [[2, 50_000, 160_000]]],
    };
    const onPage = vi.fn();
    renderHook(() =>
      useReciterTurn({
        reciter: 'husary',
        turnKey: '4',
        range: { from: ayahIndex(2, 4), to: ayahIndex(2, 7) + 1 },
        page: 2,
        timings: { husary: ayat },
        rate: 1,
        onPage,
        onDone: () => {},
        onRetry: () => {},
      }),
    );
    expect(player.getState()).toMatchObject({ page: 2, total: 40_000 });
    act(() => main.load());
    await settle();
    expect(main.currentTime).toBe(30);
    act(() => main.at(50));
    expect(onPage).toHaveBeenCalledWith(3);
    expect(player.getState().page).toBe(3);
  });
});

describe('«استمع»', () => {
  it('says it cannot be heard on a page his recording does not fit', async () => {
    const { result } = renderHook(() =>
      useListen({
        reciter: 'husary',
        turnKey: '1',
        page: 2,
        range: ayatOfPage(2),
        timings: { husary: { ...timings, untimed: [2] } },
        repeat: 1,
      }),
    );
    act(() => result.current.toggle());
    await settle();
    expect(result.current.status).toBe('error');
    expect(player.getState().key).not.toBe(result.current.key);
  });
});
