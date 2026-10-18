/* The one audio element the app plays recitations on, and what is playing.

   Two things play: a reciter seated in the circle reciting his turn, and
   «استمع», a page played by the halaqa's reciter for a reader to listen to.
   Both are a queue of segments, each a stretch of a surah recording from one
   timestamp to another (see src/data/timings.ts). A turn of two pages is two
   or more segments; a page holding the end of one surah and the start of
   the next is two.

   One element for everything, because a phone lets a page play sound only
   from an element that has already played once in answer to a tap. `prime()`
   plays a moment of silence on it from the first tap, so a reciter whose
   turn comes round on its own (a timed turn ending, another reciter
   finishing) can start without anyone touching the screen. When a browser
   refuses anyway the status says `blocked`, and the next tap plays.

   Framework-free, so it can be tested with a fake element; React reads it
   through `useSyncExternalStore` (see useRecitation.ts). */

import type { Segment } from '@/data/timings';

export type PlayerStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  /** The browser would not start sound without a tap. */
  | 'blocked'
  | 'error'
  /** The queue played to its end. */
  | 'ended';

export type PlayerState = {
  /** Who started what is playing; the caller decides what a key means and
      only ever acts on a state carrying its own. */
  key: string;
  status: PlayerStatus;
  /** The page being recited. */
  page: number;
  /** Milliseconds played and in all, over the whole queue. */
  played: number;
  total: number;
};

/** Where a recitation is in its recording (see `Player.position()`). */
export type Position = {
  /** The key of the recitation, as in `PlayerState`. */
  key: string;
  /** The recording playing, and the page its stretch recites. */
  url: string;
  page: number;
  /** Milliseconds into the recording: the file's own time. */
  ms: number;
};

export type Meta = { title: string; artist: string; artwork?: string };

/** The part of an audio element the player uses. */
export type Media = Pick<
  HTMLMediaElement,
  | 'src'
  | 'currentTime'
  | 'playbackRate'
  | 'defaultPlaybackRate'
  | 'readyState'
  | 'ended'
  | 'paused'
  | 'preload'
  | 'play'
  | 'pause'
  | 'addEventListener'
>;

const IDLE: PlayerState = {
  key: '',
  status: 'idle',
  page: 0,
  played: 0,
  total: 0,
};

/** Two stretches of the same recording this close are played as one. The
    next page usually starts where the last ended, and seeking there would
    only stutter; a gap of a breath is played through rather than cut; and
    where a reciter's timestamps overlap (the next page's first ayah said to
    begin before the last one ends, as one recording's data has it), seeking
    back would say the overlap twice. */
const SEAMLESS_MS = 3000;
/** How far back an overlap can reach and still be one. An overlap also
    starts after the stretch before it starts: one that starts no later is
    that stretch, or an earlier one, again (a page or an ayah repeated),
    however short, and must seek. */
const OVERLAP_MS = 10_000;
/** How long a recording may load with nothing arriving before it counts
    as failed. A browser announces data as it comes, several times a
    second, so this long without a byte is a connection that is gone; a
    slow one keeps resetting it. Without it a turn whose connection died
    mid-stretch would say «جارٍ تحميل التلاوة» for ever, and never offer
    to try again. */
const STALL_MS = 20_000;

export class Player {
  private media: Media | null = null;
  private queue: Segment[] = [];
  private at = 0;
  private state: PlayerState = IDLE;
  private listeners = new Set<() => void>();
  private onPage: ((page: number) => void) | undefined;
  private onDone: (() => void) | undefined;
  /** A position to seek to once the recording's length is known. */
  private pendingSeek: number | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private stallTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where in the recording it was when it failed, to try again from. */
  private failedAt: number | null = null;
  private primed = false;
  private rate = 1;
  private meta: Meta | undefined;
  private artwork = true;

  /**
   * `create` makes the element, on first use. A player with `session`
   * false (one for samples) keeps off the lock screen, which belongs to
   * the halaqa's own recitation.
   */
  constructor(
    private readonly create: () => Media,
    private readonly options: { session?: boolean } = {},
  ) {}

  private get session() {
    return this.options.session ?? true;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  /**
   * Plays `queue` from its first segment on `start` (or its first), replacing
   * whatever was playing. `onPage` hears each new page as the recitation
   * reaches it, and `onDone` the end of the queue.
   */
  play(
    key: string,
    queue: Segment[],
    options: {
      start?: number;
      onPage?: (page: number) => void;
      onDone?: () => void;
      meta?: Meta;
    } = {},
  ) {
    this.clearTimer();
    this.queue = queue;
    this.onPage = options.onPage;
    this.onDone = options.onDone;
    const total = queue.reduce((sum, s) => sum + (s.to - s.from), 0);
    const first = Math.max(
      0,
      queue.findIndex((s) => s.page === options.start),
    );
    this.set({
      key,
      status: 'loading',
      page: queue[first]?.page ?? 0,
      played: this.playedBefore(first),
      total,
    });
    if (queue.length === 0) return this.finish();
    this.meta = options.meta;
    if (this.session) setMediaSession(this.meta, this.artwork, this);
    this.load(first);
  }

  /**
   * Where the recitation is in its recording, for marking the ayah, or the
   * word, being recited: the stretch playing and the milliseconds into its
   * file. Null unless it is reciting (playing, or waiting for more of the
   * file mid-stretch), and while a new file loads, since the element still
   * reports the old file's time until then.
   *
   * The time is the file's own at any speed. `currentTime` is a place in
   * the recording, and at 1.25 the element only reaches each place sooner;
   * timings name places in the recording, so the two compare as they are.
   * Only a span on the clock, as the stop timer's, is divided by the rate.
   *
   * Kept inside the stretch: at its end the element can read a little past
   * it before the player moves on, which is the ayah after the stretch,
   * not one being recited.
   */
  position(): Position | null {
    const media = this.media;
    const segment = this.queue[this.at];
    const { key, status } = this.state;
    if (!media || !segment || this.pendingSeek !== null) return null;
    if (status !== 'playing' && status !== 'loading') return null;
    const ms = media.currentTime * 1000;
    return {
      key,
      url: segment.url,
      page: segment.page,
      ms: Math.max(segment.from, Math.min(ms, segment.to - 1)),
    };
  }

  /** Carries on from where it paused, or tries again after a refusal or
      a failure. */
  resume() {
    const media = this.element();
    if (!this.queue.length) return;
    if (this.state.status === 'error')
      return this.load(this.at, true, this.failedAt ?? undefined, true);
    this.set({ status: 'loading' });
    this.start(media);
  }

  pause() {
    if (!this.queue.length || this.state.status === 'ended') return;
    this.clearTimer();
    this.media?.pause();
    this.set({ status: 'paused' });
  }

  /** Stops, if what is playing is `key`'s (or anything, with no key). */
  stop(key?: string) {
    if (key !== undefined && key !== this.state.key) return;
    this.clearTimer();
    this.queue = [];
    this.onPage = this.onDone = undefined;
    this.media?.pause();
    this.set(IDLE);
  }

  /** Moves to the first segment of `page`, keeping the play state. */
  seekPage(page: number) {
    const i = this.queue.findIndex((s) => s.page === page);
    if (i === -1 || i === this.at) return;
    const paused = this.state.status === 'paused';
    this.set({ page, played: this.playedBefore(i) });
    this.load(i, !paused);
  }

  /** Plays at `rate` from now on, this recitation and the next. The
      browser keeps the voice's pitch. */
  setRate(rate: number) {
    this.rate = rate;
    if (!this.media) return;
    this.media.defaultPlaybackRate = rate;
    this.media.playbackRate = rate;
    this.tick();
  }

  /** Whether the lock screen may show the reciter's photo; changing it
      changes what is already showing. */
  setArtwork(shown: boolean) {
    this.artwork = shown;
    if (this.session && this.queue.length)
      setMediaSession(this.meta, shown, this);
  }

  /** Unlocks the element for sound started later without a tap. Call it
      from every tap. A recitation the browser held back is the sound
      this tap was waiting for, so it starts instead, however long ago
      the element was unlocked: a browser may still refuse a recitation
      that starts on its own (a tab long in the background, a phone's
      power saving). Once the element has played, there is nothing else
      to do. */
  prime() {
    if (this.queue.length) {
      if (this.state.status === 'blocked') this.resume();
      return;
    }
    if (this.primed) return;
    const media = this.element();
    media.src = silence();
    media.play().then(
      () => {
        this.primed = true;
        if (!this.queue.length) media.pause();
      },
      () => {},
    );
  }

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    if (patch.status) this.watch();
    for (const listener of this.listeners) listener();
    if (patch.status && this.session) setPlaybackState(patch.status);
  }

  /** Waits for a loading recording, and gives up on it if nothing arrives
      for too long (see STALL_MS). Called on every change of status and
      every arrival of data; only `loading` is watched. */
  private watch() {
    clearTimeout(this.stallTimer);
    this.stallTimer = undefined;
    if (this.state.status !== 'loading') return;
    this.stallTimer = setTimeout(() => {
      if (this.state.status === 'loading' && this.queue.length) this.fail();
    }, STALL_MS);
  }

  /** The recording would not play: says so, and remembers where it was,
      so that trying again carries on from there. */
  private fail() {
    this.clearTimer();
    this.failedAt = this.recordingMs() ?? null;
    this.set({ status: 'error' });
  }

  /** Milliseconds into the recording of the stretch now playing: where
      the element is, or where it is about to be once a new file loads. */
  private recordingMs() {
    const segment = this.queue[this.at];
    if (!segment) return undefined;
    const ms =
      this.pendingSeek !== null
        ? this.pendingSeek * 1000
        : (this.media?.currentTime ?? 0) * 1000;
    return Math.min(Math.max(ms, segment.from), segment.to);
  }

  private element(): Media {
    if (this.media) return this.media;
    const media = this.create();
    media.preload = 'auto';
    // Setting a source resets the rate to the default, so both are set.
    media.defaultPlaybackRate = this.rate;
    media.playbackRate = this.rate;
    // Events from the silence `prime()` plays, or from a queue just
    // stopped, find nothing queued and are ignored.
    media.addEventListener('timeupdate', () => this.tick());
    media.addEventListener('ended', () => this.queue.length && this.advance());
    media.addEventListener('playing', () => {
      this.primed = true;
      // An event queued as playback began can arrive after a pause that
      // came in between, and the element is silent by then.
      if (this.queue.length && !media.paused) this.set({ status: 'playing' });
      this.tick();
    });
    media.addEventListener('pause', () => {
      // Paused by something other than this player: the system, a headset
      // unplugged, another app's sound. A pause on the way to the next
      // file, or at the end of one, is the player's own.
      const sounding =
        this.state.status === 'playing' || this.state.status === 'loading';
      if (
        this.queue.length &&
        sounding &&
        this.pendingSeek === null &&
        !media.ended
      ) {
        this.clearTimer();
        this.set({ status: 'paused' });
      }
    });
    media.addEventListener('waiting', () => {
      if (this.queue.length && this.state.status === 'playing')
        this.set({ status: 'loading' });
    });
    // More of the file has arrived: a slow connection, not a dead one.
    media.addEventListener('progress', () => this.watch());
    media.addEventListener('loadedmetadata', () => {
      if (this.pendingSeek === null) return;
      media.currentTime = this.pendingSeek;
      this.pendingSeek = null;
    });
    media.addEventListener('error', () => {
      if (this.queue.length) this.fail();
    });
    this.media = media;
    return media;
  }

  /**
   * Plays segment `i`, from its start or from `ms` into the recording.
   * `fresh` fetches the file again even if it is the one loaded: an
   * element that failed on a file will not play it again until it does.
   */
  private load(i: number, autoplay = true, ms?: number, fresh = false) {
    const media = this.element();
    const segment = this.queue[i];
    const from = ms ?? segment.from;
    this.at = i;
    this.failedAt = null;
    this.clearTimer();
    this.set({
      played:
        this.playedBefore(i) +
        Math.min(Math.max(from - segment.from, 0), segment.to - segment.from),
    });
    if (!fresh && sameFile(media.src, segment.url) && media.readyState >= 1) {
      this.pendingSeek = null;
      media.currentTime = from / 1000;
    } else {
      // Until the new file's metadata is in, its position cannot be set,
      // and the element still reports the old file's.
      this.pendingSeek = from / 1000;
      media.src = segment.url;
    }
    if (autoplay) {
      this.set({ status: 'loading' });
      this.start(media);
    }
  }

  private start(media: Media) {
    const key = this.state.key;
    media.play().then(
      () => {
        this.primed = true;
        if (this.state.key === key && this.queue.length)
          this.set({ status: 'playing' });
      },
      (error: unknown) => {
        if (this.state.key !== key || !this.queue.length) return;
        const name = error instanceof Error ? error.name : '';
        // A play cut short by a pause or a new source is not a failure.
        if (name === 'AbortError') return;
        if (name === 'NotAllowedError') this.set({ status: 'blocked' });
        else this.fail();
      },
    );
  }

  /** On every position update: the time played, and whether the current
      stretch is over. */
  private tick() {
    const media = this.media;
    const segment = this.queue[this.at];
    if (!media || !segment || this.pendingSeek !== null) return;
    if (this.state.status === 'paused' || this.state.status === 'ended') return;
    const ms = media.currentTime * 1000;
    if (ms >= segment.to - 20) return this.advance();
    const into = Math.min(
      Math.max(ms - segment.from, 0),
      segment.to - segment.from,
    );
    this.set({ played: this.playedBefore(this.at) + into });
    // Position updates come four times a second at best; a timer stops the
    // stretch on its last word rather than up to a quarter second into the
    // next ayah.
    this.clearTimer();
    if (this.state.status === 'playing')
      this.stopTimer = setTimeout(
        () => this.tick(),
        (segment.to - ms) / this.rate,
      );
  }

  private advance() {
    const current = this.queue[this.at];
    const next = this.queue[this.at + 1];
    this.clearTimer();
    if (!next) return this.finish();
    const gap = next.from - current.to;
    const seamless =
      sameFile(next.url, current.url) &&
      next.from > current.from &&
      gap < SEAMLESS_MS &&
      gap > -OVERLAP_MS;
    if (next.page !== current.page) {
      this.set({ page: next.page });
      this.onPage?.(next.page);
    }
    if (seamless) {
      this.at += 1;
      this.tick();
    } else this.load(this.at + 1);
  }

  private finish() {
    this.media?.pause();
    const done = this.onDone;
    this.queue = [];
    this.onPage = this.onDone = undefined;
    this.set({ status: 'ended', played: this.state.total });
    done?.();
  }

  private playedBefore(i: number) {
    let sum = 0;
    for (let j = 0; j < i; j++) sum += this.queue[j].to - this.queue[j].from;
    return sum;
  }

  private clearTimer() {
    clearTimeout(this.stopTimer);
    this.stopTimer = undefined;
  }
}

/** Whether an element's `src` (always absolute once set) is `url`. */
const sameFile = (src: string, url: string) =>
  src === url || src.endsWith(url.replace(/^https?:/, ''));

/** The lock screen's and the headphones' controls, where there are any. */
function setMediaSession(
  meta: Meta | undefined,
  artwork: boolean,
  player: Player,
) {
  if (!meta || typeof navigator === 'undefined' || !navigator.mediaSession)
    return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist,
      album: 'مجلس نور',
      artwork: artwork && meta.artwork ? [{ src: meta.artwork }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => player.resume());
    navigator.mediaSession.setActionHandler('pause', () => player.pause());
  } catch {
    // An older browser with half the API: the recitation plays regardless.
  }
}

/** Whether the system shows a recitation as playing, paused, or nothing.
    One that failed stays, as paused: its play button tries it again, as
    the reciter's button does, and clearing it would leave the retry
    playing with nothing on the lock screen, since only `play()` sets what
    it shows. */
function setPlaybackState(status: PlayerStatus) {
  if (typeof navigator === 'undefined' || !navigator.mediaSession) return;
  const session = navigator.mediaSession;
  if (status === 'playing' || status === 'loading')
    session.playbackState = 'playing';
  else if (status === 'paused' || status === 'blocked' || status === 'error')
    session.playbackState = 'paused';
  else {
    session.playbackState = 'none';
    session.metadata = null;
  }
}

let silent: string | undefined;

/** A tenth of a second of silence as a WAV, made once. */
function silence() {
  if (silent) return silent;
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // samples a second
  view.setUint32(28, 8000, true); // bytes a second
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // bits a sample
  text(36, 'data');
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // the midpoint of unsigned 8-bit: silence
  silent = `data:audio/wav;base64,${btoa(String.fromCharCode(...bytes))}`;
  return silent;
}
