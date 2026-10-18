/* How long an MP3 file plays, read from a few kilobytes of it.

   scripts/build-timings.ts and scripts/check-audio.ts measure every surah
   file this way, so that a recording that is not the one its timings were
   made from is found by its length in time, which a file's length in bytes
   or its date cannot tell.

   An MP3 is a run of frames, each of a fixed number of samples (1,152 in
   MPEG-1 Layer III, 576 in MPEG-2 and 2.5), after an ID3v2 tag and before
   an ID3v1 or APE tag. A file whose bitrate varies says how many frames it
   holds in its first one (a Xing, Info or VBRI header), and its duration is
   that many frames' samples over the sample rate. A file with no such
   header is taken to be of one bitrate, which is checked at two places
   further in, and its duration is its audio's bytes over that bitrate.
   Only Layer III is read: every recording here is one, and anything else
   is an error to look at rather than a number to trust. Lyrics3 tags are
   not looked for; no file here has one. */

/** Fetches, and tries twice more after a dropped connection: over a
    thousand requests to a free host, one or two are dropped. */
export async function fetchAgain(
  url: string,
  init?: RequestInit,
  tries = 3,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

/** Reads a file's bytes over HTTP Range requests; `head`, its first bytes
    if already fetched, saves asking for them again. */
export const rangeReader =
  (url: string, head?: Uint8Array): ReadBytes =>
  async (from, to) => {
    if (head && from === 0 && to < head.length) return head.subarray(0, to + 1);
    const res = await fetchAgain(url, {
      headers: { range: `bytes=${from}-${to}` },
    });
    if (res.status !== 206)
      throw new Error(`${url} answered ${res.status} to a range request`);
    return new Uint8Array(await res.arrayBuffer());
  };

/** How the duration was found. */
export type Measure = {
  /** Milliseconds of audio. */
  ms: number;
  /** From the first frame's frame count (`Xing`, `Info`, `VBRI`), or from
      the bytes at one bitrate (`CBR`). */
  how: 'Xing' | 'Info' | 'VBRI' | 'CBR';
  /** Bits per second of the first audio frame. */
  bitrate: number;
  sampleRate: number;
};

/** Reads bytes `from` to `to` of the file, both included, as an HTTP Range
    request names them. */
export type ReadBytes = (from: number, to: number) => Promise<Uint8Array>;

type Frame = {
  version: 1 | 2 | 2.5;
  bitrate: number;
  sampleRate: number;
  samples: number;
  length: number;
  mono: boolean;
  crc: boolean;
};

const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const SAMPLE_RATES = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
};

/** The Layer III frame whose header starts at `at`, or null if none does. */
export function frameAt(bytes: Uint8Array, at: number): Frame | null {
  if (at < 0 || at + 4 > bytes.length) return null;
  const [b0, b1, b2, b3] = bytes.subarray(at, at + 4);
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const versionBits = (b1 >> 3) & 3;
  // 01 is reserved, and layer 01 is Layer III.
  if (versionBits === 1 || ((b1 >> 1) & 3) !== 1) return null;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const bitrateIndex = b2 >> 4;
  const rateIndex = (b2 >> 2) & 3;
  // 0 is a free bitrate, whose frames cannot be measured from the header.
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const bitrate = BITRATES[version === 1 ? 1 : 2][bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  const samples = version === 1 ? 1152 : 576;
  const padding = (b2 >> 1) & 1;
  return {
    version,
    bitrate,
    sampleRate,
    samples,
    length: Math.floor((samples / 8) * (bitrate / sampleRate)) + padding,
    mono: b3 >> 6 === 3,
    crc: (b1 & 1) === 0,
  };
}

/** The first of `count` frames in a row from `from` on, each where the one
    before ends and of the same kind: a lone sync pattern in the middle of
    audio data is not a frame. */
function firstFrame(bytes: Uint8Array, from: number, count: number) {
  for (let at = from; at + 4 <= bytes.length; at++) {
    const first = frameAt(bytes, at);
    if (!first) continue;
    let next = at + first.length;
    let chained = 1;
    while (chained < count) {
      const frame = frameAt(bytes, next);
      if (
        !frame ||
        frame.version !== first.version ||
        frame.sampleRate !== first.sampleRate
      )
        break;
      next += frame.length;
      chained++;
    }
    if (chained === count) return { at, frame: first };
  }
  return null;
}

const text = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));
const uint32 = (bytes: Uint8Array, at: number) =>
  new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0);

/** Where the audio starts: after every ID3v2 tag at the head of the file. */
export function audioStart(head: Uint8Array): number {
  let at = 0;
  while (text(head, at, 3) === 'ID3' && at + 10 <= head.length) {
    const size =
      ((head[at + 6] & 0x7f) << 21) |
      ((head[at + 7] & 0x7f) << 14) |
      ((head[at + 8] & 0x7f) << 7) |
      (head[at + 9] & 0x7f);
    const footer = head[at + 5] & 0x10 ? 10 : 0;
    at += 10 + size + footer;
  }
  return at;
}

/** Bytes taken by an ID3v1 tag and an APE tag at the end of the file,
    from its last 160 bytes. */
export function trailingTags(tail: Uint8Array): number {
  let end = tail.length;
  let tags = 0;
  if (end >= 128 && text(tail, end - 128, 3) === 'TAG') {
    end -= 128;
    tags += 128;
  }
  if (end >= 32 && text(tail, end - 32, 8) === 'APETAGEX') {
    const footer = new DataView(tail.buffer, tail.byteOffset + end - 32, 32);
    // The size counts the footer and the items but not the header.
    const size = footer.getUint32(12, true);
    const header = footer.getUint32(20, true) & 0x80000000 ? 32 : 0;
    tags += size + header;
  }
  return tags;
}

/** The frame count a first frame carries, and which header carried it. */
function frameCount(bytes: Uint8Array, at: number, frame: Frame) {
  const side =
    frame.version === 1 ? (frame.mono ? 17 : 32) : frame.mono ? 9 : 17;
  const xing = at + 4 + (frame.crc ? 2 : 0) + side;
  const tag = text(bytes, xing, 4);
  if ((tag === 'Xing' || tag === 'Info') && uint32(bytes, xing + 4) & 1)
    return { how: tag, frames: uint32(bytes, xing + 8) } as const;
  // VBRI always sits 32 bytes after the frame header.
  if (text(bytes, at + 36, 4) === 'VBRI')
    return { how: 'VBRI', frames: uint32(bytes, at + 36 + 14) } as const;
  return null;
}

/** How long the MP3 file of `length` bytes plays, reading only what it
    needs of it through `read`. Throws if it cannot be told for sure. */
export async function measureMp3(
  read: ReadBytes,
  length: number,
): Promise<Measure> {
  const window = 16_384;
  let bytes = await read(0, Math.min(length, window) - 1);
  let base = 0;
  const start = audioStart(bytes);
  // A tag too big for the first read (a cover picture, say): read on from
  // where it ends.
  if (start + 4_096 > bytes.length) {
    if (start >= length) throw new Error('no audio after the ID3 tag');
    bytes = await read(start, Math.min(length, start + window) - 1);
    base = start;
  }
  const found = firstFrame(bytes, Math.max(0, start - base), 3);
  if (!found) throw new Error('no MPEG Layer III frames where audio starts');
  const { at, frame } = found;
  const measure = { bitrate: frame.bitrate, sampleRate: frame.sampleRate };

  const counted = frameCount(bytes, at, frame);
  if (counted)
    return {
      ms: Math.round(
        (counted.frames * frame.samples * 1000) / frame.sampleRate,
      ),
      how: counted.how,
      ...measure,
    };

  // No frame count: the file must be of one bitrate throughout, which two
  // places further in must bear out.
  for (const share of [1 / 3, 2 / 3]) {
    const from = Math.floor(length * share);
    const sample = await read(from, Math.min(length, from + 8_192) - 1);
    const later = firstFrame(sample, 0, 3);
    if (
      !later ||
      later.frame.bitrate !== frame.bitrate ||
      later.frame.sampleRate !== frame.sampleRate
    )
      throw new Error('no frame count, and the bitrate is not the same');
  }
  const tail = await read(Math.max(0, length - 160), length - 1);
  const audio = length - (base + at) - trailingTags(tail);
  return {
    ms: Math.round((audio * 8 * 1000) / frame.bitrate),
    how: 'CBR',
    ...measure,
  };
}
