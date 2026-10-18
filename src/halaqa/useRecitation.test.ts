import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Timings } from '@/data/timings';
import { FakeMedia } from './fakeMedia';
import { player, useReciterTurn, useSample } from './useRecitation';

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
        pages: [2],
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
});
