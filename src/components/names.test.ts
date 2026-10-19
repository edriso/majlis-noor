import { describe, expect, it } from 'vitest';
import type { Member } from '@/halaqa/state';
import { initialOf, shortNameOf, tintOf, TINTS } from './names';

const person = (id: string, name: string): Member => ({
  id,
  kind: 'person',
  name,
});

describe('the letter on a face', () => {
  it('is the first letter of a plain name', () => {
    expect(initialOf('فاطمة الزهراء')).toBe('ف');
    expect(initialOf('  عمر ')).toBe('ع');
  });

  it('looks past a prefix, so «أبو بكر» and «أبو خالد» differ', () => {
    expect(initialOf('أبو بكر')).toBe('ب');
    expect(initialOf('أبو خالد')).toBe('خ');
    expect(initialOf('أم كلثوم')).toBe('ك');
    expect(initialOf('بنت الشاطئ')).toBe('ش');
    expect(initialOf('ابن عمر')).toBe('ع');
  });

  it('looks past the article, but not into «الله»', () => {
    expect(initialOf('عبد الرحمن')).toBe('ر');
    expect(initialOf('أبو الحسن')).toBe('ح');
    expect(initialOf('عبد الله')).toBe('ا');
  });

  it('keeps a prefix that is the whole name, and is nothing for no name', () => {
    expect(initialOf('أبو')).toBe('أ');
    expect(initialOf('  ')).toBeUndefined();
  });
});

describe('a name for a crowded seat', () => {
  it('is the first word, or the prefix and the word after it', () => {
    expect(shortNameOf(person('p1', 'فاطمة الزهراء'))).toBe('فاطمة');
    expect(shortNameOf(person('p1', 'أبو أحمد الكبير'))).toBe('أبو أحمد');
    expect(shortNameOf(person('p1', 'عبد الرحمن'))).toBe('عبد الرحمن');
  });

  it('keeps a reciter’s short name and an unnamed reader’s whole', () => {
    expect(shortNameOf({ id: 'r1', kind: 'reciter', reciter: 'husary' })).toBe(
      'الحصري',
    );
    expect(shortNameOf(person('p2', ''))).toBe('القارئ الثاني');
  });
});

describe('the tint of a face', () => {
  it('differs for every reader a circle can seat, and stays with them', () => {
    const tints = Array.from({ length: TINTS }, (_, i) =>
      tintOf(person(`p${i + 1}`, '')),
    );
    expect(new Set(tints).size).toBe(TINTS);
    expect(tints.every((t) => t >= 1 && t <= TINTS)).toBe(true);
    expect(tintOf(person('p3', 'سارة'))).toBe(tintOf(person('p3', 'مريم')));
  });

  it('starts a reciter’s halfway round', () => {
    expect(tintOf({ id: 'r1', kind: 'reciter', reciter: 'husary' })).toBe(
      TINTS / 2 + 1,
    );
  });
});
