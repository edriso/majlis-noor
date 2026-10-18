/* Builds when each reciter recites each ayah and each Mushaf page, once.

     node scripts/build-timings.ts            fetch what is missing, then build
     node scripts/build-timings.ts --offline  build from .cache only

   Run `npm run build:mushaf` first: the page layout decides where a page
   begins and ends, and this script only measures it.

   The source is Quran.com's per-surah recordings with per-ayah
   timestamps, asked for as its own site asks (`segments=true`; without it
   the API leaves the timestamps out), and the audio host's own answer to
   a HEAD request for each surah file. Both are cached under .cache/;
   delete a file there to fetch it again.

   Writes src/data/timings/<reciter>.json:

     audio    the address of every surah file, as a template (see
              src/data/audio.ts), written only if it gives back the API's
              own address for every one of the 114 surahs
     files    files[s - 1] = [bytes, lastModified]: surah s's file as the
              host served it when the timings were built, its length and
              its `last-modified` as an ISO date. A timing is only right for
              the file it was made from, and the host replaces files in
              place, so `npm run check:audio` compares these with what it
              serves now.
     ayat     ayat[s - 1] = [gap, length, gap, length, …], one pair per ayah
              of surah s in order: where the ayah starts in the surah file,
              counted from where the ayah before it ended (the first from
              0), and how long it lasts, in milliseconds (`encodeSpans`).
              Ends come from the API's `timestamp_to`, never its `duration`,
              which is negative in places.
     pages    pages[p - 1] = [[surah, fromMs, toMs], …]: the stretch (or
              stretches, where a page holds the end of one surah and the
              start of the next) of the surah recording that covers page p,
              from its first ayah's start to its last ayah's end.

   The pages give both features that need a reciter's pages: reciter timing
   (`توقيت القارئ`) adds the stretches up into the length of a turn, and the
   listen button plays exactly those stretches of the surah file. The ayat
   give the same for any run of ayat, and the ayah being recited.

   The Madani Mushaf ends every page on the end of an ayah, so a page is
   always a run of whole ayat and its length is theirs, with no ayah to cut
   in two. The script checks that rather than assuming it, and that every
   surah's ayat come in order, each starting no earlier and ending no
   earlier than the one before, which is what lets the app find an ayah
   by time with a binary search. */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  encodeSpans,
  stampOf,
  surahFile,
  type FileStamp,
  type Span,
} from '../src/data/audio.ts';
import { reciters } from '../src/data/reciters.ts';

const API = 'https://api.qurancdn.com/api/qdc/audio/reciters';
const CACHE = '.cache/quran-com/audio';
const HEADS = '.cache/quranicaudio';
const OUT = 'src/data/timings';
// The pages are moving from src/data to public; read whichever is there.
const PAGES = existsSync('src/data/pages') ? 'src/data/pages' : 'public/pages';
const offline = process.argv.includes('--offline');
// A few at a time: quick, without hammering a free host.
const AT_ONCE = 8;

type VerseTiming = {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
};
type AudioFile = { audio_url: string; verse_timings: VerseTiming[] };
type PageLine = { t: string; w?: [string, string][] };
type Head = { url: string; status: number; headers: Record<string, string> };

async function chapter(qdc: number, n: number): Promise<AudioFile> {
  const path = `${CACHE}/${qdc}/${n}.json`;
  if (!existsSync(path)) {
    if (offline)
      throw new Error(`${path} is not cached and --offline was given`);
    const url = `${API}/${qdc}/audio_files?chapter=${n}&segments=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    await mkdir(`${CACHE}/${qdc}`, { recursive: true });
    await writeFile(path, await res.text());
  }
  const { audio_files } = JSON.parse(await readFile(path, 'utf8')) as {
    audio_files: AudioFile[];
  };
  const file = audio_files[0];
  if (!file?.verse_timings)
    throw new Error(`${path} has no verse timings; delete it to fetch again`);
  return file;
}

/** The host's answer to a HEAD request for a surah file, at the address
    the API gives, cached like the API's answers. */
async function stamp(qdc: number, n: number, url: string): Promise<FileStamp> {
  const path = `${HEADS}/${qdc}/${n}.json`;
  let head: Head | undefined = existsSync(path)
    ? (JSON.parse(await readFile(path, 'utf8')) as Head)
    : undefined;
  // A cached answer for another address is no answer for this one.
  if (head?.url !== url) {
    if (offline)
      throw new Error(
        `${path} is not cached for ${url} and --offline was given`,
      );
    const res = await fetch(url, { method: 'HEAD' });
    const headers: Record<string, string> = {};
    for (const name of ['content-length', 'content-type', 'last-modified']) {
      const value = res.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    head = { url, status: res.status, headers };
    await mkdir(`${HEADS}/${qdc}`, { recursive: true });
    await writeFile(path, JSON.stringify(head));
  }
  const { status, headers } = head;
  const type = headers['content-type'] ?? '';
  const found =
    status === 200 && type.startsWith('audio/')
      ? stampOf(status, { get: (name) => headers[name] ?? null })
      : null;
  if (!found)
    throw new Error(
      `${url} answered ${status} ${type}; delete ${path} to ask again`,
    );
  return found;
}

/** Surah 1's address with its number made a placeholder: the one surah
    that tells the two namings apart (1.mp3, 001.mp3), which agree from
    100 on. */
function templateOf(url: string) {
  for (const [name, placeholder] of [
    ['001', '{nnn}'],
    ['1', '{n}'],
  ])
    if (url.endsWith(`/${name}.mp3`))
      return `${url.slice(0, -`${name}.mp3`.length)}${placeholder}.mp3`;
  throw new Error(`unexpected address for surah 1: ${url}`);
}

/* Where each ayah's words sit: for every verse, the page of each of its
   words in order, the end-of-ayah marker included. */
const pagesOfWords = new Map<string, number[]>();
const pageCount = (await readdir(PAGES)).filter((f) =>
  /^\d+\.json$/.test(f),
).length;
for (let p = 1; p <= pageCount; p++) {
  const { lines } = JSON.parse(
    await readFile(`${PAGES}/${p}.json`, 'utf8'),
  ) as {
    lines: PageLine[];
  };
  for (const line of lines)
    for (const [, key] of line.w ?? []) {
      const list = pagesOfWords.get(key) ?? [];
      list.push(p);
      pagesOfWords.set(key, list);
    }
}
const ayatOf = (surah: number) => {
  let n = 0;
  while (pagesOfWords.has(`${surah}:${n + 1}`)) n++;
  return n;
};

await mkdir(OUT, { recursive: true });

for (const reciter of reciters) {
  const pages: [number, number, number][][] = Array.from(
    { length: pageCount },
    () => [],
  );
  const ayat: number[][] = [];
  const files: (FileStamp | undefined)[] = [];
  let urlTemplate = '';

  const add = (page: number, surah: number, from: number, to: number) => {
    const list = pages[page - 1];
    const last = list[list.length - 1];
    // Consecutive ayat of one surah on one page are one stretch of its file.
    if (last && last[0] === surah) last[2] = Math.max(last[2], to);
    else list.push([surah, from, to]);
  };

  const audioFiles: AudioFile[] = [];
  for (let n = 1; n <= 114; n++) {
    const file = await chapter(reciter.qdc, n);
    urlTemplate ||= templateOf(file.audio_url);
    if (surahFile(urlTemplate, n) !== file.audio_url)
      throw new Error(
        `${reciter.id}: surah ${n} is at ${file.audio_url}, not ${surahFile(urlTemplate, n)}`,
      );
    audioFiles.push(file);
  }
  for (let i = 0; i < 114; i += AT_ONCE)
    await Promise.all(
      audioFiles.slice(i, i + AT_ONCE).map(async (file, j) => {
        files[i + j] = await stamp(reciter.qdc, i + j + 1, file.audio_url);
      }),
    );

  for (let n = 1; n <= 114; n++) {
    const timings = audioFiles[n - 1].verse_timings;
    const where = `${reciter.id}: surah ${n}`;
    if (timings.length !== ayatOf(n))
      throw new Error(`${where} has ${timings.length} ayat, not ${ayatOf(n)}`);

    const spans: Span[] = [];
    timings.forEach((v, i) => {
      const key = `${n}:${i + 1}`;
      const from = v.timestamp_from;
      const to = v.timestamp_to;
      if (v.verse_key !== key)
        throw new Error(`${where}: ${v.verse_key} where ${key} should be`);
      if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from)
        throw new Error(`${where}: ${key} is timed ${from} to ${to}`);
      const last = spans[i - 1];
      if (last && (from < last[0] || to < last[1]))
        throw new Error(`${where}: ${key} starts or ends before ${n}:${i}`);
      spans.push([from, to]);

      const wordPages = pagesOfWords.get(key);
      if (!wordPages) throw new Error(`${key} is not in the mushaf`);
      if (new Set(wordPages).size !== 1)
        throw new Error(`${key} runs over a page break`);
      add(wordPages[0], n, from, to);
    });
    ayat.push(encodeSpans(spans));
  }

  const empty = pages.findIndex((list) => list.length === 0);
  if (empty !== -1)
    throw new Error(`${reciter.id}: page ${empty + 1} is empty`);

  await writeFile(
    `${OUT}/${reciter.id}.json`,
    JSON.stringify({
      source: `Quran.com recitation ${reciter.qdc}, ${API}/${reciter.qdc}/audio_files. Built by scripts/build-timings.ts.`,
      audio: urlTemplate,
      files,
      ayat,
      pages,
    }),
  );
  const total = pages.flat().reduce((s, [, a, b]) => s + (b - a), 0);
  console.log(
    `${reciter.id}: ${(total / 3_600_000).toFixed(1)} h over ${pageCount} pages`,
  );
}
