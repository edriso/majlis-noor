/* An audio element for tests, which plays only when told: the test moves
   time. Shared by the player's tests and the tests of the hooks built on
   it, so all of them meet the same element.

   It keeps the few habits of a real one the player depends on: a new
   source has nothing to play until `load()` says its metadata arrived;
   `play()` settles only then, a moment after, and a pause or a new
   source before it does cuts it short with an `AbortError` and no
   `playing`; and a pause of something playing is announced by a `pause`
   event a moment after, as a browser queues it. */

import type { Media } from './player';

export class FakeMedia extends EventTarget {
  private source = '';
  private starting: ((error: Error) => void) | null = null;
  private ready: (() => void) | null = null;
  currentTime = 0;
  readyState = 0;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  preload: HTMLMediaElement['preload'] = '';
  ended = false;
  paused = true;
  /** The name of the error `play()` rejects with, or null to play. */
  refuse: string | null = null;

  get src() {
    return this.source;
  }
  set src(url: string) {
    this.abort();
    this.paused = true;
    this.source = url;
    this.readyState = 0;
  }

  play() {
    if (this.refuse) {
      const error = new Error('refused');
      error.name = this.refuse;
      return Promise.reject(error);
    }
    this.paused = false;
    return new Promise<void>((resolve, reject) => {
      this.starting = reject;
      const start = () => {
        if (this.starting !== reject) return;
        this.starting = null;
        this.emit('playing');
        resolve();
      };
      if (this.readyState >= 1) void Promise.resolve().then(start);
      else this.ready = start;
    });
  }
  pause() {
    this.abort();
    if (this.paused) return;
    this.paused = true;
    void Promise.resolve().then(() => this.emit('pause'));
  }
  private abort() {
    const reject = this.starting;
    this.starting = this.ready = null;
    if (!reject) return;
    const error = new Error('interrupted');
    error.name = 'AbortError';
    reject(error);
  }
  emit(type: string) {
    this.dispatchEvent(new Event(type));
  }
  /** The file's metadata has arrived, and a play waiting for it starts. */
  load() {
    this.readyState = 1;
    this.emit('loadedmetadata');
    const start = this.ready;
    this.ready = null;
    if (start) void Promise.resolve().then(start);
  }
  /** Playback has reached `seconds`. */
  at(seconds: number) {
    this.currentTime = seconds;
    this.emit('timeupdate');
  }
  /** As the element is to the player. */
  get media() {
    return this as unknown as Media;
  }
}
