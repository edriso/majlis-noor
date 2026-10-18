/* Which word of which ayah each glyph on a page draws, so the page can mark
   a word or an ayah, and say which one a finger touched.

   A line's `w` is its words in reading order, each a glyph (or two, or a
   hizb quarter's ۞ and the word after it) with its verse key. The Madani
   print ends every page on a whole ayah, and every ayah ends in its
   end-of-ayah marker, which carries the ayah's key like its words; so on
   any page an ayah's entries run unbroken, and its last one is its marker.
   Word n of an ayah is then its n-th entry before the marker, which is how
   the print counts words and how the word timings number them
   (src/data/audio.ts). mushaf.test.ts holds every page to reading order,
   which is what makes this safe. */

import { ayahOfKey, type Page } from '@/data/mushaf';

/** What one entry of a line draws: its ayah, by its number through the
    whole Mushaf, and which word of it, counted from 1 as the print counts
    them, or null for the ayah's end-of-ayah marker. */
export type GlyphWord = { ayah: number; word: number | null };

/** Every line's entries as words of their ayat, index for index with the
    line's `w`; a surah header or a basmala has none. */
export function pageWords(page: Page): GlyphWord[][] {
  const lines = page.lines.map((line) => (line.t === 'text' ? line.w : []));
  const flat = lines.flat();
  let i = 0;
  let ayah = 0;
  let count = 0;
  return lines.map((entries) =>
    entries.map(([, key]) => {
      const next = flat[++i];
      const n = ayahOfKey(key);
      if (n !== ayah) {
        ayah = n;
        count = 0;
      }
      // The last of an ayah's entries is its marker.
      if (next?.[1] !== key) return { ayah: n, word: null };
      return { ayah: n, word: ++count };
    }),
  );
}

/** The ayat a line draws any part of, in order. */
export const ayatOfLine = (words: readonly GlyphWord[]) => [
  ...new Set(words.map((w) => w.ayah)),
];
