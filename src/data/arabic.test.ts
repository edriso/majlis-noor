import { describe, expect, it } from 'vitest';
import {
  arabic,
  ayatCount,
  clock,
  digits,
  durationWords,
  pagesCount,
  readersCount,
} from './arabic';

describe('numbers', () => {
  it('writes Arabic-Indic digits', () => {
    expect(arabic(604)).toBe('٦٠٤');
  });
  it('reads either set of digits back', () => {
    expect(digits('٢٤')).toBe('24');
    expect(digits('24')).toBe('24');
    expect(digits('۲۴')).toBe('24');
    expect(digits('ص ٢٤')).toBe('24');
  });
});

describe('counted nouns', () => {
  it('agrees with the number beside it', () => {
    expect(pagesCount(1)).toBe('صفحة واحدة');
    expect(pagesCount(2)).toBe('صفحتان');
    expect(pagesCount(3)).toBe('٣ صفحات');
    expect(pagesCount(10)).toBe('١٠ صفحات');
    expect(pagesCount(11)).toBe('١١ صفحة');
    expect(pagesCount(103)).toBe('١٠٣ صفحات');
    expect(pagesCount(120)).toBe('١٢٠ صفحة');
    expect(readersCount(3)).toBe('٣ قرّاء');
  });
  it('counts ayat the same way', () => {
    expect(ayatCount(1)).toBe('آية واحدة');
    expect(ayatCount(2)).toBe('آيتان');
    expect(ayatCount(3)).toBe('٣ آيات');
    expect(ayatCount(10)).toBe('١٠ آيات');
    expect(ayatCount(11)).toBe('١١ آية');
    expect(ayatCount(103)).toBe('١٠٣ آيات');
    expect(ayatCount(286)).toBe('٢٨٦ آية');
  });
});

describe('durations', () => {
  it('shows a countdown with padded seconds', () => {
    expect(clock(92_000)).toBe('١:٣٢');
    expect(clock(5_000)).toBe('٠:٠٥');
    expect(clock(-1)).toBe('٠:٠٠');
    expect(clock(Number.NaN)).toBe('٠:٠٠');
  });
  it('says it in words', () => {
    expect(durationWords(80_000)).toBe('دقيقة و٢٠ ثانية');
    expect(durationWords(120_000)).toBe('دقيقتان');
    expect(durationWords(0)).toBe('أقل من ثانية');
  });
});
