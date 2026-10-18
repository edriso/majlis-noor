/* Builds the committed Mushaf data from the Quran.com API, once.

     node scripts/build-mushaf.ts            fetch what is missing, then build
     node scripts/build-mushaf.ts --offline  build from .cache only

   What it writes:

     public/pages/1.json … 604.json  one file per Mushaf page: its 15 lines,
                                     each a surah header, a basmala, or the
                                     glyph codes of the words on that line;
                                     served as they are and fetched by the
                                     app when a page is about to be read
     src/data/mushaf.json            the index every screen needs without
                                     loading a page: the 114 surahs, and the
                                     first ayah of every surah, juz, hizb
                                     quarter and page, numbered 1 to 6236
                                     through the whole Mushaf

   The index is written compact; run `npm run format` after a build, as for
   any other committed file.

   The layout is the King Fahd Complex Madani Mushaf (1421H print), the one
   whose page fonts Quran.com serves as "v2". Each page has its own font, and
   each word is a single glyph in it, which is why the page looks like the
   printed Mushaf rather than like text set in an Arabic font. The API's
   `page_number` and `line_number` are that layout; `v1_page` is the older
   1405H print and disagrees with it on 361 words, so do not mix the two.

   The API does not return the lines that hold a surah header or a basmala:
   they are simply missing from the 15. They are inferred here, and the build
   fails loudly if any page does not come out at exactly the lines it should. */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const API = 'https://api.quran.com/api/v4';
const CACHE = '.cache/quran-com';
const OUT = 'src/data';
const PAGES_OUT = 'public/pages';
const PAGES = 604;
const offline = process.argv.includes('--offline');

type ApiWord = {
  id: number;
  position: number;
  /** `word`, or `end` for the end-of-ayah mark carrying its number. */
  char_type_name: string;
  code_v2: string;
  text_uthmani: string;
  page_number: number;
  line_number: number;
};
type ApiVerse = {
  verse_key: string;
  verse_number: number;
  juz_number: number;
  hizb_number: number;
  rub_el_hizb_number: number;
  text_uthmani: string;
  words: ApiWord[];
};
type ApiChapter = {
  id: number;
  name_arabic: string;
  verses_count: number;
  revelation_place: 'makkah' | 'madinah';
};

async function cached<T>(file: string, url: string): Promise<T> {
  const path = `${CACHE}/${file}`;
  if (existsSync(path)) return JSON.parse(await readFile(path, 'utf8')) as T;
  if (offline) throw new Error(`${path} is not cached and --offline was given`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const body = await res.text();
  await writeFile(path, body);
  return JSON.parse(body) as T;
}

const pageUrl = (p: number) =>
  `${API}/verses/by_page/${p}?words=true&word_fields=code_v1,code_v2,line_number,page_number,text_uthmani,v1_page,v2_page,line_v2&per_page=all&fields=juz_number,hizb_number,rub_el_hizb_number,sajdah_number,text_uthmani`;

await mkdir(`${CACHE}/pages`, { recursive: true });
await mkdir(PAGES_OUT, { recursive: true });

const { chapters } = await cached<{ chapters: ApiChapter[] }>(
  'chapters.json',
  `${API}/chapters?language=ar`,
);

/* `by_page` pages by the older 1405H print, so the verses it returns for a
   page are not quite the verses on that page here. Words are collected by id
   across every response and placed by their own `page_number`, never by the
   page that was asked for. */
const words = new Map<number, ApiWord & { verse: ApiVerse }>();
for (let p = 1; p <= PAGES; p++) {
  const { verses } = await cached<{ verses: ApiVerse[] }>(
    `pages/${p}.json`,
    pageUrl(p),
  );
  for (const verse of verses)
    for (const word of verse.words) words.set(word.id, { ...word, verse });
}

type Line =
  | { t: 'surah'; s: number }
  | { t: 'basmala' }
  | { t: 'text'; w: [code: string, verse: string][]; x: string };

const grid: (Line | null)[][] = Array.from({ length: PAGES + 1 }, () =>
  Array<Line | null>(16).fill(null),
);
for (const word of [...words.values()].sort((a, b) => a.id - b.id)) {
  const row = grid[word.page_number];
  let line = row[word.line_number];
  if (!line) line = row[word.line_number] = { t: 'text', w: [], x: '' };
  if (line.t !== 'text') throw new Error('unreachable');
  line.w.push([word.code_v2, word.verse.verse_key]);
  // The end-of-ayah word is the ayah's number. In the readable text it is
  // kept as a number in brackets so a screen reader announces it as one.
  const text =
    word.char_type_name === 'end'
      ? `﴿${word.text_uthmani}﴾`
      : word.text_uthmani;
  line.x = line.x ? `${line.x} ${text}` : text;
}

/* Pages 1 and 2 are set as the opening spread: a header, then the text in
   the middle of the page on lines 2 to 8, not 15 lines. */
const lineCount = (p: number) => (p <= 2 ? 8 : 15);

/* Walk every line slot of the Mushaf in reading order. A run of empty slots
   belongs to the surah whose first ayah comes right after it: a header, then
   a basmala, except at al-Fatihah (whose basmala is its first ayah) and
   at-Tawbah (which has none). The run can end one page and the surah begin
   the next, which happens at the foot of several pages. */
const empty: [page: number, line: number][] = [];
let previousKey = '';
for (let p = 1; p <= PAGES; p++) {
  for (let l = 1; l <= lineCount(p); l++) {
    const line = grid[p][l];
    if (!line) {
      empty.push([p, l]);
      continue;
    }
    if (line.t !== 'text') continue;
    const [, key] = line.w[0];
    const startsSurah = key.endsWith(':1') && key !== previousKey;
    previousKey = line.w[line.w.length - 1][1];
    if (empty.length === 0) continue;
    if (!startsSurah)
      throw new Error(`page ${p} line ${l}: empty lines before ${key}`);
    const surah = Number(key.split(':')[0]);
    const wanted: Line[] =
      surah === 1 || surah === 9
        ? [{ t: 'surah', s: surah }]
        : [{ t: 'surah', s: surah }, { t: 'basmala' }];
    if (empty.length !== wanted.length)
      throw new Error(
        `surah ${surah}: ${empty.length} empty lines, expected ${wanted.length}`,
      );
    empty.forEach(([ep, el], i) => (grid[ep][el] = wanted[i]));
    empty.length = 0;
  }
}
if (empty.length) throw new Error(`unassigned lines: ${JSON.stringify(empty)}`);

// Every surah must begin with a header, so a header we failed to place shows
// up here as a count short of 114.
const headers = grid.flat().filter((l) => l?.t === 'surah').length;
if (headers !== 114) throw new Error(`${headers} surah headers, expected 114`);

const verseOf = new Map<string, ApiVerse>();
for (const w of words.values()) verseOf.set(w.verse.verse_key, w.verse);

const surahStart = new Map<number, number>();

/* Every ayah in reading order. An ayah's place in this list, counted from
   1, is its number in the whole Mushaf (1 to 6236), which is what the index
   below is written in: a page, a hizb quarter, a juz or a surah is then a
   half-open stretch of those numbers, and the page of an ayah is a search,
   not a lookup in a table of 6,236 entries. */
const order: string[] = [];
const pageStarts: number[] = [];
/* A rebuild is expected to write every page exactly as it was: the pages
   are the Quran, and mushaf.test.ts pins their digest. Any page that comes
   out different is named at the end, to be reviewed before anything else. */
const changed: number[] = [];

for (let p = 1; p <= PAGES; p++) {
  const lines = grid[p].slice(1, lineCount(p) + 1) as Line[];
  const keys = lines.flatMap((l) =>
    l.t === 'text' ? l.w.map(([, k]) => k) : [],
  );
  const unique = [...new Set(keys)];
  for (const l of lines) if (l.t === 'surah') surahStart.set(l.s, p);
  // The Madani print ends every page on a whole ayah, so every page begins
  // a new one; the index relies on that.
  if (unique[0] === order.at(-1))
    throw new Error(`page ${p} begins inside ${unique[0]}`);
  pageStarts.push(order.length + 1);
  order.push(...unique);

  // The page is named after the first ayah that *starts* on it, as the
  // printed Mushaf names it in its margin; a page whose top line finishes the
  // previous page's ayah still belongs to that ayah's juz.
  const first = verseOf.get(unique[0])!;
  // By the ۩ the print sets in the ayah, not the API's `sajdah_number`,
  // which leaves out al-Hajj 77: the Mushaf marks fifteen and so do we.
  const sajdah = unique.filter((k) =>
    verseOf.get(k)!.text_uthmani.includes('\u06E9'),
  );
  const surahs = [...new Set(unique.map((k) => Number(k.split(':')[0])))];
  const rubs = [
    ...new Set(unique.map((k) => verseOf.get(k)!.rub_el_hizb_number)),
  ];

  const file = `${PAGES_OUT}/${p}.json`;
  const json = JSON.stringify({
    page: p,
    surahs,
    juz: first.juz_number,
    rubs,
    ...(sajdah.length ? { sajdah } : {}),
    lines,
  });
  if (!existsSync(file) || (await readFile(file, 'utf8')) !== json)
    changed.push(p);
  await writeFile(file, json);
}

if (order.length !== 6236) throw new Error(`${order.length} ayat`);

/** Where each value of `field` first appears in reading order, as global
    ayah numbers; the values must run 1, 2, 3 … with none missing. */
function startsOf(field: (v: ApiVerse) => number, count: number) {
  const starts: number[] = [];
  order.forEach((key, i) => {
    const n = field(verseOf.get(key)!);
    if (n === starts.length) return;
    if (n !== starts.length + 1) throw new Error(`${key}: ${n} out of order`);
    starts.push(i + 1);
  });
  if (starts.length !== count)
    throw new Error(`${starts.length} starts, expected ${count}`);
  return starts;
}

const surahStarts = startsOf((v) => Number(v.verse_key.split(':')[0]), 114);
chapters.forEach((c, i) => {
  const next = surahStarts[i + 1] ?? order.length + 1;
  if (next - surahStarts[i] !== c.verses_count)
    throw new Error(`surah ${c.id}: ${next - surahStarts[i]} ayat`);
});
const juzStarts = startsOf((v) => v.juz_number, 30);
const rubStarts = startsOf((v) => v.rub_el_hizb_number, 240);

/* The quarters are the API's, and they must be the print's: the 1421H text
   sets a ۞ at the head of every quarter except those that open a surah,
   where the surah's header stands instead. (Tanzil's quarters follow the
   1405H print and disagree in places; they are not to be mixed in.) */
const marked = order.flatMap((key, i) =>
  verseOf.get(key)!.text_uthmani.includes('۞') ? [i + 1] : [],
);
const unmarked = rubStarts.filter((a) => !marked.includes(a));
if (marked.some((a) => !rubStarts.includes(a)))
  throw new Error('a ۞ stands where no quarter begins');
if (unmarked.some((a) => !order[a - 1].endsWith(':1')))
  throw new Error('a quarter begins with neither a ۞ nor a surah');

const index = {
  source:
    'Quran.com API v4, King Fahd Complex Madani Mushaf (1421H), QCF v2 glyph codes. Built by scripts/build-mushaf.ts.',
  surahs: chapters.map((c) => ({
    n: c.id,
    name: c.name_arabic,
    ayat: c.verses_count,
    page: surahStart.get(c.id)!,
    place: c.revelation_place,
  })),
  // The first ayah of each, as its number in the whole Mushaf.
  starts: {
    surahs: surahStarts,
    juz: juzStarts,
    rubs: rubStarts,
    pages: pageStarts,
  },
};
await writeFile(`${OUT}/mushaf.json`, JSON.stringify(index));
console.log(`wrote ${PAGES} pages to ${PAGES_OUT} and ${OUT}/mushaf.json`);
console.log(
  changed.length
    ? `CHANGED: ${changed.length} pages differ from before (${changed.join(', ')}). Review every one.`
    : 'every page is byte for byte as it was',
);
