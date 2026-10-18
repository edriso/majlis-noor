import { describe, expect, it } from 'vitest';
import {
  ayahIndex,
  ayatOfPage,
  rubRange,
  surahRange,
  AYAH_COUNT,
} from '@/data/mushaf';
import {
  ayatLabel,
  pagesLabel,
  pagesShort,
  rangeLabel,
  rangeShort,
} from './labels';

/** Al-Kahf `a` to `b`, as a half-open range. */
const kahf = (a: number, b: number) => ({
  from: ayahIndex(18, a),
  to: ayahIndex(18, b) + 1,
});

describe('pages', () => {
  it('names one, two or several', () => {
    expect(pagesLabel([24])).toBe('الصفحة ٢٤');
    expect(pagesLabel([24, 25])).toBe('الصفحتان ٢٤ و٢٥');
    expect(pagesLabel([24, 25, 26])).toBe('الصفحات ٢٤–٢٦');
    expect(pagesLabel([])).toBe('');
    expect(pagesShort([24])).toBe('ص ٢٤');
    expect(pagesShort([24, 25])).toBe('ص ٢٤–٢٥');
  });
});

describe('a turn, in its own unit', () => {
  it('names pages by their numbers', () => {
    expect(rangeLabel('page', ayatOfPage(24))).toBe('الصفحة ٢٤');
    expect(
      rangeLabel('page', { from: ayatOfPage(24).from, to: ayatOfPage(25).to }),
    ).toBe('الصفحتان ٢٤ و٢٥');
    expect(rangeShort('page', ayatOfPage(24))).toBe('ص ٢٤');
  });

  it('names ayat within their surah', () => {
    expect(rangeLabel('ayah', kahf(5, 9))).toBe('الآيات ٥–٩ من سورة الكهف');
    expect(rangeLabel('ayah', kahf(7, 7))).toBe('الآية ٧ من سورة الكهف');
    expect(rangeShort('ayah', kahf(5, 9))).toBe('الكهف ٥–٩');
    expect(rangeShort('ayah', kahf(7, 7))).toBe('الكهف ٧');
  });

  it('names both surahs when a turn of ayat crosses from one to the next', () => {
    const across = { from: ayahIndex(1, 7), to: ayahIndex(2, 3) + 1 };
    expect(ayatLabel(across)).toBe('من الفاتحة ٧ إلى البقرة ٣');
    expect(rangeShort('ayah', across)).toBe('الفاتحة ٧ – البقرة ٣');
  });

  it('names a quarter as the margin does', () => {
    expect(rangeLabel('rub', rubRange(10))).toBe('ربع الحزب ٣');
    expect(rangeLabel('rub', rubRange(9))).toBe('الحزب ٣');
    expect(rangeShort('rub', rubRange(11))).toBe('نصف الحزب ٣');
  });

  it('names a surah', () => {
    expect(rangeLabel('surah', surahRange(67))).toBe('سورة الملك');
    expect(rangeShort('surah', surahRange(67))).toBe('الملك');
  });

  it('names a quarter or a surah cut short by its ayat', () => {
    // A sitting that stops at the end of juz 1 cuts al-Baqarah at 141.
    const cut = { from: surahRange(2).from, to: ayahIndex(2, 141) + 1 };
    expect(rangeLabel('surah', cut)).toBe('الآيات ١–١٤١ من سورة البقرة');
    const quarter = rubRange(240);
    expect(rangeLabel('rub', { ...quarter, to: quarter.to - 3 })).toBe(
      'من العاديات ٩ إلى الناس ٣',
    );
    expect(rangeLabel('rub', rubRange(240))).toBe('ثلاثة أرباع الحزب ٦٠');
    expect(rubRange(240).to).toBe(AYAH_COUNT + 1);
  });

  it('says nothing for a turn with nothing left', () => {
    expect(rangeLabel('ayah', { from: 9, to: 9 })).toBe('');
    expect(rangeShort('surah', { from: 9, to: 9 })).toBe('');
  });
});
