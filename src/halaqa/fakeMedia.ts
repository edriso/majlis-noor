/* An audio element for tests, which plays only when told: the test moves
   time. Shared by the player's tests and the tests of the hooks built on
   it, so all of them meet the same element.

   It keeps the few habits of a real one the player depends on: a new
   source has no metadata until `load()` says it arrived, `play()` settles
   later than it is called, and a pause of something playing is announced
   by a `pause` event a moment after, as a browser queues it. */

import type { Media } from './player';

export class FakeMedia extends EventTarget {
  private source = '';
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
    return Promise.resolve().then(() => this.emit('playing'));
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    void Promise.resolve().then(() => this.emit('pause'));
  }
  emit(type: string) {
    this.dispatchEvent(new Event(type));
  }
  /** The file's metadata has arrived. */
  load() {
    this.readyState = 1;
    this.emit('loadedmetadata');
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
