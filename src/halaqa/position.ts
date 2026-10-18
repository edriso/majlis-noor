/* The place in its recording of whatever the halaqa's player recites, read
   on every frame for whoever marks the ayah, or the word, being recited.

   The element announces its position about four times a second, which is
   enough for a clock and too coarse for a word: a short word lasts less
   than that. So while someone follows the position and the recitation
   plays, the element's own time is read once a frame, and its followers
   hear of each change. Nobody following, or nothing playing, and nothing
   runs at all: the player's own announcements wake it when it plays again.

   Framework-free like the player, so it is tested with a fake element and
   fake frames; React reads it through `useSyncExternalStore` (see
   usePlaybackPosition.ts). */

import type { Player, Position } from './player';

/** How the next frame is asked for: the screen's, or a test's. */
export type Frames = {
  request: (callback: () => void) => number;
  cancel: (id: number) => void;
};

const screen: Frames = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

export class PositionFeed {
  private listeners = new Set<() => void>();
  private snapshot: Position | null = null;
  private frame: number | null = null;
  private unwatch: (() => void) | null = null;

  constructor(
    private readonly player: Pick<
      Player,
      'subscribe' | 'getState' | 'position'
    >,
    private readonly frames: Frames = screen,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.unwatch) {
      this.unwatch = this.player.subscribe(this.read);
      this.read();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.unwatch?.();
      this.unwatch = null;
      this.stop();
      this.snapshot = null;
    };
  };

  /** The position as last read, the same object until it moves. */
  getSnapshot = () => this.snapshot;

  /** Reads the position, tells the followers if it moved, and keeps reading
      on every frame while the recitation plays. Also the player's
      listener, so a pause, a new stretch or a new recitation is read the
      moment it happens. */
  private read = () => {
    const next = this.player.position();
    if (!same(next, this.snapshot)) {
      this.snapshot = next;
      for (const listener of this.listeners) listener();
    }
    if (this.player.getState().status === 'playing') this.next();
    else this.stop();
  };

  private next() {
    if (this.frame !== null) return;
    this.frame = this.frames.request(() => {
      this.frame = null;
      this.read();
    });
  }

  private stop() {
    if (this.frame === null) return;
    this.frames.cancel(this.frame);
    this.frame = null;
  }
}

const same = (a: Position | null, b: Position | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.key === b.key &&
    a.url === b.url &&
    a.page === b.page &&
    a.ms === b.ms);
