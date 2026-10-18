import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Segment } from '@/data/timings';
import { FakeMedia } from './fakeMedia';
import { Player } from './player';

const fileA = 'https://example.test/2.mp3';
const fileB = 'https://example.test/3.mp3';
// Pages 49 and 50: the end of al-Baqarah, then the start of Al Imran.
const queue: Segment[] = [
  { url: fileA, from: 10_000, to: 70_000, page: 49 },
  { url: fileA, from: 70_000, to: 90_000, page: 50 },
  { url: fileB, from: 0, to: 40_000, page: 50 },
];

let media: FakeMedia;
let player: Player;
beforeEach(() => {
  vi.useFakeTimers();
  media = new FakeMedia();
  player = new Player(() => media.media);
});
afterEach(() => vi.useRealTimers());

const flush = () => vi.advanceTimersByTimeAsync(0);

describe('the player', () => {
  it('plays a stretch from its first timestamp', async () => {
    player.play('turn', queue);
    expect(media.src).toBe(fileA);
    media.load();
    expect(media.currentTime).toBe(10);
    await flush();
    expect(player.getState()).toMatchObject({
      key: 'turn',
      status: 'playing',
      page: 49,
      total: 120_000,
    });
  });

  it('turns the page where the recitation does, without a seek', async () => {
    const pages: number[] = [];
    player.play('turn', queue, { onPage: (p) => pages.push(p) });
    media.load();
    await flush();
    media.at(40);
    expect(player.getState().played).toBe(30_000);
    media.at(70);
    expect(pages).toEqual([50]);
    expect(media.src).toBe(fileA);
    expect(player.getState()).toMatchObject({ page: 50, played: 60_000 });
  });

  it('moves to the next surah’s recording, and ends', async () => {
    const done = vi.fn();
    player.play('turn', queue, { onDone: done });
    media.load();
    await flush();
    media.at(90);
    expect(media.src).toBe(fileB);
    media.load();
    expect(media.currentTime).toBe(0);
    await flush();
    media.at(40);
    expect(done).toHaveBeenCalledOnce();
    expect(player.getState().status).toBe('ended');
    expect(media.paused).toBe(true);
  });

  it('stops on the last word, between position updates', async () => {
    const done = vi.fn();
    player.play('listen', [queue[0]], { onDone: done });
    media.load();
    await flush();
    media.at(69.8);
    expect(done).not.toHaveBeenCalled();
    media.currentTime = 70;
    await vi.advanceTimersByTimeAsync(200);
    expect(done).toHaveBeenCalledOnce();
  });

  it('starts on a later page of the turn', async () => {
    player.play('turn', queue, { start: 50 });
    media.load();
    expect(media.currentTime).toBe(70);
    expect(player.getState().played).toBe(60_000);
  });

  it('goes back a page when the reader does', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    media.at(75);
    player.seekPage(49);
    expect(media.currentTime).toBe(10);
    expect(player.getState().page).toBe(49);
  });

  it('waits for a tap when the browser refuses sound', async () => {
    media.refuse = 'NotAllowedError';
    player.play('turn', queue);
    await flush();
    expect(player.getState().status).toBe('blocked');
    media.refuse = null;
    player.resume();
    await flush();
    expect(player.getState().status).toBe('playing');
  });

  it('starts a held-back recitation on the next tap anywhere', async () => {
    media.refuse = 'NotAllowedError';
    player.play('turn', queue);
    await flush();
    expect(player.getState().status).toBe('blocked');
    media.refuse = null;
    player.prime();
    await flush();
    expect(player.getState().status).toBe('playing');
  });

  it('starts a held-back recitation on a tap after sound was unlocked', async () => {
    // The first tap of the sitting unlocked the element...
    player.prime();
    await flush();
    // ...and still a browser may refuse a turn that starts on its own,
    // after the tab was in the background for a while, say.
    media.refuse = 'NotAllowedError';
    player.play('turn', queue);
    await flush();
    expect(player.getState().status).toBe('blocked');
    media.refuse = null;
    player.prime();
    await flush();
    expect(player.getState().status).toBe('playing');
  });

  it('leaves what the reader paused paused on a tap anywhere', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    player.pause();
    player.prime();
    await flush();
    expect(player.getState().status).toBe('paused');
    expect(media.paused).toBe(true);
  });

  it('plays on through stretches whose timestamps overlap', async () => {
    const pages: number[] = [];
    player.play(
      'turn',
      [
        { url: fileA, from: 0, to: 60_000, page: 550 },
        // As one recording's data has it: the next page said to begin
        // before the last one ends.
        { url: fileA, from: 54_000, to: 90_000, page: 551 },
      ],
      { onPage: (p) => pages.push(p) },
    );
    media.load();
    await flush();
    media.at(60);
    expect(pages).toEqual([551]);
    // No seek back into what was just heard.
    expect(media.currentTime).toBe(60);
  });

  it('plays a page again from its start, as a repeated listen does', async () => {
    player.play('listen', [queue[0], queue[0]]);
    media.load();
    await flush();
    media.at(70);
    expect(media.currentTime).toBe(10);
    expect(player.getState().played).toBe(60_000);
  });

  it('plays at the speed it is set to, and stops on time at it', async () => {
    const done = vi.fn();
    player.setRate(2);
    player.play('listen', [queue[0]], { onDone: done });
    expect(media.playbackRate).toBe(2);
    expect(media.defaultPlaybackRate).toBe(2);
    media.load();
    await flush();
    media.at(69.8);
    media.currentTime = 70;
    // 200 ms of recording at double speed is 100 ms on the clock.
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toHaveBeenCalledOnce();
  });

  it('notices a pause it did not make', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    media.pause();
    media.emit('pause');
    expect(player.getState().status).toBe('paused');
  });

  it('stops only what its caller started', async () => {
    player.play('turn', queue);
    player.stop('listen');
    expect(player.getState().key).toBe('turn');
    player.stop('turn');
    expect(player.getState()).toMatchObject({ key: '', status: 'idle' });
    // Events from what was playing reach nothing.
    media.emit('ended');
    expect(player.getState().status).toBe('idle');
  });

  it('reports a recording that will not load', async () => {
    player.play('turn', queue);
    media.emit('error');
    expect(player.getState().status).toBe('error');
  });
});
