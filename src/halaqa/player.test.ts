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
    media.load();
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
    media.load();
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
    media.load();
    await flush();
    // ...and still a browser may refuse a turn that starts on its own,
    // after the tab was in the background for a while, say.
    media.refuse = 'NotAllowedError';
    player.play('turn', queue);
    media.load();
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

  it('plays a short stretch again from its start, as a repeated ayah is', async () => {
    // One ayah of five seconds, three times: each time it ends, the next
    // begins five seconds back, which is not an overlap to play through.
    const ayah: Segment = { url: fileA, from: 20_000, to: 25_000, page: 49 };
    const done = vi.fn();
    player.play('ayah', [ayah, ayah, ayah], { onDone: done });
    media.load();
    await flush();
    media.at(25);
    expect(media.currentTime).toBe(20);
    await flush();
    media.at(25);
    expect(media.currentTime).toBe(20);
    await flush();
    expect(done).not.toHaveBeenCalled();
    media.at(25);
    expect(done).toHaveBeenCalledOnce();
  });

  it('plays a few short ayat again from the first', async () => {
    const first: Segment = { url: fileA, from: 20_000, to: 24_000, page: 49 };
    const second: Segment = { url: fileA, from: 24_000, to: 27_000, page: 49 };
    player.play('ayah', [first, second, first, second]);
    media.load();
    await flush();
    // From the first into the second, played through.
    media.at(24);
    expect(media.currentTime).toBe(24);
    // From the second back to the first, sought.
    media.at(27);
    expect(media.currentTime).toBe(20);
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

  it('says where it is in the recording, and in which stretch', async () => {
    expect(player.position()).toBeNull();
    player.play('turn', queue);
    // The element still knows only the old file's time.
    expect(player.position()).toBeNull();
    media.load();
    await flush();
    media.currentTime = 12.345;
    expect(player.position()).toEqual({
      key: 'turn',
      url: fileA,
      page: 49,
      ms: 12_345,
    });
    media.at(70);
    media.currentTime = 71;
    expect(player.position()).toMatchObject({ page: 50, ms: 71_000 });
  });

  it('says where it is in the recording’s own time, at any speed', async () => {
    player.setRate(1.25);
    player.play('turn', queue);
    media.load();
    await flush();
    // Forty seconds into the file, which at 1.25 took 32 on the clock:
    // the timings name places in the file, so the file's time is wanted.
    media.currentTime = 40;
    expect(player.position()?.ms).toBe(40_000);
  });

  it('keeps the position inside the stretch playing', async () => {
    player.play('listen', [queue[0], queue[0]]);
    media.load();
    await flush();
    // A moment past the end, before the player seeks back: still the
    // stretch's last ayah, not the one after it.
    media.currentTime = 70.01;
    expect(player.position()?.ms).toBe(69_999);
  });

  it('gives no position unless it is reciting', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    media.currentTime = 20;
    player.pause();
    expect(player.position()).toBeNull();
    player.resume();
    expect(player.position()).toMatchObject({ ms: 20_000 });
    // Waiting for more of the file, still in the same place.
    media.emit('waiting');
    expect(player.position()).toMatchObject({ ms: 20_000 });
    player.stop();
    expect(player.position()).toBeNull();
  });

  it('notices a pause it did not make', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    media.pause();
    media.emit('pause');
    expect(player.getState().status).toBe('paused');
  });

  it('stays paused when news that it was playing arrives late', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    player.pause();
    // Queued by the browser as playback began, delivered after the pause.
    media.emit('playing');
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

  it('reports a recording the browser cannot play', async () => {
    media.refuse = 'NotSupportedError';
    player.play('turn', queue);
    await flush();
    expect(player.getState()).toMatchObject({ key: 'turn', status: 'error' });
  });

  it('tries a failed recording again from where it stopped', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    media.at(40);
    // The connection drops, or the file turns out damaged, mid-stretch.
    media.emit('error');
    expect(player.getState().status).toBe('error');
    player.resume();
    // Fetched afresh: an element that failed will not play its file again.
    expect(media.readyState).toBe(0);
    expect(media.src).toBe(fileA);
    media.load();
    expect(media.currentTime).toBe(40);
    await flush();
    expect(player.getState()).toMatchObject({
      status: 'playing',
      page: 49,
      played: 30_000,
    });
  });

  it('tries a recording that never loaded again from where it was to start', async () => {
    player.play('turn', queue, { start: 50 });
    media.emit('error');
    player.resume();
    media.load();
    expect(media.currentTime).toBe(70);
  });

  it('gives up on a recording that stops arriving, and not before', async () => {
    player.play('turn', queue);
    media.load();
    await flush();
    media.at(20);
    media.emit('waiting');
    expect(player.getState().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(15_000);
    // A little more of the file arrives: slow, not dead.
    media.emit('progress');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(player.getState().status).toBe('loading');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(player.getState().status).toBe('error');
  });

  it('gives up on a first load that never answers', async () => {
    player.play('turn', queue);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(player.getState()).toMatchObject({ key: 'turn', status: 'error' });
  });

  it('does not count a pause as a stall', async () => {
    player.play('turn', queue);
    player.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(player.getState().status).toBe('paused');
  });
});

describe('the lock screen', () => {
  type Session = {
    metadata: { title: string } | null;
    playbackState: string;
    handlers: Record<string, () => void>;
    setActionHandler: (action: string, handler: () => void) => void;
  };
  let session: Session;
  beforeEach(() => {
    session = {
      metadata: null,
      playbackState: 'none',
      handlers: {},
      setActionHandler(action, handler) {
        this.handlers[action] = handler;
      },
    };
    Object.defineProperty(navigator, 'mediaSession', {
      value: session,
      configurable: true,
    });
    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(init: object) {
          Object.assign(this, init);
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'mediaSession');
  });

  const meta = { title: 'سورة البقرة · الصفحة ٤٩', artist: 'الحصري' };

  it('shows the recitation, and clears when it stops', async () => {
    player.play('turn', queue, { meta });
    media.load();
    await flush();
    expect(session).toMatchObject({ playbackState: 'playing', metadata: meta });
    player.stop('turn');
    expect(session).toMatchObject({ playbackState: 'none', metadata: null });
  });

  it('keeps a failed recitation, whose play button tries it again', async () => {
    player.play('turn', queue, { meta });
    media.load();
    await flush();
    media.emit('error');
    expect(session).toMatchObject({ playbackState: 'paused', metadata: meta });
    session.handlers.play();
    media.load();
    await flush();
    expect(player.getState().status).toBe('playing');
    expect(session).toMatchObject({ playbackState: 'playing', metadata: meta });
  });
});
