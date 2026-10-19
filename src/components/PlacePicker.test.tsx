import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  firstAyahOfPage,
  juzRange,
  pageOfAyah,
  surahRange,
} from '@/data/mushaf';
import {
  findSurahs,
  PlacePicker,
  searchable,
  type PlaceChoice,
} from './PlacePicker';
import { Sheet } from './Sheet';

/** Al-Imran 1, on page 50, in the third juz. */
const here: PlaceChoice = { ayah: surahRange(3).from, page: 50 };

const picker = (initialBy?: 'surah' | 'juz' | 'page') => {
  const onChoose = vi.fn<(place: PlaceChoice) => void>();
  const user = userEvent.setup();
  render(
    <PlacePicker current={here} onChoose={onChoose} initialBy={initialBy} />,
  );
  return { user, onChoose };
};

const search = () =>
  screen.getByRole('searchbox', { name: 'اسم السورة أو رقمها' });
const results = () =>
  within(screen.getByRole('list'))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'));

describe('finding a surah', () => {
  it('reads a name as a reader types it', () => {
    expect(searchable('النَّبَأ')).toBe(searchable('النبإ'));
    expect(searchable('إبراهيم')).toBe(searchable('ابراهيم'));
    expect(searchable('سورة البقرة')).toBe('البقره');
    expect(searchable('سورة')).toBe('');
  });

  it('finds by name, part of a name, vowelled or not', () => {
    expect(findSurahs('البقرة').map((s) => s.n)).toEqual([2]);
    expect(findSurahs('بقره').map((s) => s.n)).toEqual([2]);
    expect(findSurahs('النبأ').map((s) => s.n)).toEqual([78]);
    expect(findSurahs('سبأ').map((s) => s.n)).toEqual([34]);
    expect(findSurahs('سورة يس').map((s) => s.n)).toEqual([36]);
    expect(findSurahs('الأنفال').map((s) => s.n)).toEqual([8]);
    expect(findSurahs('إبراهيم').map((s) => s.n)).toEqual([14]);
  });

  it('finds by number in either digits, the number itself first', () => {
    expect(findSurahs('١٨')[0].name).toBe('الكهف');
    expect(findSurahs('18')[0].name).toBe('الكهف');
    expect(findSurahs('١١٤').map((s) => s.n)).toEqual([114]);
    expect(findSurahs('1').map((s) => s.n)).toEqual([
      1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100, 101, 102, 103, 104, 105,
      106, 107, 108, 109, 110, 111, 112, 113, 114,
    ]);
  });

  it('finds every surah with nothing typed, and none for nonsense', () => {
    expect(findSurahs('')).toHaveLength(114);
    expect(findSurahs('   ')).toHaveLength(114);
    expect(findSurahs('زززز')).toEqual([]);
  });
});

describe('the place picker', () => {
  it('opens on the surahs, all of them, each named with its page', () => {
    picker();
    expect(
      (screen.getByRole('radio', { name: 'سورة' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(results()).toHaveLength(114);
    expect(results()[1]).toBe('٢. البقرة — الصفحة ٢');
    expect(
      screen
        .getByRole('button', { name: '٣. آل عمران — الصفحة ٥٠' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: '٢. البقرة — الصفحة ٢' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('opens in its sheet scrolled to the current surah', async () => {
    // jsdom lays nothing out, so a layout is made up here: one that exists
    // only once the sheet's dialog is open, as a browser's does.
    const drawn = (el: Element) => el.closest('dialog')?.open ?? false;
    const spies = [
      vi
        .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return drawn(this) && this.getAttribute('aria-pressed') === 'true'
            ? 4000
            : 0;
        }),
      vi
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return drawn(this) ? 40 : 0;
        }),
      vi
        .spyOn(HTMLElement.prototype, 'clientHeight', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return drawn(this) ? 400 : 0;
        }),
    ];
    render(
      <Sheet open onOpenChange={() => {}} title="من أين نبدأ؟">
        <PlacePicker current={here} onChoose={() => {}} />
      </Sheet>,
    );
    await new Promise((done) => requestAnimationFrame(done));
    // The surah in the middle of the list's 400px: 4000 - (400 - 40) / 2.
    expect(screen.getByRole('list').scrollTop).toBe(3820);
    for (const spy of spies) spy.mockRestore();
  });

  it('filters as it is typed, and says how many it found', async () => {
    const { user } = picker();
    await user.type(search(), 'الكهف');
    expect(results()).toEqual(['١٨. الكهف — الصفحة ٢٩٣']);
    expect(screen.getByText('سورة واحدة')).toBeTruthy();
    await user.clear(search());
    await user.type(search(), '٣٦');
    expect(results()[0]).toBe('٣٦. يس — الصفحة ٤٤٠');
    await user.clear(search());
    await user.type(search(), 'ززز');
    expect(screen.queryByRole('list')).toBeTruthy();
    expect(screen.getByText('لا سورة بهذا الاسم أو الرقم')).toBeTruthy();
  });

  it('reports a surah as its first ayah and that ayah’s page', async () => {
    const { user, onChoose } = picker();
    await user.click(screen.getByRole('button', { name: /^٢\. البقرة/ }));
    expect(onChoose).toHaveBeenCalledWith({ ayah: 8, page: 2 });
    // An-Nisa's header is at the foot of page 76; its first ayah is on 77.
    await user.type(search(), 'النساء');
    await user.click(screen.getByRole('button', { name: /^٤\. النساء/ }));
    expect(onChoose).toHaveBeenLastCalledWith({
      ayah: surahRange(4).from,
      page: 77,
    });
  });

  it('takes the first surah found on Enter, and walks the list by keys', async () => {
    const { user, onChoose } = picker();
    await user.type(search(), 'الملك{Enter}');
    expect(onChoose).toHaveBeenCalledWith({
      ayah: surahRange(67).from,
      page: pageOfAyah(surahRange(67).from),
    });
    await user.clear(search());
    await user.type(search(), '١١');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^١١\. هود/,
    );
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^١١٠\. النصر/,
    );
    await user.keyboard('{End}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^١١٤\. الناس/,
    );
    await user.keyboard('{Home}{ArrowUp}');
    expect(document.activeElement).toBe(search());
  });

  it('offers the thirty juz, and reports where each truly begins', async () => {
    const { user, onChoose } = picker();
    await user.click(screen.getByRole('radio', { name: 'جزء' }));
    const grid = screen.getByRole('list', { name: 'الأجزاء' });
    expect(within(grid).getAllByRole('button')).toHaveLength(30);
    expect(
      screen
        .getByRole('button', { name: 'الجزء ٣' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    // The fourth juz begins part-way down page 62, at its ayah.
    await user.click(screen.getByRole('button', { name: 'الجزء ٤' }));
    const start = juzRange(4).from;
    expect(onChoose).toHaveBeenCalledWith({ ayah: start, page: 62 });
    expect(firstAyahOfPage(62)).toBeLessThan(start);
  });

  it('takes a page in either digits, saying what is on it', async () => {
    const { user, onChoose } = picker('page');
    const field = screen.getByRole('textbox', { name: 'رقم الصفحة' });
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field).toHaveProperty('type', 'text');
    expect((field as HTMLInputElement).value).toBe('٥٠');
    await user.clear(field);
    await user.type(field, '٢٤');
    expect(screen.getByRole('status').textContent).toBe(
      'سورة البقرة · الجزء ٢',
    );
    await user.click(screen.getByRole('button', { name: 'انتقل' }));
    expect(onChoose).toHaveBeenCalledWith({
      ayah: firstAyahOfPage(24),
      page: 24,
    });
    await user.clear(field);
    await user.type(field, '604{Enter}');
    expect(screen.getByRole('status').textContent).toBe(
      'سورة الإخلاص · سورة الفلق · سورة الناس · الجزء ٣٠',
    );
    expect(onChoose).toHaveBeenLastCalledWith({
      ayah: firstAyahOfPage(604),
      page: 604,
    });
  });

  it('refuses a page that is not in the Mushaf', async () => {
    const { user, onChoose } = picker('page');
    const field = screen.getByRole('textbox', { name: 'رقم الصفحة' });
    for (const typed of ['٠', '٦٠٥', 'صفحة']) {
      await user.clear(field);
      await user.type(field, `${typed}{Enter}`);
      expect(field.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('status').textContent).toBe(
        'اكتب رقمًا من ١ إلى ٦٠٤',
      );
    }
    await user.click(screen.getByRole('button', { name: 'انتقل' }));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('names every control it draws', async () => {
    const { user } = picker();
    const unnamed = () =>
      [...document.querySelectorAll('button, input')].filter(
        (el) =>
          !el.getAttribute('aria-label') &&
          !el.getAttribute('aria-labelledby') &&
          !(el as HTMLInputElement).labels?.length &&
          !el.textContent?.trim(),
      );
    expect(unnamed()).toEqual([]);
    await user.click(screen.getByRole('radio', { name: 'جزء' }));
    expect(unnamed()).toEqual([]);
    await user.click(screen.getByRole('radio', { name: 'صفحة' }));
    expect(unnamed()).toEqual([]);
  });
});
