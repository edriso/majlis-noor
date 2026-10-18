import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Segment } from '@/data/timings';
import { FakeMedia } from './fakeMedia';
import { Player } from './player';
import { PositionFeed, type Frames } from './position';

/** Frames that come only when the test says a frame has passed. */
class TestFrames implements Frames {
  private waiting = new Map<number, () => void>();
  private last = 0;
  request = (callback: () => void) => {
    this.waiting.set(++this.last, callback);
    return this.last;
  };
  cancel = (id: number) => {
    this.waiting.delete(id);
  };
  /** Whether anything waits for the next frame. */
  get asked() {
    return this.waiting.size > 0;
  }
  pass() {
    const callbacks = [...this.waiting.values()];
    this.waiting.clear();
    for (const callback of callbacks) callback();
  }
}

const fileA = 'https://example.test/2.mp3';
const fileB = 'https://example.test/3.mp3';
const queue: Segment[] = [
  { url: fileA, from: 10_000, to: 70_000, page: 49 },
  { url: fileB, from: 0, to: 40_000, page: 50 },
];

let media: FakeMedia;
let player: Player;
let frames: TestFrames;
let feed: PositionFeed;
beforeEach(() => {
  vi.useFakeTimers();
  media = new FakeMedia();
  player = new Player(() => media.media);
  frames = new TestFrames();
  feed = new PositionFeed(player, frames);
});
afterEach(() => vi.useRealTimers());

const flush = () => vi.advanceTimersByTimeAsync(0);
const reciting = async () => {
  player.play('turn', queue);
  media.load();
  await flush();
};

describe('the position feed', () => {
  it('reads nothing while nobody follows it', async () => {
    await reciting();
    expect(frames.asked).toBe(false);
    expect(feed.getSnapshot()).toBeNull();
  });

  it('reads nothing while nothing plays', () => {
    const unsubscribe = feed.subscribe(() => {});
    expect(frames.asked).toBe(false);
    unsubscribe();
  });

  it('reads the element’s time on every frame, and tells of each change', async () => {
    await reciting();
    const heard = vi.fn();
    feed.subscribe(heard);
    expect(feed.getSnapshot()).toMatchObject({ key: 'turn', ms: 10_000 });
    expect(frames.asked).toBe(true);
    heard.mockClear();
    // Between the element's own announcements, which come four times a
    // second: a word's worth of time, seen on the next frame.
    media.currentTime = 10.016;
    frames.pass();
    expect(feed.getSnapshot()).toEqual({
      key: 'turn',
      url: fileA,
      page: 49,
      ms: 10_016,
    });
    expect(heard).toHaveBeenCalledOnce();
    // A frame in which the element has not moved changes nothing.
    const before = feed.getSnapshot();
    frames.pass();
    expect(feed.getSnapshot()).toBe(before);
    expect(heard).toHaveBeenCalledOnce();
    expect(frames.asked).toBe(true);
  });

  it('stops reading when the recitation pauses, and starts when it plays', async () => {
    await reciting();
    feed.subscribe(() => {});
    player.pause();
    expect(frames.asked).toBe(false);
    expect(feed.getSnapshot()).toBeNull();
    player.resume();
    await flush();
    expect(frames.asked).toBe(true);
    expect(feed.getSnapshot()).toMatchObject({ ms: 10_000 });
  });

  it('stops reading when the last follower leaves', async () => {
    await reciting();
    const first = feed.subscribe(() => {});
    const second = feed.subscribe(() => {});
    first();
    expect(frames.asked).toBe(true);
    second();
    expect(frames.asked).toBe(false);
    expect(feed.getSnapshot()).toBeNull();
    // And the player no longer wakes it.
    media.at(20);
    expect(frames.asked).toBe(false);
  });

  it('follows the recitation into its next file and page', async () => {
    await reciting();
    feed.subscribe(() => {});
    media.at(70);
    // The new file's time is not known until its metadata is in.
    expect(feed.getSnapshot()).toBeNull();
    media.load();
    await flush();
    frames.pass();
    expect(feed.getSnapshot()).toEqual({
      key: 'turn',
      url: fileB,
      page: 50,
      ms: 0,
    });
  });
});
