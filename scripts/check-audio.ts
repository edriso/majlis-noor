/* Asks the audio host for every surah file of every reciter, the way the
   app will ask for it, so a file the timings name but the host does not
   serve, or serves changed, is found here and not in a halaqa.

     node scripts/check-audio.ts

   It reads the committed timings and fetches the first 16 KB of each file,
   a few kilobytes more where its frames say too little (see
   scripts/mp3.ts), nothing more. The answer says how long the whole file
   is, when it was last modified and how long it plays, and those must be
   what the timings recorded when they were built: the host replaces files
   in place, and a timing is only right for the file it was made from.

   A file that changed means its reciter's timings need
   `npm run build:timings` again, and a look at whether the new recording
   still fits them.

   Run it after `npm run build:timings`, and whenever a recitation will not
   play: a host can move, drop or replace a file with nothing here
   changing, which is why this is a check to run (weekly, by
   .github/workflows/audio.yml) and not a test. */

import { readFileSync } from 'node:fs';
import {
  fileChange,
  stampOf,
  surahFile,
  type FileRecord,
} from '../src/data/audio.ts';
import { reciters } from '../src/data/reciters.ts';
import { fetchAgain, measureMp3, rangeReader } from './mp3.ts';

// A few at a time: quick, without hammering a free host.
const AT_ONCE = 8;

/** What is wrong with a surah file as the host serves it, or null. */
async function check(url: string, recorded: FileRecord | undefined) {
  let res: Response;
  try {
    res = await fetchAgain(url, { headers: { range: 'bytes=0-16383' } });
  } catch (error) {
    return `could not be reached (${(error as Error).message})`;
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('audio/')) {
    await res.body?.cancel();
    return `is gone: ${res.status} ${type}`.trim();
  }
  const head = new Uint8Array(await res.arrayBuffer());
  if (!recorded) return 'was never recorded; run npm run build:timings';
  const stamp = stampOf(res.status, res.headers);
  if (!stamp) return 'is served without a length or a date';
  let ms: number;
  try {
    ({ ms } = await measureMp3(rangeReader(url, head), stamp[0]));
  } catch (error) {
    return `cannot be measured (${(error as Error).message})`;
  }
  const change = fileChange(recorded, [stamp[0], stamp[1], ms]);
  return change && `has changed: ${change}`;
}

const failures: string[] = [];
for (const reciter of reciters) {
  const { audio, files = [] } = JSON.parse(
    readFileSync(`src/data/timings/${reciter.id}.json`, 'utf8'),
  ) as { audio: string; files?: FileRecord[] };
  const urls = Array.from({ length: 114 }, (_, i) => surahFile(audio, i + 1));
  let wrong = 0;
  for (let i = 0; i < urls.length; i += AT_ONCE) {
    const batch = urls.slice(i, i + AT_ONCE);
    const results = await Promise.all(
      batch.map((url, j) => check(url, files[i + j])),
    );
    results.forEach((problem, j) => {
      if (!problem) return;
      failures.push(
        `${reciter.id}, surah ${i + j + 1}: ${batch[j]} ${problem}`,
      );
      wrong++;
    });
  }
  console.log(
    `${reciter.id}: ${urls.length - wrong} of 114 surah files served as timed`,
  );
}

if (failures.length) {
  console.error(`\n${failures.length} surah files are not as timed:`);
  console.error(failures.join('\n'));
  process.exit(1);
}
