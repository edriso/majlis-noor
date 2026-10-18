/* Asks the audio host for every surah file of every reciter, the way the
   app will ask for it, so a file the timings name but the host does not
   serve, or serves changed, is found here and not in a halaqa.

     node scripts/check-audio.ts

   It reads the committed timings and fetches the first 16 KB of each file,
   a few kilobytes more where its frames say too little (see
   scripts/mp3.ts), nothing more. The answer says how long the whole file
   is, when it was last modified and how long it plays, and those must be
   what the timings recorded when they were built: the host replaces files
   in place, and a timing is only right for the file it was made from. A
   file that changed fails the check, saying whether its timings still fit
   it; so does one that no longer fits them (`endMisfit`) though nothing
   else changed. A file the build already found does not fit (`untimed`) is
   listed as known, not failed: the app plays nothing of it.

   A file that changed means its reciter's timings need
   `npm run build:timings` again, which measures it and decides afresh.

   Run it after `npm run build:timings`, and whenever a recitation will not
   play: a host can move, drop or replace a file with nothing here
   changing, which is why this is a check to run (weekly, by
   .github/workflows/audio.yml) and not a test. */

import { readFileSync } from 'node:fs';
import {
  decodeSpans,
  endMisfit,
  fileChange,
  stampOf,
  surahFile,
  type FileRecord,
} from '../src/data/audio.ts';
import { reciters } from '../src/data/reciters.ts';
import { fetchAgain, measureMp3, rangeReader } from './mp3.ts';

// A few at a time: quick, without hammering a free host.
const AT_ONCE = 8;

type Verdict = { problem: string | null; known: string | null };

/** What is wrong with a surah file as the host serves it, or null. */
async function check(
  url: string,
  recorded: FileRecord | undefined,
  lastEnd: number,
  untimed: boolean,
): Promise<Verdict> {
  const fail = (problem: string): Verdict => ({ problem, known: null });
  let res: Response;
  try {
    res = await fetchAgain(url, { headers: { range: 'bytes=0-16383' } });
  } catch (error) {
    return fail(`could not be reached (${(error as Error).message})`);
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('audio/')) {
    await res.body?.cancel();
    return fail(`is gone: ${res.status} ${type}`.trim());
  }
  const head = new Uint8Array(await res.arrayBuffer());
  if (!recorded) return fail('was never recorded; run npm run build:timings');
  const stamp = stampOf(res.status, res.headers);
  if (!stamp) return fail('is served without a length or a date');
  let ms: number;
  try {
    ({ ms } = await measureMp3(rangeReader(url, head), stamp[0]));
  } catch (error) {
    return fail(`cannot be measured (${(error as Error).message})`);
  }
  const served: FileRecord = [...stamp, ms, recorded[3]];
  const change = fileChange(recorded, [stamp[0], stamp[1], ms]);
  const misfit = endMisfit(served, lastEnd);
  if (change)
    return fail(
      `has changed: ${change}; ${misfit ? `it no longer fits its timings: ${misfit}` : 'its timings still fit it'}`,
    );
  if (untimed)
    return { problem: null, known: misfit ?? 'an ayah in it is misplaced' };
  return misfit ? fail(`no longer fits its timings: ${misfit}`) : NO_PROBLEM;
}
const NO_PROBLEM: Verdict = { problem: null, known: null };

const failures: string[] = [];
const known: string[] = [];
for (const reciter of reciters) {
  const timings = JSON.parse(
    readFileSync(`src/data/timings/${reciter.id}.json`, 'utf8'),
  ) as {
    audio: string;
    files?: FileRecord[];
    untimed?: number[];
    ayat: number[][];
  };
  const { audio, files = [], untimed = [] } = timings;
  const lastEnd = (n: number) => decodeSpans(timings.ayat[n - 1]).at(-1)![1];
  let wrong = 0;
  for (let i = 0; i < 114; i += AT_ONCE) {
    const batch = Array.from(
      { length: Math.min(AT_ONCE, 114 - i) },
      (_, j) => i + j + 1,
    );
    const verdicts = await Promise.all(
      batch.map((n) =>
        check(
          surahFile(audio, n),
          files[n - 1],
          lastEnd(n),
          untimed.includes(n),
        ),
      ),
    );
    verdicts.forEach(({ problem, known: why }, j) => {
      const n = batch[j];
      const where = `${reciter.id}, surah ${n}: ${surahFile(audio, n)}`;
      if (why) known.push(`${where} (${why})`);
      if (!problem) return;
      failures.push(`${where} ${problem}`);
      wrong++;
    });
  }
  console.log(
    `${reciter.id}: ${114 - wrong} of 114 surah files served as timed`,
  );
}

if (known.length) {
  console.log(`\n${known.length} surah files known not to fit their timings:`);
  console.log(known.join('\n'));
}
if (failures.length) {
  console.error(`\n${failures.length} surah files are not as timed:`);
  console.error(failures.join('\n'));
  process.exit(1);
}
