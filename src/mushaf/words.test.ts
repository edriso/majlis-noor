import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { arabic, digits } from '@/data/arabic';
import type { WordsFile } from '@/data/audio';
import {
  ayahIndex,
  PAGE_COUNT,
  surahs,
  verseOf,
  type Page,
} from '@/data/mushaf';
import { readWords } from '@/data/timings';
import {
  ayahText,
  ayatOfLine,
  entryTexts,
  pageWords,
  type GlyphWord,
} from './words';

const root = join(import.meta.dirname, '../../public');
const pages: Page[] = Array.from(
  { length: PAGE_COUNT },
  (_, i) =>
    JSON.parse(readFileSync(join(root, `pages/${i + 1}.json`), 'utf8')) as Page,
);

/** Every ayah's words on its page, its marker left out: ayah → count. */
const counts = new Map<number, number>();
for (const page of pages)
  for (const w of pageWords(page).flat())
    if (w.word !== null) counts.set(w.ayah, w.word);

describe('pageWords', () => {
  it('reads page 1 as al-Fatihah’s words, each ayah ending in its marker', () => {
    const lines = pageWords(pages[0]);
    expect(lines[0]).toEqual([]); // the surah's header
    const one = (word: number | null): GlyphWord => ({ ayah: 1, word });
    expect(lines[1]).toEqual([one(1), one(2), one(3), one(4), one(null)]);
    // Line 4 ends al-Fatihah 3 and holds the whole of 4.
    expect(lines[3]).toEqual([
      { ayah: 3, word: 1 },
      { ayah: 3, word: 2 },
      { ayah: 3, word: null },
      { ayah: 4, word: 1 },
      { ayah: 4, word: 2 },
      { ayah: 4, word: 3 },
      { ayah: 4, word: null },
    ]);
  });

  it('carries the count of an ayah’s words on from one line to the next', () => {
    // Al-Baqarah 25 runs over the first four lines of page 5.
    const lines = pageWords(pages[4]);
    const ayah = ayahIndex(2, 25);
    expect(lines[0].map((w) => w.word)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(lines[1][0]).toEqual({ ayah, word: 9 });
    // Its marker, then the hizb quarter's ۞ drawn with the next ayah's
    // first word, as one entry.
    expect(lines[3].slice(-2)).toEqual([
      { ayah, word: null },
      { ayah: ayah + 1, word: 1 },
    ]);
  });

  it('finds every end-of-ayah marker where the text has its number', () => {
    for (const page of pages) {
      const lines = pageWords(page);
      page.lines.forEach((line, i) => {
        if (line.t !== 'text') return;
        const marked = lines[i]
          .filter((w) => w.word === null)
          .map((w) => verseOf(w.ayah).ayah);
        const written = [...line.x.matchAll(/﴿([^﴾]+)﴾/g)].map((m) =>
          Number(digits(m[1])),
        );
        expect(marked, `page ${page.page}, line ${i + 1}`).toEqual(written);
      });
    }
  });

  // Reads every word of the Mushaf: slow when the machine is busy.
  it('counts every ayah once, its words from 1 and its marker last', () => {
    expect(counts.size).toBe(6236);
    for (const page of pages) {
      const words = pageWords(page).flat();
      words.forEach((w, i) => {
        const next = words[i + 1];
        if (next?.ayah === w.ayah) {
          expect(w.word).not.toBeNull();
          expect(next.word === null || next.word === w.word! + 1).toBe(true);
        } else {
          expect(w.word, `ayah ${w.ayah}`).toBeNull();
        }
      });
    }
  }, 30_000);

  it('numbers the words as a reciter’s word timings do, in every surah', () => {
    // Al-Husary's timings hold every word of all but a handful of ayat;
    // each word number they give is one the page draws, and an ayah they
    // cover whole has exactly the page's words.
    for (const s of surahs) {
      const file = JSON.parse(
        readFileSync(join(root, `words/husary/${s.n}.json`), 'utf8'),
      ) as WordsFile;
      readWords(file).ayat.forEach((a, i) => {
        const count = counts.get(ayahIndex(s.n, i + 1))!;
        const heard = new Set(a.words.map((w) => w.word));
        for (const w of heard) expect(w).toBeLessThanOrEqual(count);
        if (a.full) expect(heard.size, `${s.n}:${i + 1}`).toBe(count);
      });
    }
  });

  it('takes «إِلْ يَاسِينَ» as the one word the print draws, and the reciters time', () => {
    // As-Saffat 130 on page 451: «سَلَـٰمٌ عَلَىٰٓ إِلْ يَاسِينَ», the last
    // two glyphs one word, which the timings join into word 3.
    const page = pages[450];
    const line = page.lines[1];
    if (line.t !== 'text') throw new Error('not text');
    const ayah = ayahIndex(37, 130);
    const words = pageWords(page)[1];
    const drawn = line.w.flatMap(([code], i) =>
      words[i].ayah === ayah ? [{ code, ...words[i] }] : [],
    );
    expect(drawn.map((d) => d.word)).toEqual([1, 2, 3, null]);
    expect(drawn[2].code).toBe('ﱑ ﱒ');
    const file = JSON.parse(
      readFileSync(join(root, 'words/husary/37.json'), 'utf8'),
    ) as WordsFile;
    const heard = readWords(file).ayat[129];
    expect(heard.full).toBe(true);
    expect([...new Set(heard.words.map((w) => w.word))]).toEqual([1, 2, 3]);
  });
});

describe('ayatOfLine', () => {
  it('lists the ayat a line draws any part of, once each, in order', () => {
    const lines = pageWords(pages[0]);
    expect(ayatOfLine(lines[3])).toEqual([3, 4]);
    expect(ayatOfLine(lines[0])).toEqual([]);
  });
});

/* Words written here are compared composed: the Mushaf's text writes آ as
   ا and its madda apart, and orders some marks otherwise than a keyboard. */
const composed = (texts: string[]) => texts.map((t) => t.normalize());

describe('entryTexts', () => {
  // Reads every word of the Mushaf: slow when the machine is busy. What
  // is wrong is gathered and checked once, not one expect a word.
  it('gives every entry of every line of the Mushaf its words, and only them', () => {
    let entries = 0;
    const wrong: string[] = [];
    for (const page of pages) {
      const words = pageWords(page);
      page.lines.forEach((line, i) => {
        if (line.t !== 'text') return;
        const at = `page ${page.page}, line ${i + 1}`;
        const texts = entryTexts(line.x);
        if (texts.length !== line.w.length) wrong.push(`${at}: count`);
        texts.forEach((text, j) => {
          // A word has letters; a marker is its ayah's number.
          const w = words[i][j];
          const ok = !w
            ? false
            : w.word === null
              ? text === `﴿${arabic(verseOf(w.ayah).ayah)}﴾`
              : /^(۞ )?\S*\p{L}/u.test(text);
          if (!ok) wrong.push(`${at}, entry ${j + 1}: ${text}`);
        });
        // Nothing left out and nothing added: joined, they are the line
        // (which has two spaces in one place, on page 225).
        if (texts.join(' ') !== line.x.replace(/ +/g, ' '))
          wrong.push(`${at}: text`);
        entries += texts.length;
      });
    }
    expect(wrong).toEqual([]);
    expect(entries).toBe(83_665);
  }, 30_000);

  it('keeps a pause mark with its word, and a quarter’s ۞ with the next', () => {
    // The top of page 378, an-Naml 14.
    const top = pages[377].lines[0];
    if (top.t !== 'text') throw new Error('not text');
    expect(composed(entryTexts(top.x))).toEqual(
      composed([
        'وَجَحَدُوا۟',
        'بِهَا',
        'وَٱسْتَيْقَنَتْهَآ',
        'أَنفُسُهُمْ',
        'ظُلْمًۭا',
        'وَعُلُوًّۭا ۚ',
        'فَٱنظُرْ',
        'كَيْفَ',
      ]),
    );
    expect(entryTexts('عِلْمٍ ﴿٢٥﴾ ۞ إِنَّ ٱلَّذِينَ')).toEqual([
      'عِلْمٍ',
      '﴿٢٥﴾',
      '۞ إِنَّ',
      'ٱلَّذِينَ',
    ]);
  });

  it('keeps the three words written in two parts whole', () => {
    expect(entryTexts('سَلَـٰمٌ عَلَىٰٓ إِلْ يَاسِينَ ﴿١٣٠﴾')).toEqual([
      'سَلَـٰمٌ',
      'عَلَىٰٓ',
      'إِلْ يَاسِينَ',
      '﴿١٣٠﴾',
    ]);
  });
});

describe('ayahText', () => {
  it('gives an ayah whole, over its lines, ending in its number', () => {
    expect(ayahText(pages[377], ayahIndex(27, 14)).normalize()).toBe(
      'وَجَحَدُوا۟ بِهَا وَٱسْتَيْقَنَتْهَآ أَنفُسُهُمْ ظُلْمًۭا وَعُلُوًّۭا ۚ فَٱنظُرْ كَيْفَ كَانَ عَـٰقِبَةُ ٱلْمُفْسِدِينَ ﴿١٤﴾'.normalize(),
    );
    expect(ayahText(pages[0], 1).normalize()).toBe(
      'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ ﴿١﴾'.normalize(),
    );
    expect(ayahText(pages[0], 8)).toBe('');
  });
});
