import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Segment, Timings } from '@/data/timings';
import { FakeMedia } from './fakeMedia';
import { useAyahListen } from './useAyahListen';
import { player, useListen, useReciterTurn } from './useRecitation';

const made: FakeMedia[] = [];
vi.stubGlobal('Audio', function Audio() {
  const media = new FakeMedia();
  made.push(media);
  return media;
});
let media: FakeMedia;
beforeAll(() => {
  player.prime();
  media = made[0];
});
afterEach(() => {
  act(() => player.stop());
});

const settle = () => act(async () => {});
const url = 'https://example.test/2.mp3';
// Pages 2 and 3 of al-Baqarah, as one reciter recites them.
const timings: Timings = {
  audio: 'https://example.test/{n}.mp3',
  pages: [[], [[2, 0, 90_000]], [[2, 90_000, 180_000]]],
};
// Al-Baqarah 2:6, on page 2, as the caller computes it from his timings.
const ayah: Segment[] = [{ url, from: 20_000, to: 25_000, page: 2 }];

/** His turn reciting pages 2 and 3, playing, 40 seconds into the file. */
const turnAt40 = async (page = 2) => {
  const hook = renderHook(
    ({ turnKey, page }) =>
      useReciterTurn({
        reciter: 'husary',
        turnKey,
        pages: [2, 3],
        page,
        timings: { husary: timings },
        rate: 1,
        onPage: () => {},
        onDone: () => {},
        onRetry: () => {},
      }),
    { initialProps: { turnKey: '1', page } },
  );
  act(() => media.load());
  await settle();
  act(() => media.at(40));
  expect(hook.result.current.status).toBe('playing');
  return hook;
};

describe('an ayah alone', () => {
  it('pauses a reciter’s turn and carries it on where it was', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    expect(result.current).toMatchObject({ status: 'loading', id: '2:6' });
    // The turn waits, and says how long it still has.
    expect(turn.result.current).toMatchObject({
      status: 'paused',
      left: 140_000,
    });
    expect(media.currentTime).toBe(20);
    await settle();
    expect(result.current.status).toBe('playing');
    act(() => media.at(25));
    expect(result.current).toMatchObject({ status: 'idle', id: null });
    expect(media.currentTime).toBe(40);
    await settle();
    expect(turn.result.current.status).toBe('playing');
  });

  it('repeats an ayah three times, then carries the turn on', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah, { times: 3 }));
    await settle();
    for (let time = 1; time < 3; time++) {
      act(() => media.at(25));
      expect(media.currentTime).toBe(20);
      expect(result.current.status).not.toBe('idle');
      await settle();
    }
    act(() => media.at(25));
    expect(result.current.status).toBe('idle');
    expect(media.currentTime).toBe(40);
    await settle();
    expect(turn.result.current.status).toBe('playing');
  });

  it('stops half way when told, and the turn carries on', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    await settle();
    act(() => media.at(22));
    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');
    expect(media.currentTime).toBe(40);
    await settle();
    expect(turn.result.current.status).toBe('playing');
  });

  it('stops an ayah asked for in the same moment', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => {
      result.current.play('2:6', ayah);
      result.current.stop();
    });
    expect(result.current.status).toBe('idle');
    await settle();
    expect(turn.result.current.status).toBe('playing');
  });

  it('stops when the page or the turn it belongs to changes', async () => {
    const turn = await turnAt40();
    const { result, rerender } = renderHook(
      ({ scope }) => useAyahListen(scope),
      { initialProps: { scope: '1:2' } },
    );
    act(() => result.current.play('2:6', ayah));
    await settle();
    rerender({ scope: '1:3' });
    expect(result.current.status).toBe('idle');
    await settle();
    expect(turn.result.current.status).toBe('playing');
    expect(media.currentTime).toBe(40);
  });

  it('stops when the screen closes', async () => {
    const turn = await turnAt40();
    const { result, unmount } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    await settle();
    unmount();
    await settle();
    expect(turn.result.current.status).toBe('playing');
  });

  it('leaves the turn to carry on when the ayah will not play', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    act(() => media.emit('error'));
    expect(result.current).toMatchObject({ status: 'error', id: '2:6' });
    // The turn has not failed: it waits, and its own button carries it on.
    expect(turn.result.current).toMatchObject({
      status: 'paused',
      failed: false,
    });
    act(() => turn.result.current.toggle());
    expect(result.current.status).toBe('idle');
    // The element failed on this file, so it fetches it afresh.
    expect(media.readyState).toBe(0);
    act(() => media.load());
    expect(media.currentTime).toBe(40);
    await settle();
    expect(turn.result.current.status).toBe('playing');
  });

  it('leaves the turn to carry on when a failed ayah is closed', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    act(() => media.emit('error'));
    act(() => result.current.stop());
    act(() => media.load());
    await settle();
    expect(turn.result.current.status).toBe('playing');
    expect(media.currentTime).toBe(40);
  });

  it('ends itself when the turn’s button is pressed', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    await settle();
    act(() => turn.result.current.toggle());
    expect(result.current.status).toBe('idle');
    await settle();
    expect(turn.result.current.status).toBe('playing');
    expect(media.currentTime).toBe(40);
  });

  it('leaves a turn the reader paused paused', async () => {
    const turn = await turnAt40();
    act(() => turn.result.current.toggle());
    expect(turn.result.current.status).toBe('paused');
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    await settle();
    act(() => media.at(25));
    await settle();
    expect(turn.result.current.status).toBe('paused');
    expect(media.paused).toBe(true);
    act(() => turn.result.current.toggle());
    await settle();
    expect(turn.result.current.status).toBe('playing');
    expect(media.currentTime).toBe(40);
  });

  it('lets the turn go when it moves on during the ayah', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    await settle();
    // A reader's turn now: the reciter's hook stops his recitation.
    turn.unmount();
    act(() => media.at(25));
    expect(result.current.status).toBe('idle');
    expect(player.getState()).toMatchObject({
      key: expect.stringMatching(/^ayah:/),
      status: 'ended',
    });
  });

  it('brings the turn back on the page the reader turned to', async () => {
    const turn = await turnAt40();
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    await settle();
    turn.rerender({ turnKey: '1', page: 3 });
    act(() => result.current.stop());
    expect(player.getState()).toMatchObject({ page: 3 });
    expect(media.currentTime).toBe(90);
  });

  it('plays on a reader’s turn, with nothing to hold', async () => {
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    act(() => media.load());
    await settle();
    expect(result.current).toMatchObject({ status: 'playing', id: '2:6' });
    expect(result.current.key).toBe(player.getState().key);
    act(() => media.at(25));
    expect(result.current).toMatchObject({ status: 'idle', key: null });
  });

  it('pauses and resumes', async () => {
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    act(() => media.load());
    await settle();
    let paused = false;
    act(() => {
      paused = result.current.pause();
    });
    expect(paused).toBe(true);
    expect(result.current.status).toBe('paused');
    act(() => result.current.resume());
    await settle();
    expect(result.current.status).toBe('playing');
  });

  it('pauses «استمع» and carries it on', async () => {
    const listen = renderHook(() =>
      useListen({
        reciter: 'husary',
        turnKey: '1',
        page: 2,
        timings: { husary: timings },
        repeat: 1,
      }),
    );
    act(() => listen.result.current.toggle());
    act(() => media.load());
    await settle();
    act(() => media.at(30));
    expect(listen.result.current.status).toBe('playing');
    const { result } = renderHook(() => useAyahListen());
    act(() => result.current.play('2:6', ayah));
    expect(listen.result.current.status).toBe('paused');
    await settle();
    act(() => media.at(25));
    expect(media.currentTime).toBe(30);
    await settle();
    expect(listen.result.current.status).toBe('playing');
  });
});
