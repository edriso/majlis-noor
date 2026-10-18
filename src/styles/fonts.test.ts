import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/* The interface fonts are files in public/fonts, declared in fonts.css.
   Amiri Quran sets the Quran's text whenever a page's own font cannot load,
   so a character it lacks would be a hole in the Quran: these tests read
   its character map and check it against every page. They also keep
   fonts.css, the files and index.html's preloads in step. */

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

/** The tables of a WOFF2 file, decompressed: a header, a directory, then
    one brotli stream holding every table in directory order. */
function woff2Tables(file: Buffer): Map<string, Buffer> {
  expect(file.toString('latin1', 0, 4)).toBe('wOF2');
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  // Tags the format numbers instead of spelling out, in its own order.
  const known =
    'cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill';
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file[at++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('UIntBase128 longer than five bytes');
  };
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[at++];
    const index = flags & 0x3f;
    let tag: string;
    if (index === 0x3f) {
      tag = file.toString('latin1', at, at + 4);
      at += 4;
    } else tag = known.slice(index * 5, index * 5 + 4);
    const version = flags >> 6;
    const origLength = base128();
    // glyf and loca are transformed unless their version is 3; every
    // other table only when its version is not 0. A transformed table
    // is stored at its transformed length.
    const transformed =
      tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    entries.push({ tag, length: transformed ? base128() : origLength });
  }
  const stream = brotliDecompressSync(file.subarray(at, at + compressedSize));
  const tables = new Map<string, Buffer>();
  let offset = 0;
  for (const { tag, length } of entries) {
    tables.set(tag, stream.subarray(offset, offset + length));
    offset += length;
  }
  expect(offset).toBe(stream.length);
  return tables;
}

/** Every code point a font draws, from its Unicode cmap subtables
    (formats 4 and 12; a code point mapped to glyph 0 is not drawn). */
function codePoints(file: Buffer): Set<number> {
  const cmap = woff2Tables(file).get('cmap');
  if (!cmap) throw new Error('no cmap');
  const drawn = new Set<number>();
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    const unicode =
      platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    const t = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(t);
    if (format === 4) {
      const segs = cmap.readUInt16BE(t + 6) / 2;
      const ends = t + 14;
      const starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2;
      const ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = cmap.readUInt16BE(ends + s * 2);
        const start = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const rangeAt = ranges + s * 2;
        const range = cmap.readUInt16BE(rangeAt);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (range === 0) glyph = (c + delta) & 0xffff;
          else {
            glyph = cmap.readUInt16BE(rangeAt + range + (c - start) * 2);
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph) drawn.add(c);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(t + 12);
      for (let g = 0; g < groups; g++) {
        const at = t + 16 + g * 12;
        const start = cmap.readUInt32BE(at);
        const end = cmap.readUInt32BE(at + 4);
        const glyph = cmap.readUInt32BE(at + 8);
        for (let c = start; c <= end; c++)
          if (glyph + (c - start)) drawn.add(c);
      }
    }
  }
  return drawn;
}

type Face = {
  family: string;
  weight: string;
  url: string;
  range: number[] | null;
};

/** The @font-face rules of fonts.css. */
const faces: Face[] = [
  ...read('src/styles/fonts.css').matchAll(/@font-face\s*{([^}]*)}/g),
].map(([, body]) => {
  const prop = (name: string) =>
    body.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  const range = prop('unicode-range');
  return {
    family: prop('font-family')!.replace(/['"]/g, ''),
    weight: prop('font-weight')!,
    url: body.match(/url\('([^']+)'\)/)![1],
    range: range
      ? range.split(',').flatMap((part) => {
          const [a, b = a] = part.trim().replace('U+', '').split('-');
          const [from, to] = [parseInt(a, 16), parseInt(b, 16)];
          return Array.from({ length: to - from + 1 }, (_, i) => from + i);
        })
      : null,
  };
});

const fontFile = (url: string) => readFileSync(join(root, 'public', url));
const face = (family: string, weight = '400') =>
  faces.find((f) => f.family === family && f.weight === weight)!;
const covers = (font: Set<number>, text: string) =>
  [...new Set(text)]
    .filter((c) => !font.has(c.codePointAt(0)!))
    .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`);

/** Every page's file, wherever the pages are kept: generated into
    src/data/pages, or served from public/pages. */
const pageTexts = () => {
  const dir = ['src/data/pages', 'public/pages']
    .map((d) => join(root, d))
    .find((d) => existsSync(join(d, '1.json')));
  if (!dir) throw new Error('no Mushaf pages found');
  const files = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
  expect(files).toHaveLength(604);
  return files.flatMap((f) =>
    (
      JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
        lines: { x?: string }[];
      }
    ).lines.flatMap((l) => (l.x ? [l.x] : [])),
  );
};

describe('Amiri Quran', () => {
  const font = codePoints(fontFile(face('Amiri Quran').url));

  it('draws every character of the 604 pages’ text', () => {
    const texts = pageTexts();
    expect(texts.length).toBeGreaterThan(8000);
    expect(covers(font, texts.join(''))).toEqual([]);
  });

  it('is whole: no range keeps it from any character', () => {
    expect(face('Amiri Quran').range).toBeNull();
  });
});

describe('the subsets', () => {
  it('draw what the app sets in them', () => {
    const surahs = (
      JSON.parse(read('src/data/mushaf.json')) as {
        surahs: { name: string }[];
      }
    ).surahs.map((s) => `سورة ${s.name}`);
    // Surah headers, the running head and folio, initials, the circle's
    // page: names, digits, the quarter's words, and the two marks.
    const naskh = [
      ...surahs,
      'الجزء ٠١٢٣٤٥٦٧٨٩ · ربع نصف ثلاثة أرباع الحزب ۞ ۩ سجدة',
    ];
    for (const weight of ['400', '700'])
      expect(
        covers(codePoints(fontFile(face('Amiri', weight).url)), naskh.join('')),
        `Amiri ${weight}`,
      ).toEqual([]);
    // The app's name and the khatm's title.
    expect(
      covers(
        codePoints(fontFile(face('Reem Kufi', '400 700').url)),
        'مجلس نور خُتم المصحف',
      ),
    ).toEqual([]);
  });

  it.each(faces.filter((f) => f.range).map((f) => [f.family, f.weight, f]))(
    '%s %s holds every character its unicode-range claims',
    (_, __, f) => {
      const font = codePoints(fontFile((f as Face).url));
      const missing = (f as Face).range!.filter((c) => !font.has(c));
      expect(missing.map((c) => c.toString(16))).toEqual([]);
    },
  );
});

describe('fonts.css', () => {
  it('declares every font file shipped, and only those', () => {
    const shipped = readdirSync(join(root, 'public/fonts'), {
      recursive: true,
      encoding: 'utf8',
    })
      .filter((f) => f.endsWith('.woff2'))
      .map((f) => `/fonts/${f.split('\\').join('/')}`);
    expect(faces.map((f) => f.url).toSorted()).toEqual(shipped.toSorted());
  });

  it('ships each family’s licence beside it, and names it in NOTICE', () => {
    const notice = read('NOTICE');
    for (const dir of new Set(faces.map((f) => f.url.split('/')[2]))) {
      expect(read(`public/fonts/${dir}/OFL.txt`)).toContain(
        'SIL OPEN FONT LICENSE Version 1.1',
      );
      expect(notice).toContain(`    ${dir}/\n`);
    }
  });

  it('gives every family the stylesheets name a face or a system font', () => {
    const sources = [
      ...readdirSync(join(root, 'src/styles'))
        .filter((f) => f.endsWith('.css'))
        .map((f) => read(`src/styles/${f}`)),
      read('index.html'),
    ].join('\n');
    const named = new Set(
      [...sources.matchAll(/(?:font-family|--font-[\w-]+|font):([^;]+);/g)]
        .flatMap(([, value]) => [...value.matchAll(/'([^']+)'/g)])
        .map(([, name]) => name),
    );
    const declared = new Set(faces.map((f) => f.family));
    // Fallbacks a reader's system may have; never fetched.
    const system = new Set(['Segoe UI', 'Times New Roman']);
    expect(
      [...named].filter((n) => !declared.has(n) && !system.has(n)),
    ).toEqual([]);
    for (const family of [
      'IBM Plex Sans Arabic',
      'Reem Kufi',
      'Amiri',
      'Amiri Quran',
    ])
      expect(named.has(family), family).toBe(true);
  });

  it('is what index.html preloads, in CORS mode, through the base', () => {
    const html = read('index.html');
    const preloads = [
      ...html.matchAll(/<link rel="preload" href="%BASE_URL%([^"]+)"([^>]*)>/g),
    ];
    expect(preloads.map(([, href]) => `/${href}`).toSorted()).toEqual(
      [
        face('IBM Plex Sans Arabic').url,
        face('Reem Kufi', '400 700').url,
      ].toSorted(),
    );
    for (const [, , attrs] of preloads) {
      expect(attrs).toContain('as="font"');
      expect(attrs).toContain('crossorigin');
    }
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
  });
});
