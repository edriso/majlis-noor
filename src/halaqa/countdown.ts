/* The clock of a reader's timed turn, kept outside React.

   It ticks four times a second. Kept in a component's state, every tick
   would draw the whole reading screen again, the Mushaf page with it; kept
   here, React reads it through `useSyncExternalStore`, and only what shows
   the time (`useTimeLeft`) subscribes to the ticks. The screen itself hears
   only of a pause and of the turn running out.

   A clock belongs to one turn at a time, named by a key: asked about any
   other turn, it says no time has passed and nothing is paused, so a new
   turn starts fresh and running whether or not the last one was paused.

   Time is measured between ticks rather than counted in ticks, because a
   browser slows the timers of a background tab to once a second or less,
   and a halaqa held over a video call has the call in front. */

export class Countdown {
  private key = '';
  private elapsed = 0;
  private paused = false;
  private listeners = new Set<() => void>();

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly every = 250,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Milliseconds counted in turn `key`; none in a turn it has not run. */
  elapsedIn = (key: string) => (key === this.key ? this.elapsed : 0);

  pausedIn = (key: string) => key === this.key && this.paused;

  pause(key: string) {
    this.claim(key);
    if (this.paused) return;
    this.paused = true;
    this.emit();
  }

  resume(key: string) {
    this.claim(key);
    if (!this.paused) return;
    this.paused = false;
    this.emit();
  }

  /** Counts turn `key` towards `duration`, but while paused, until the
      function it returns is called. Run again for the same turn, it
      carries on from where it was. */
  run(key: string, duration: number) {
    this.claim(key);
    let last = this.now();
    const id = setInterval(() => {
      const now = this.now();
      const gone = now - last;
      last = now;
      if (this.key !== key || this.paused || this.elapsed >= duration) return;
      this.elapsed = Math.min(duration, this.elapsed + gone);
      this.emit();
    }, this.every);
    return () => clearInterval(id);
  }

  /** Makes `key` the turn this clock belongs to, from nothing if it is a
      new one. */
  private claim(key: string) {
    if (key === this.key) return;
    this.key = key;
    this.elapsed = 0;
    this.paused = false;
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}
