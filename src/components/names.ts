import { memberName, type Member } from '@/halaqa/state';

/* What a face and a narrow seat make of a member's name. */

/** Words that open an Arabic name without being the part that tells one
    person from another: «أبو أحمد», «أم أحمد», «عبد الله», «ابن عمر»,
    «بنت الشاطئ». */
const PREFIXES = new Set([
  'أبو',
  'ابو',
  'أبي',
  'أم',
  'ام',
  'عبد',
  'ابن',
  'بن',
  'بنت',
]);

const wordsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean);

/**
 * The letter a reader's face shows: the first of their name, but of the
 * word after a prefix, so «أبو بكر» and «أبو خالد» are «ب» and «خ» and not
 * both «أ»; and past the article, so «عبد الرحمن» is «ر» and «أبو الحسن»
 * «ح» (a word that is only the article and two letters, «الله», keeps
 * it: there it is part of the word). Undefined for no name. Two people whose letters still match (أبو أحمد
 * and أم أحمد) are told apart by their faces' tints (`tintOf`).
 */
export function initialOf(name: string) {
  const words = wordsOf(name);
  if (!words.length) return undefined;
  const word = words.length > 1 && PREFIXES.has(words[0]) ? words[1] : words[0];
  const bare = word.startsWith('ال') && word.length > 4 ? word.slice(2) : word;
  return bare.at(0);
}

/**
 * A name short enough for a seat in a crowded circle: its first word, or
 * the prefix and the word after it, which together are the name a person
 * is called by («أبو أحمد», «عبد الرحمن»). A reciter's short name and a
 * reader not named («القارئ الثاني») are short already, and kept whole.
 */
export function shortNameOf(member: Member) {
  const name = memberName(member);
  if (member.kind === 'reciter' || !member.name.trim()) return name;
  const words = wordsOf(name);
  const take = words.length > 1 && PREFIXES.has(words[0]) ? 2 : 1;
  return words.slice(0, take).join(' ');
}

/** How many tints faces are drawn in (tokens.css, `--seat-1` …). */
export const TINTS = 8;

/**
 * Which tint a member's face is drawn on, 1 to `TINTS`: each reader keeps
 * their own wherever they sit, in the circle, at the top and in the form,
 * and no two readers share one. Ids are «p1», «p2» … for readers and «r1»
 * … for reciters (`newMember`); a reciter's tint shows only when his photo
 * does not, and starts halfway round so a circle of two of each differs.
 */
export function tintOf(member: Member) {
  const n = Number(/\d+$/.exec(member.id)?.[0] ?? 0);
  const offset = member.kind === 'reciter' ? TINTS / 2 : 0;
  return ((n - 1 + offset + TINTS) % TINTS) + 1;
}
