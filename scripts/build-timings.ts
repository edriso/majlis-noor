/* Builds when each reciter recites each ayah and each word, once.

     node scripts/build-timings.ts            fetch what is missing, then build
     node scripts/build-timings.ts --offline  build from .cache only

   Run `npm run build:mushaf` first: the page layout decides where a page
   begins and ends and how many words an ayah has, and this script only
   measures them.

   The source is Quran.com's per-surah recordings with per-ayah and
   per-word timestamps, asked for as its own site asks (`segments=true`;
   without it the API leaves the timestamps out), the audio host's own
   answer to a HEAD request for each surah file, and how long each file
   plays, read from its first frames (scripts/mp3.ts). All three are
   cached under .cache/; delete a file there to ask again.

   Writes src/data/timings/<reciter>.json:

     audio    the address of every surah file, as a template (see
              src/data/audio.ts), written only if it gives back the API's
              own address for every one of the 114 surahs
     files    files[s - 1] = [bytes, lastModified, ms, apiMs]: surah s's
              file as the host served it when the timings were built, its
              length, its `last-modified` as an ISO date, how long it plays,
              and how long the API says the file it timed plays. A timing is
              only right for the file it was made from, and the host
              replaces files in place, so `npm run check:audio` compares
              these with what it serves now.
     untimed  the surahs, in order, whose file does not fit their timings:
              the app plays nothing of them (see below)
     misplaced
              the ayat, by their number through the Mushaf (2:255 is 262),
              whose own span is wrong in a file that otherwise fits: the app
              plays no page and no run of ayat that holds one
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

   And public/words/<reciter>/<surah>.json, served as they are and fetched
   by the app only when it follows a recitation word by word:

     source   where the words come from
     surah    the surah's number
     partial  the ayat, by number, not every word of which is timed; the
              app marks those by the ayah instead
     ayat     per ayah in order, [from, to, word, gap, length, …]: the
              ayah's stretch, then each word as it is heard, its number in
              the ayah (from 1, as the print counts them; the end-of-ayah
              marker is never one), where it starts counted from where the
              word before it ended (the first from the ayah's start), and
              how long it lasts (`encodeAyahWords`)

   The API's segments are cleaned on the way (`cleanSegments`): entries
   that are not three numbers, that end before they start or that number
   a word the ayah does not have are dropped; times are rounded and cut to
   their ayah; a word number going back (the reciter taking up an earlier
   word again) is kept in the order heard; no two words overlap. An ayah's
   words are counted from the page data, where every word carries its
   verse key and the end-of-ayah marker is one of them: an ayah of n words
   has n + 1 entries.

   A surah is untimed when its file does not fit its timings (`endMisfit`:
   the last ayah ends after the file does, or the file is not the one the
   API timed and runs on well past it). In a file that fits, an ayah is
   misplaced when it is timed far faster than the reciter recites with its
   own words seconds outside it, and so are its neighbours and the ayat
   its words reach into (`misplacedAyat`). The script prints each, and
   why; src/data/audio.ts says how the bounds were chosen.

   The Madani Mushaf ends every page on the end of an ayah, so a page is
   always a run of whole ayat and its length is theirs, with no ayah to cut
   in two. The script checks that rather than assuming it, and that every
   surah's ayat come in order, each starting no earlier and ending no
   earlier than the one before, which is what lets the app find an ayah
   by time with a binary search. */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  cleanSegments,
  coversAll,
  encodeAyahWords,
  encodeSpans,
  endMisfit,
  misplacedAyat,
  stampOf,
  surahFile,
  type AyahCheck,
  type FileRecord,
  type FileStamp,
  type Span,
} from '../src/data/audio.ts';
import { reciters } from '../src/data/reciters.ts';
import { fetchAgain, measureMp3, rangeReader, type Measure } from './mp3.ts';

const API = 'https://api.qurancdn.com/api/qdc/audio/reciters';
const CACHE = '.cache/quran-com/audio';
const HEADS = '.cache/quranicaudio';
const OUT = 'src/data/timings';
const WORDS = 'public/words';
const PAGES = 'public/pages';
const offline = process.argv.includes('--offline');
// A few at a time: quick, without hammering a free host.
const AT_ONCE = 8;

type VerseTiming = {
  verse_key: string;
  timestamp_from: number;
  timestamp_to: number;
  segments?: unknown;
};
type AudioFile = {
  audio_url: string;
  /** Milliseconds, in whole seconds, of the file the API timed. */
  duration: number;
  verse_timings: VerseTiming[];
};
type PageLine = { t: string; w?: [string, string][] };
type Head = { url: string; status: number; headers: Record<string, string> };
type Measured = { url: string; stamp: FileStamp; measure: Measure };

async function chapter(qdc: number, n: number): Promise<AudioFile> {
  const path = `${CACHE}/${qdc}/${n}.json`;
  if (!existsSync(path)) {
    if (offline)
      throw new Error(`${path} is not cached and --offline was given`);
    const url = `${API}/${qdc}/audio_files?chapter=${n}&segments=true`;
    const res = await fetchAgain(url);
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
    const res = await fetchAgain(url, { method: 'HEAD' });
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

/** How long a surah file plays, read from its frames and cached with the
    stamp of the file it was read from: a file replaced since is read
    again. */
async function duration(
  qdc: number,
  n: number,
  url: string,
  stamp: FileStamp,
): Promise<Measure> {
  const path = `${HEADS}/${qdc}/${n}.mp3.json`;
  const cached = existsSync(path)
    ? (JSON.parse(await readFile(path, 'utf8')) as Measured)
    : undefined;
  if (
    cached?.url === url &&
    cached.stamp[0] === stamp[0] &&
    cached.stamp[1] === stamp[1]
  )
    return cached.measure;
  if (offline)
    throw new Error(
      `${path} is not cached for this file and --offline was given`,
    );
  const measure = await measureMp3(rangeReader(url), stamp[0]);
  await mkdir(`${HEADS}/${qdc}`, { recursive: true });
  await writeFile(path, JSON.stringify({ url, stamp, measure }));
  return measure;
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
/** How many words the print gives an ayah, its end marker left out. */
const wordsOf = (key: string) => (pagesOfWords.get(key)?.length ?? 0) - 1;
const ayatOf = (surah: number) => {
  let n = 0;
  while (pagesOfWords.has(`${surah}:${n + 1}`)) n++;
  return n;
};
/** The number through the Mushaf of each surah's first ayah. */
const firstAyah = [1];
for (let n = 1; n < 114; n++) firstAyah.push(firstAyah[n - 1] + ayatOf(n));

await mkdir(OUT, { recursive: true });
// Every words file is written afresh, so none is left from a reciter gone.
await rm(WORDS, { recursive: true, force: true });

for (const reciter of reciters) {
  const pages: [number, number, number][][] = Array.from(
    { length: pageCount },
    () => [],
  );
  const ayat: number[][] = [];
  const files: FileRecord[] = [];
  const checks: AyahCheck[] = [];
  const untimed = new Map<number, string>();
  const tally = {
    full: 0,
    malformed: 0,
    clamped: 0,
    trimmed: 0,
    emptied: 0,
    repeats: 0,
    gaps: 0,
    stray: 0,
  };
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
        const n = i + j + 1;
        const found = await stamp(reciter.qdc, n, file.audio_url);
        const { ms } = await duration(reciter.qdc, n, file.audio_url, found);
        files[n - 1] = [...found, ms, file.duration];
      }),
    );

  await mkdir(`${WORDS}/${reciter.id}`, { recursive: true });
  for (let n = 1; n <= 114; n++) {
    const timings = audioFiles[n - 1].verse_timings;
    const where = `${reciter.id}: surah ${n}`;
    if (timings.length !== ayatOf(n))
      throw new Error(`${where} has ${timings.length} ayat, not ${ayatOf(n)}`);

    const spans: Span[] = [];
    const words: number[][] = [];
    const partial: number[] = [];
    let heard = -Infinity;
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

      const count = wordsOf(key);
      const clean = cleanSegments(
        key,
        v.segments,
        { from, to, words: count },
        heard,
      );
      if (clean.words.length) heard = clean.words[clean.words.length - 1][2];
      if (coversAll(clean.words, count)) tally.full++;
      else partial.push(i + 1);
      tally.malformed += clean.malformed;
      tally.clamped += clean.clamped;
      tally.trimmed += clean.trimmed;
      tally.emptied += clean.emptied;
      clean.words.forEach(([word, start], j) => {
        const before = clean.words[j - 1];
        if (!before) return;
        if (word <= before[0]) tally.repeats++;
        if (start - before[2] > 300) tally.gaps++;
      });
      // Where the API's own words for the ayah are heard. Over a second
      // outside it, either they or the ayah's times are wrong there; which,
      // the check for misplaced ayat below tells where it can.
      let spoken: Span | null = null;
      for (const s of Array.isArray(v.segments) ? v.segments : [])
        if (
          Array.isArray(s) &&
          s.length === 3 &&
          s.every((x) => typeof x === 'number' && Number.isFinite(x)) &&
          s[2] >= s[1]
        )
          spoken = spoken
            ? [Math.min(spoken[0], s[1]), Math.max(spoken[1], s[2])]
            : [s[1], s[2]];
      if (spoken && (spoken[0] < from - 1000 || spoken[1] > to + 1000))
        tally.stray++;
      checks.push({ key, words: count, from, to, heard: spoken });
      words.push(encodeAyahWords([from, to], clean.words));
    });

    ayat.push(encodeSpans(spans));
    const misfit = endMisfit(files[n - 1], spans[spans.length - 1][1]);
    if (misfit) untimed.set(n, misfit);
    await writeFile(
      `${WORDS}/${reciter.id}/${n}.json`,
      JSON.stringify({
        source: `Quran.com recitation ${reciter.qdc}, word segments from ${API}/${reciter.qdc}/audio_files?chapter=${n}&segments=true, cleaned by scripts/build-timings.ts.`,
        surah: n,
        partial,
        ayat: words,
      }),
    );
  }

  // Misplaced ayat in a surah already untimed change nothing.
  const misplaced = misplacedAyat(checks).filter(
    (key) => !untimed.has(Number(key.split(':')[0])),
  );

  const empty = pages.findIndex((list) => list.length === 0);
  if (empty !== -1)
    throw new Error(`${reciter.id}: page ${empty + 1} is empty`);

  await writeFile(
    `${OUT}/${reciter.id}.json`,
    JSON.stringify({
      source: `Quran.com recitation ${reciter.qdc}, ${API}/${reciter.qdc}/audio_files. Built by scripts/build-timings.ts.`,
      audio: urlTemplate,
      files,
      untimed: [...untimed.keys()].sort((a, b) => a - b),
      misplaced: misplaced.map((key) => {
        const [n, a] = key.split(':').map(Number);
        return firstAyah[n - 1] + a - 1;
      }),
      ayat,
      pages,
    }),
  );
  const total = pages.flat().reduce((s, [, a, b]) => s + (b - a), 0);
  const ayatCount = ayat.reduce((s, a) => s + a.length / 2, 0);
  console.log(
    `${reciter.id}: ${(total / 3_600_000).toFixed(1)} h over ${pageCount} pages; ` +
      `every word timed in ${tally.full} of ${ayatCount} ayat; ` +
      `${tally.malformed} malformed, ${tally.clamped} cut to their ayah, ` +
      `${tally.trimmed} overlapping, ${tally.emptied} left empty, ` +
      `${tally.repeats} repeats, ${tally.gaps} gaps over 300ms, ` +
      `${tally.stray} ayat with words over a second outside them`,
  );
  for (const [n, why] of [...untimed].sort(([a], [b]) => a - b))
    console.log(`  surah ${n} untimed: ${why}`);
  if (misplaced.length) console.log(`  misplaced: ${misplaced.join(' ')}`);
}
