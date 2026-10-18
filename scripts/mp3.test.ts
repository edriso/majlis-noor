import { describe, expect, it } from 'vitest';
import {
  audioStart,
  frameAt,
  measureMp3,
  trailingTags,
  type ReadBytes,
} from './mp3.ts';

/* MP3 files made here, byte by byte: tags, frame headers and the frame
   counts encoders write, with silence (zeros) for audio, so that the only
   frame syncs in them are the frames'. */

type Kind = { version: 1 | 2; kbps: number; rate: number; mono?: boolean };

const BITRATE_INDEX = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATE_INDEX = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
};

function header({ version, kbps, rate, mono }: Kind, padding = 0) {
  const b1 = 0xe0 | ((version === 1 ? 3 : 2) << 3) | (1 << 1) | 1; // no CRC
  const b2 =
    (BITRATE_INDEX[version].indexOf(kbps) << 4) |
    (RATE_INDEX[version].indexOf(rate) << 2) |
    (padding << 1);
  return [0xff, b1, b2, mono ? 0xc0 : 0x00];
}

const frameLength = ({ version, kbps, rate }: Kind, padding = 0) =>
  Math.floor(((version === 1 ? 144 : 72) * kbps * 1000) / rate) + padding;

/** One frame of silence, with `extra` written at `at` in it. */
function frame(kind: Kind, extra: number[] = [], at = 0) {
  const bytes = new Uint8Array(frameLength(kind));
  bytes.set(header(kind));
  bytes.set(extra, at);
  return bytes;
}

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
/** `n` bytes of `value`. */
const run = (n: number, value = 0) => Array.from({ length: n }, () => value);
const be32 = (n: number) => [
  n >>> 24,
  (n >> 16) & 255,
  (n >> 8) & 255,
  n & 255,
];
const le32 = (n: number) => be32(n).reverse();

function id3v2(size: number, footer = false) {
  const syncsafe = [21, 14, 7, 0].map((shift) => (size >> shift) & 0x7f);
  return [
    ...ascii('ID3'),
    4,
    0,
    footer ? 0x10 : 0,
    ...syncsafe,
    ...run(size + (footer ? 10 : 0)),
  ];
}

function file(...parts: (number[] | Uint8Array)[]) {
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}

/** Reads from `bytes` as a Range request would, noting what it asked. */
function reader(bytes: Uint8Array) {
  const asked: [number, number][] = [];
  const read: ReadBytes = async (from, to) => {
    asked.push([from, to]);
    return bytes.subarray(from, to + 1);
  };
  return { read, asked };
}

const mpeg1: Kind = { version: 1, kbps: 128, rate: 44100 };
// 128 kbps at 48 kHz makes every frame 384 bytes, with no padding.
const even: Kind = { version: 1, kbps: 128, rate: 48000 };

describe('reading an MP3 frame header', () => {
  it('reads Layer III headers of MPEG-1 and MPEG-2', () => {
    const bytes = file(header(mpeg1, 1));
    expect(frameAt(bytes, 0)).toMatchObject({
      version: 1,
      bitrate: 128000,
      sampleRate: 44100,
      samples: 1152,
      length: 418,
      mono: false,
      crc: false,
    });
    const low: Kind = { version: 2, kbps: 64, rate: 22050, mono: true };
    expect(frameAt(file(header(low)), 0)).toMatchObject({
      version: 2,
      samples: 576,
      length: 208,
      mono: true,
    });
  });

  it('takes nothing else for a frame', () => {
    const [b0, b1, b2, b3] = header(mpeg1);
    const not = (bytes: number[]) => expect(frameAt(file(bytes), 0)).toBeNull();
    not([0xfe, b1, b2, b3]); // no sync
    not([b0, (b1 & ~0x18) | 0x08, b2, b3]); // the reserved version
    not([b0, (b1 & ~0x06) | 0x04, b2, b3]); // Layer II
    not([b0, b1, b2 & 0x0f, b3]); // a free bitrate
    not([b0, b1, b2 | 0xf0, b3]); // the forbidden bitrate
    not([b0, b1, b2 | 0x0c, b3]); // the reserved sample rate
    not([b0, b1, b2]); // cut short
  });
});

describe('the tags around the audio', () => {
  it('finds where the audio starts after ID3v2 tags', () => {
    expect(audioStart(file([0xff, 0xfb]))).toBe(0);
    expect(audioStart(file(id3v2(100)))).toBe(110);
    // A tag with a footer, then another tag.
    expect(audioStart(file(id3v2(20, true), id3v2(5)))).toBe(40 + 15);
  });

  it('counts the ID3v1 and APE tags at the end', () => {
    const silence = run(200);
    expect(trailingTags(file(silence))).toBe(0);
    const id3v1 = [...ascii('TAG'), ...run(125)];
    expect(trailingTags(file(silence, id3v1).subarray(-160))).toBe(128);
    // An APE footer: the size counts items and footer, the flag a header.
    const ape = (size: number, withHeader: boolean) => [
      ...ascii('APETAGEX'),
      ...le32(2000),
      ...le32(size),
      ...le32(1),
      ...le32(withHeader ? 0x80000000 : 0),
      ...run(8),
    ];
    expect(trailingTags(file(silence, ape(96, false)).subarray(-160))).toBe(96);
    expect(
      trailingTags(file(silence, ape(96, true), id3v1).subarray(-160)),
    ).toBe(96 + 32 + 128);
  });
});

describe('how long an MP3 plays', () => {
  it('counts the frames an Info header gives', async () => {
    // LAME's Info frame: after the header and 32 bytes of side information.
    const info = frame(
      mpeg1,
      [...ascii('Info'), ...be32(1), ...be32(1000)],
      36,
    );
    const bytes = file(id3v2(100), info, frame(mpeg1), frame(mpeg1));
    const { read } = reader(bytes);
    expect(await measureMp3(read, bytes.length)).toEqual({
      ms: Math.round((1000 * 1152 * 1000) / 44100),
      how: 'Info',
      bitrate: 128000,
      sampleRate: 44100,
    });
  });

  it('counts a Xing header in a mono MPEG-2 file', async () => {
    const low: Kind = { version: 2, kbps: 64, rate: 22050, mono: true };
    const xing = frame(low, [...ascii('Xing'), ...be32(3), ...be32(500)], 13);
    const bytes = file(xing, frame(low), frame(low), frame(low));
    const { read } = reader(bytes);
    expect(await measureMp3(read, bytes.length)).toMatchObject({
      ms: Math.round((500 * 576 * 1000) / 22050),
      how: 'Xing',
    });
  });

  it('counts a VBRI header', async () => {
    const vbri = frame(
      mpeg1,
      [...ascii('VBRI'), 0, 1, 0, 0, 0, 0, ...be32(99999), ...be32(300)],
      36,
    );
    const bytes = file(vbri, frame(mpeg1), frame(mpeg1));
    const { read } = reader(bytes);
    expect(await measureMp3(read, bytes.length)).toMatchObject({
      ms: Math.round((300 * 1152 * 1000) / 44100),
      how: 'VBRI',
    });
  });

  it('measures a file of one bitrate by its bytes, without its tags', async () => {
    const frames = Array.from({ length: 300 }, () => frame(even));
    const ape = [
      ...run(64),
      ...ascii('APETAGEX'),
      ...le32(2000),
      ...le32(96),
      ...le32(1),
      ...le32(0),
      ...run(8),
    ];
    const id3v1 = [...ascii('TAG'), ...run(125)];
    const bytes = file(id3v2(200), ...frames, ape, id3v1);
    const { read, asked } = reader(bytes);
    // 300 frames of 1,152 samples at 48 kHz: 7.2 s.
    expect(await measureMp3(read, bytes.length)).toEqual({
      ms: 7200,
      how: 'CBR',
      bitrate: 128000,
      sampleRate: 48000,
    });
    // The head, two places further in, and the tail: nothing more.
    expect(asked).toHaveLength(4);
  });

  it('refuses a file whose bitrate changes and that gives no frame count', async () => {
    const other: Kind = { version: 1, kbps: 64, rate: 48000 };
    const bytes = file(
      ...Array.from({ length: 100 }, () => frame(even)),
      ...Array.from({ length: 300 }, () => frame(other)),
    );
    const { read } = reader(bytes);
    await expect(measureMp3(read, bytes.length)).rejects.toThrow(
      'the bitrate is not the same',
    );
  });

  it('reads on past a tag too big for the first read', async () => {
    const info = frame(mpeg1, [...ascii('Info'), ...be32(1), ...be32(10)], 36);
    const bytes = file(id3v2(20_000), info, frame(mpeg1), frame(mpeg1));
    const { read, asked } = reader(bytes);
    expect(await measureMp3(read, bytes.length)).toMatchObject({ how: 'Info' });
    expect(asked[1][0]).toBe(20_010);
  });

  it('refuses what is not MPEG audio', async () => {
    const bytes = file(id3v2(10), run(5000, 0x20));
    const { read } = reader(bytes);
    await expect(measureMp3(read, bytes.length)).rejects.toThrow(
      'no MPEG Layer III frames',
    );
  });
});
