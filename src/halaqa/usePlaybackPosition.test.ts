import { act, renderHook } from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { FakeMedia } from './fakeMedia';
import { usePlaybackPosition } from './usePlaybackPosition';
import { player } from './useRecitation';

const media = new FakeMedia();
vi.stubGlobal('Audio', function Audio() {
  return media;
});
beforeAll(() => {
  // Frames here are the fake timers' own, one every sixteen milliseconds.
  expect(typeof requestAnimationFrame).toBe('function');
});
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  act(() => player.stop());
  vi.useRealTimers();
});

const url = 'https://example.test/2.mp3';
const reciting = async (key = 'turn') => {
  act(() => player.play(key, [{ url, from: 10_000, to: 70_000, page: 49 }]));
  act(() => media.load());
  await act(() => vi.advanceTimersByTimeAsync(0));
};
const frame = () => act(() => vi.advanceTimersByTimeAsync(16));

describe('usePlaybackPosition', () => {
  it('follows the recitation frame by frame', async () => {
    await reciting();
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePlaybackPosition();
    });
    expect(result.current).toEqual({ key: 'turn', url, page: 49, ms: 10_000 });
    media.currentTime = 10.02;
    await frame();
    expect(result.current?.ms).toBe(10_020);
    const drawn = renders;
    // Frames in which the element has not moved draw nothing.
    await frame();
    await frame();
    expect(renders).toBe(drawn);
  });

  it('follows only the recitation it is given', async () => {
    await reciting('listen');
    let renders = 0;
    const { result } = renderHook(() => {
      renders++;
      return usePlaybackPosition('turn');
    });
    expect(result.current).toBeNull();
    media.currentTime = 11;
    await frame();
    media.currentTime = 12;
    await frame();
    expect(result.current).toBeNull();
    expect(renders).toBe(1);
  });

  it('follows nothing when told to', async () => {
    await reciting();
    const { result } = renderHook(() => usePlaybackPosition(null));
    expect(result.current).toBeNull();
  });

  it('lets go when the recitation pauses', async () => {
    await reciting();
    const { result } = renderHook(() => usePlaybackPosition());
    expect(result.current).not.toBeNull();
    act(() => player.pause());
    expect(result.current).toBeNull();
  });
});
