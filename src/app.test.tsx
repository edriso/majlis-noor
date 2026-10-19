import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { clock } from '@/data/arabic';
import { ayahIndex } from '@/data/mushaf';
import { ayatDuration, loadTimings } from '@/data/timings';
import { player } from '@/halaqa/useRecitation';
import { App } from './App';

/* Every Mushaf page drawn is counted, and every turn strip at the top,
   which the reading screen draws whenever it is drawn itself, so a test
   can tell that a turn's clock running draws neither the page nor the
   screen. */
const draws = vi.hoisted(() => ({ page: 0, screen: 0 }));
vi.mock('@/mushaf/MushafPage', async (original) => {
  const real = await original<typeof import('@/mushaf/MushafPage')>();
  return {
    ...real,
    MushafPage: (props: Parameters<typeof real.MushafPage>[0]) => {
      draws.page++;
      return createElement(real.MushafPage, props);
    },
  };
});
vi.mock('@/screens/reading/TurnStrip', async (original) => {
  const real = await original<typeof import('@/screens/reading/TurnStrip')>();
  return {
    ...real,
    TurnStrip: (props: Parameters<typeof real.TurnStrip>[0]) => {
      draws.screen++;
      return createElement(real.TurnStrip, props);
    },
  };
});

const addReader = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /أضف قارئًا/ }));

/** Starts a halaqa set up as `config` from the start screen, as a reader
    would after setting it up there. */
const startWith = async (config: object) => {
  localStorage.setItem('majlis-noor:v1', JSON.stringify({ config }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /ابدأ المجلس/ }));
  return user;
};

const you = { id: 'p1', kind: 'person', name: '' };
const omar = { id: 'p2', kind: 'person', name: 'عمر' };
const minshawi = { id: 'r1', kind: 'reciter', reciter: 'minshawi' };
/** Al-Kahf 5, the first ayah of page 294. */
const kahf5 = ayahIndex(18, 5);

/** The one main button under the page. */
const primary = () => document.querySelector<HTMLElement>('.action-primary')!;

/** A halaqa of three readers, «أنت» and the two added after. */
const start = async () => {
  const user = userEvent.setup();
  render(<App />);
  await addReader(user);
  await addReader(user);
  await user.click(screen.getByRole('button', { name: /ابدأ المجلس/ }));
  return user;
};

/** The chip at the top: the page open, «ص ٥٠»; a press opens the jump. */
const topLine = () =>
  within(document.querySelector<HTMLElement>('.topbar')!).getByRole('button', {
    name: /انتقل إلى موضع آخر/,
  });
const place = () => topLine().textContent;
/** What the strip at the top shows: whose turn, then, quietly, what it
    reads and who reads after, «دورك · الآيات ٥–٩ · ثم عمر». */
const status = () =>
  [...document.querySelectorAll('.turn-name, .turn-detail > span')]
    .map((el) => el.textContent)
    .join(' · ');
/** What a screen reader hears of the turn: the strip's sentence, without
    the words drawn for the eye, which are hidden from it. */
const said = () =>
  [...screen.getByRole('status').childNodes]
    .filter((n) => !(n instanceof Element && n.closest('[aria-hidden="true"]')))
    .map((n) => n.textContent)
    .join('');

describe('the start screen', () => {
  it('names the app once, as the page heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'مجلس نور',
    );
  });

  it('shows the starting place whichever way it is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);
    const row = () => screen.getByRole('button', { name: /غيّر موضع البدء$/ });
    expect(row().textContent).toContain('سورة الفاتحة');
    await user.click(row());
    await user.click(screen.getByRole('button', { name: /^٢\. البقرة/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row().textContent).toContain('الصفحة ٢ · الجزء ١');
    await user.click(row());
    await user.click(screen.getByLabelText('جزء'));
    await user.click(screen.getByRole('button', { name: 'الجزء ٣٠' }));
    expect(row().textContent).toContain('الصفحة ٥٨٢');
    await user.click(row());
    await user.click(screen.getByLabelText('صفحة'));
    const field = screen.getByLabelText(/رقم الصفحة/);
    await user.clear(field);
    await user.type(field, '٢٤{Enter}');
    expect(row().textContent).toContain('الصفحة ٢٤');
  });

  it('seats only «أنت» at first, and hides the reading mode for one', async () => {
    const user = userEvent.setup();
    render(<App />);
    const mode = async () => {
      await user.click(
        screen.getByRole('button', { name: /غيّر طريقة الحلقة$/ }),
      );
      const group = screen.queryByRole('group', { name: 'طريقة القراءة' });
      await user.click(screen.getByRole('button', { name: 'إغلاق' }));
      return group;
    };
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('textbox', { name: 'اسم القارئ في المقعد ١' }),
    ).toHaveProperty('placeholder', 'اسمك (اختياري)');
    expect(await mode()).toBeNull();
    await addReader(user);
    expect(await mode()).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'إخراج من الحلقة: القارئ الثاني' }),
    );
    expect(await mode()).toBeNull();
  });

  it('keeps the circle as it was set up for the next visit', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addReader(user);
    await user.type(
      screen.getByRole('textbox', { name: 'اسم القارئ في المقعد ٢' }),
      'عمر',
    );
    await user.click(screen.getByRole('button', { name: /أضف شيخًا/ }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /^محمد صديق المنشاوي/,
      }),
    );
    // Closed before «ابدأ المجلس» was ever pressed.
    cleanup();
    render(<App />);
    const seats = screen.getAllByRole('listitem');
    expect(seats).toHaveLength(3);
    expect(
      (
        screen.getByRole('textbox', {
          name: 'اسم القارئ في المقعد ٢',
        }) as HTMLInputElement
      ).value,
    ).toBe('عمر');
    expect(seats[2].textContent).toContain('الشيخ المنشاوي');
  });

  it('seats a sheikh, and puts him first', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /أضف شيخًا/ }));
    const sheet = screen.getByRole('dialog', { name: 'أضف شيخًا إلى الحلقة' });
    // A sample plays from its reciter's timings, which the list asks for
    // as it opens; the sheet opens at once, so they are awaited here.
    await act(() => vi.dynamicImportSettled());
    // Heard before chosen: the sample button presses and unpresses.
    const sample = within(sheet).getByRole('button', {
      name: /^استمع إلى محمد صديق المنشاوي/,
    });
    await user.click(sample);
    expect(sample.getAttribute('aria-pressed')).toBe('true');
    await user.click(sample);
    expect(sample.getAttribute('aria-pressed')).toBe('false');
    // «أبو» after «إلى» is «أبي».
    expect(
      within(sheet).getByRole('button', {
        name: 'استمع إلى أبي بكر الشاطري (مرتّل) يتلو الفاتحة',
      }),
    ).toBeTruthy();
    await user.click(
      within(sheet).getByRole('button', { name: /^محمد صديق المنشاوي/ }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    const seats = () =>
      screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(seats().at(-1)).toContain('الشيخ المنشاوي');
    await user.click(screen.getByRole('button', { name: 'تقديم: المنشاوي' }));
    expect(seats()[0]).toContain('الشيخ المنشاوي');
    expect(screen.getByRole('status').textContent).toContain(
      'المنشاوي: المقعد ١ من ٢',
    );
    // A full circle, eight seats, takes no one else.
    for (let i = 0; i < 6; i++) await addReader(user);
    expect(
      screen
        .getByRole('button', { name: /أضف قارئًا/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: /ابدأ المجلس/ }));
    expect(status()).toContain('يتلو المنشاوي');
    expect(screen.getByRole('button', { name: /تلاوة المنشاوي/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^تخطَّ إليك/ }));
    expect(status()).toContain('دورك');
    expect(place()).toBe('ص ٢');
  });

  it('groups the reciters by pace', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /أضف شيخًا/ }));
    const sheet = screen.getByRole('dialog', { name: 'أضف شيخًا إلى الحلقة' });
    const bands = within(sheet)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(bands).toEqual([
      'أداء متأنٍّ جدًّا',
      'أداء متأنٍّ',
      'أداء معتدل',
      'أداء سريع',
    ]);
    expect(
      within(sheet).getByRole('button', { name: /^سعود الشريم.*١:٤٨ للصفحة/ }),
    ).toBeTruthy();
  });

  it('hides the reciters’ photos for whoever would rather not see faces', async () => {
    const user = userEvent.setup();
    render(<App />);
    const photos = () => document.querySelectorAll('img.reciter-photo');
    // No face before the choice is there to make.
    expect(photos()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    await user.click(screen.getByRole('radio', { name: 'مموّهة' }));
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    await user.click(screen.getByRole('button', { name: /أضف شيخًا/ }));
    expect(photos().length).toBeGreaterThan(0);
    expect([...photos()].every((img) => img.hasAttribute('data-blur'))).toBe(
      true,
    );
    await user.click(
      screen.getByRole('button', { name: /^محمد صديق المنشاوي/ }),
    );
    expect(photos()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    await user.click(screen.getByRole('radio', { name: 'مخفية' }));
    expect(photos()).toHaveLength(0);
  });

  it('names a reader by what was typed, and keeps the default otherwise', async () => {
    const user = userEvent.setup();
    render(<App />);
    await addReader(user);
    await user.type(
      screen.getByRole('textbox', { name: 'اسم القارئ في المقعد ٢' }),
      'عمر',
    );
    await user.click(screen.getByRole('button', { name: 'تأخير: أنت' }));
    // «أنت» moved, and kept being «أنت»; Omar now sits first.
    expect(
      (
        screen.getByRole('textbox', {
          name: 'اسم القارئ في المقعد ١',
        }) as HTMLInputElement
      ).value,
    ).toBe('عمر');
    await user.click(screen.getByRole('button', { name: /ابدأ المجلس/ }));
    expect(status()).toContain('دور عمر');
  });
});

describe('a halaqa', () => {
  it('passes the turn round the circle', async () => {
    const user = await start();
    expect(status()).toContain('دورك');
    expect(place()).toBe('ص ١');
    await user.click(screen.getByRole('button', { name: /^تمّ — التالي/ }));
    expect(status()).toContain('دور القارئ الثاني');
    expect(place()).toBe('ص ٢');
    await user.click(screen.getByRole('button', { name: /القارئ السابق/ }));
    expect(status()).toContain('دورك');
  });

  it('moves on with the left arrow, the way an Arabic book turns', async () => {
    await start();
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(place()).toBe('ص ٢');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(place()).toBe('ص ١');
  });

  it('leaves the keys to an open sheet', async () => {
    const user = await start();
    await user.click(topLine());
    const sheet = screen.getByRole('dialog', { name: 'الانتقال إلى' });
    act(() => {
      fireEvent.keyDown(within(sheet).getByRole('heading'), {
        key: 'ArrowLeft',
      });
    });
    expect(place()).toBe('ص ١');
    await user.click(within(sheet).getByRole('button', { name: 'إغلاق' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(place()).toBe('ص ٢');
  });

  it('is offered again after a refresh', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^تمّ — التالي/ }));
    cleanup();
    render(<App />);
    const card = screen.getByRole('region', { name: 'تابع مجلسك' });
    expect(within(card).getByText(/الصفحة ٢ · سورة البقرة/)).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: /متابعة/ }));
    expect(status()).toContain('دور القارئ الثاني');
  });

  it('pauses the reciter heard through «استمع» with the turn’s clock', async () => {
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({ config: { turnChange: 'reciter' } }),
    );
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^استمع إلى الصفحة/ }));
    await screen.findByRole('button', { name: /^إيقاف مؤقت للاستماع/ });
    await user.click(
      screen.getByRole('button', { name: /إيقاف التوقيت مؤقتًا/ }),
    );
    expect(
      screen.getByRole('button', { name: /^متابعة الاستماع/ }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /استئناف التوقيت/ }));
    expect(
      await screen.findByRole('button', { name: /^إيقاف مؤقت للاستماع/ }),
    ).toBeTruthy();
  });

  it('gives a timed reader the allowance the halaqa chose', async () => {
    // Al-Fatiha, which al-Husary recites in 48 seconds: half as long again
    // is a minute and some, where without it the clock would show ٠:٤٩.
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({ config: { turnChange: 'reciter', allowance: 1.5 } }),
    );
    await start();
    // Once, on the pause button beside the main one.
    expect(await screen.findAllByText(/١:١[٠-٣]/)).toHaveLength(1);
  });

  it('hides «القارئ السابق» on the first turn, and keeps the focus', async () => {
    const user = await start();
    const back = () => screen.queryByRole('button', { name: 'القارئ السابق' });
    expect(back()).toBeNull();
    await user.click(primary());
    back()!.focus();
    await user.keyboard('{Enter}');
    expect(status()).toContain('دورك');
    expect(back()).toBeNull();
    // The button pressed went; the focus went on to the main one.
    expect(document.activeElement).toBe(primary());
  });

  it('shows how far the sitting has come, in words', async () => {
    await startWith({ members: [you], start: ayahIndex(3, 1) });
    const line = screen.getByRole('progressbar', { name: 'الموضع في المصحف' });
    expect(line.getAttribute('aria-valuetext')).toBe('الصفحة ٥٠ من ٦٠٤');
    // The place is the chip's to show; the line keeps its words unseen.
    expect(document.querySelector('.progress-label')).toBeNull();
    cleanup();
    await startWith({
      members: [you],
      start: ayahIndex(3, 1),
      goal: { to: 'page', page: 52 },
    });
    expect(
      screen
        .getByRole('progressbar', { name: 'الطريق إلى الغاية' })
        .getAttribute('aria-valuetext'),
    ).toBe('٣ صفحات إلى الغاية');
    // On the way to a goal the words are written on the line as well.
    expect(document.querySelector('.progress-label')?.textContent).toBe(
      '٣ صفحات إلى الغاية',
    );
  });

  it('announces whose turn it is to a screen reader', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^تمّ — التالي/ }));
    expect(said()).toContain('دور القارئ الثاني، الصفحة ٢');
  });

  it('keeps the focus on the main button as the turn passes to a reciter', async () => {
    const user = await startWith({ members: [you, minshawi] });
    const button = primary();
    await user.click(button);
    expect(status()).toContain('يتلو المنشاوي');
    // The same element, now his recitation's, and still focused.
    expect(primary()).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-label')).toMatch(/تلاوة المنشاوي$/);
  });

  it('says a round read by everyone, and who it passed over', async () => {
    const user = await startWith({ members: [you, omar], mode: 'repeat' });
    await user.click(primary());
    await user.click(primary());
    expect(screen.getByText('قرأ الجميع الصفحة ١.')).toBeTruthy();
    // Omar's turn, jumped to page 5 after «أنت» had read page 1: «أنت»
    // did not read page 5, and the circle says so.
    cleanup();
    const config = { members: [you, omar], mode: 'repeat' };
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({
        config,
        session: { config, anchor: { turn: 1, at: 5 }, turn: 1 },
      }),
    );
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^متابعة/ }));
    await user.click(screen.getByRole('button', { name: 'الحلقة' }));
    const seats = [...document.querySelectorAll('.halaqa-seat')].map(
      (s) => s.textContent,
    );
    expect(seats[0]).toContain('لم يقرأها');
    expect(seats[1]).toContain('يقرأ الآن');
  });

  it('says a seat’s next page in words, and tells faces apart', async () => {
    const abuAhmad = { id: 'p1', kind: 'person', name: 'أبو أحمد' };
    const ummAhmad = { id: 'p2', kind: 'person', name: 'أم أحمد' };
    const fatima = { id: 'p3', kind: 'person', name: 'فاطمة الزهراء' };
    const user = await startWith({ members: [abuAhmad, ummAhmad, fatima] });
    await user.click(screen.getByRole('button', { name: 'الحلقة' }));
    const seat = document.querySelectorAll('.halaqa-seat')[2];
    // «ص ٣» is for the eye; a screen reader hears «الصفحة ٣».
    const status = seat.querySelector('.seat-status')!;
    expect(status.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      'ص ٣',
    );
    expect(status.querySelector('.visually-hidden')?.textContent).toBe(
      'الصفحة ٣',
    );
    // The whole name, its first word ready to stand alone.
    expect(seat.querySelector('.seat-name')?.textContent).toBe('فاطمة الزهراء');
    expect(seat.querySelector('.seat-name-rest')?.textContent).toBe(' الزهراء');
    // The same letter, but not the same face.
    const faces = [...document.querySelectorAll('.halaqa-seat .member-face')];
    expect(faces[0].textContent).toBe(faces[1].textContent);
    expect(faces[0].getAttribute('data-tint')).not.toBe(
      faces[1].getAttribute('data-tint'),
    );
  });

  it('listens for keys once, however often the turn passes', async () => {
    const user = await start();
    const bound = vi.spyOn(window, 'addEventListener');
    for (let i = 0; i < 3; i++) await user.click(primary());
    expect(bound.mock.calls.filter(([type]) => type === 'keydown')).toEqual([]);
    bound.mockRestore();
  });

  it('draws only the clock as a timed turn’s clock runs', async () => {
    // Fake time, from before the clock starts, so its interval is one the
    // test can move on; it still advances on its own for userEvent.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await startWith({ members: [you, omar], turnChange: 'reciter' });
      const timer = await screen.findByRole('button', { name: /^[٠-٩]+:/ });
      const before = timer.getAttribute('aria-label');
      const { page, screen: drawn } = draws;
      await act(async () => vi.advanceTimersByTime(1300));
      expect(timer.getAttribute('aria-label')).not.toBe(before);
      expect(draws.page).toBe(page);
      expect(draws.screen).toBe(drawn);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a circle that reads by the ayah', () => {
  const ayat = { members: [you, omar], unit: 'ayah', size: 5, start: kahf5 };

  it('names each turn by its ayat, and passes them round', async () => {
    const user = await startWith(ayat);
    expect(status()).toContain('دورك · الآيات ٥–٩');
    expect(primary().textContent).toContain('عمر · الآيات ١٠–١٤');
    expect(said()).toBe('دورك، الآيات ٥–٩ من سورة الكهف');
    await user.click(primary());
    expect(status()).toContain('دور عمر · الآيات ١٠–١٤');
    await user.click(primary());
    expect(status()).toContain('دورك · الآيات ١٥–١٩');
    await user.click(screen.getByRole('button', { name: 'القارئ السابق' }));
    expect(status()).toContain('دور عمر · الآيات ١٠–١٤');
    // The circle says what each seat reads next, in ayat.
    await user.click(screen.getByRole('button', { name: 'الحلقة' }));
    expect(
      [...document.querySelectorAll('.halaqa-seat')].map((s) => s.textContent),
    ).toEqual(['أنتالتالي', 'ععمريقرأ الآن']);
    expect(screen.getByText('قرأتم ٥ آيات في هذا المجلس')).toBeTruthy();
  });

  it('turns between the turn’s pages with a finger, and no further', async () => {
    // Al-Kahf 14 to 18: two ayat at the foot of page 294, three on 295.
    await startWith({ ...ayat, start: ayahIndex(18, 14) });
    const stage = screen.getByRole('region', { name: /^المصحف، الصفحة/ });
    const draw = (from: number, to: number) => {
      fireEvent.pointerDown(stage, {
        pointerId: 1,
        isPrimary: true,
        clientX: from,
        clientY: 100,
      });
      fireEvent.pointerUp(stage, {
        pointerId: 1,
        isPrimary: true,
        clientX: to,
        clientY: 104,
      });
    };
    // Rightwards is forward, as a right-to-left book turns.
    draw(100, 260);
    expect(place()).toBe('ص ٢٩٥');
    // Past the turn's last page, the turn is the main button's to pass.
    draw(100, 260);
    expect(place()).toBe('ص ٢٩٥');
    expect(status()).toContain('دورك');
    draw(260, 100);
    expect(place()).toBe('ص ٢٩٤');
    // A tap is left for the page.
    draw(100, 110);
    expect(place()).toBe('ص ٢٩٤');
  });

  it('turns the page when a turn’s ayat run onto the next', async () => {
    // Al-Kahf 14 to 18: two ayat at the foot of page 294, three on 295.
    const user = await startWith({ ...ayat, start: ayahIndex(18, 14) });
    expect(status()).toContain('الآيات ١٤–١٨');
    expect(primary().textContent).toContain('الصفحة التالية');
    expect(primary().textContent).toContain('٢ من ٢ · ثم عمر');
    await user.click(primary());
    expect(said()).toContain('الآن الصفحة ٢٩٥');
    expect(status()).toContain('دورك');
  });

  it('lets the seat that opens each page move round', async () => {
    // Page 299 holds al-Kahf 46 to 53, eight ayat: taking one each, «أنت»
    // opens it and Omar ends it, so Omar opens page 300 too, and «أنت»
    // the page after.
    const user = await startWith({
      ...ayat,
      size: 1,
      rotate: 'page',
      start: ayahIndex(18, 46),
    });
    for (let i = 0; i < 7; i++) await user.click(primary());
    expect(status()).toContain('دور عمر · الآية ٥٣');
    expect(primary().textContent).toContain('عمر · الآية ٥٤');
    await user.click(primary());
    expect(status()).toContain('دور عمر · الآية ٥٤');
    expect(primary().textContent).toContain('أنت · الآية ٥٥');
    await user.click(screen.getByRole('button', { name: 'القارئ السابق' }));
    expect(status()).toContain('دور عمر · الآية ٥٣');
  });

  it('recites exactly the ayat of a reciter’s turn', async () => {
    await startWith({ ...ayat, members: [minshawi, you] });
    await act(() => vi.dynamicImportSettled());
    const t = await loadTimings('minshawi');
    expect(player.getState()).toMatchObject({
      key: expect.stringMatching(/^turn:.*:minshawi$/),
      page: 294,
      total: ayatDuration(t, '18:5', '18:9'),
    });
    expect(status()).toContain('يتلو المنشاوي · الآيات ٥–٩');
    expect(
      screen.getByRole('button', { name: 'تخطَّ إليك، الآيات ١٠–١٤' }),
    ).toBeTruthy();
  });

  /** Adds a reader from the menu's form, as the circle is changed in a
      sitting. */
  const addFromMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(screen.getByRole('button', { name: /^عدّل الحلقة/ }));
    const form = screen.getByRole('dialog', { name: 'عدّل الحلقة' });
    await user.click(within(form).getByRole('button', { name: /أضف قارئًا/ }));
    await user.keyboard('{Escape}');
  };

  it('lets a sheikh recite on when someone joins the circle', async () => {
    const user = await startWith({ ...ayat, members: [minshawi, you] });
    await act(() => vi.dynamicImportSettled());
    const reciting = player.getState().key;
    expect(reciting).toMatch(/^turn:.*:minshawi$/);
    await addFromMenu(user);
    expect(status()).toContain('يتلو المنشاوي · الآيات ٥–٩');
    expect(player.getState().key).toBe(reciting);
  });

  it('keeps a timed reader’s clock when someone joins the circle', async () => {
    const user = await startWith({ ...ayat, turnChange: 'reciter' });
    await user.click(
      await screen.findByRole('button', { name: /إيقاف التوقيت مؤقتًا/ }),
    );
    await addFromMenu(user);
    expect(status()).toContain('دورك · الآيات ٥–٩');
    // A new turn's clock would be running from the start.
    expect(
      screen.getByRole('button', { name: /استئناف التوقيت/ }),
    ).toBeTruthy();
  });

  it('times a reader by exactly the ayat of the turn', async () => {
    await startWith({
      ...ayat,
      size: 3,
      turnChange: 'reciter',
      reciter: 'husary',
    });
    const t = await loadTimings('husary');
    const ms = ayatDuration(t, '18:5', '18:7')!;
    const timer = await screen.findByRole('button', { name: /^[٠-٩]+:/ });
    // A tick may have passed since it began.
    expect([clock(ms), clock(ms - 1000)]).toContain(
      timer.getAttribute('aria-label')!.split('،')[0],
    );
  });
});

describe('a recording that does not fit its timings', () => {
  // Abdul Basit's al-Baqarah is listed as not fitting (see timings.ts).
  const abdulbasit = { id: 'r1', kind: 'reciter', reciter: 'abdulbasit' };

  it('lets a reciter’s turn be skipped, and offers no retry', async () => {
    const user = await startWith({ members: [abdulbasit, you], start: 8 });
    await act(() => vi.dynamicImportSettled());
    expect(primary().getAttribute('aria-label')).toBe(
      'تخطَّ، لا تتوفّر تلاوة هذه الصفحة بصوت الشيخ عبد الباسط، التالي: أنت، الصفحة ٣',
    );
    expect(said()).toContain('لا تتوفّر تلاوة هذه الصفحة بصوت الشيخ عبد الباسط');
    const bar = document.querySelector<HTMLElement>('.action-bar')!;
    expect(within(bar).queryByRole('button', { name: /أعد المحاولة/ })).toBe(
      null,
    );
    await user.click(primary());
    expect(status()).toContain('دورك');
    expect(place()).toBe('ص ٣');
  });

  it('offers another sheikh for «استمع»', async () => {
    const user = await startWith({
      members: [you],
      start: 8,
      reciter: 'abdulbasit',
    });
    await act(() => vi.dynamicImportSettled());
    await user.click(
      await screen.findByRole('button', {
        name: 'شيخ آخر: لا تتوفّر تلاوة هذه الصفحة بصوت الشيخ عبد الباسط',
      }),
    );
    const sheet = screen.getByRole('dialog', { name: 'شيخ الاستماع' });
    await user.click(
      within(sheet).getByRole('button', { name: /^محمد صديق المنشاوي/ }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      await screen.findByRole('button', { name: 'استمع إلى الصفحة ٢' }),
    ).toBeTruthy();
  });
});

describe('the end of a sitting', () => {
  it('stops at the goal, and carries on past it when asked', async () => {
    const user = await startWith({
      members: [you],
      start: 1,
      goal: { to: 'page', page: 1 },
    });
    // Read alone, and spoken to as one.
    expect(primary().textContent).toContain('وبه تبلغ الغاية');
    await user.click(primary());
    expect(screen.getByRole('heading', { name: /^بلغت/ })).toBeTruthy();
    // Drawn once, on the card; the strip still says it aloud.
    expect(status()).toBe('');
    expect(said()).toBe('بلغتَ الغاية. تقبّل الله منك.');
    // The buttons it replaced had the focus; the card takes it.
    const carryOn = screen.getByRole('button', { name: 'تابعوا' });
    expect(document.activeElement).toBe(carryOn);
    await user.click(carryOn);
    expect(status()).toContain('دورك');
    expect(place()).toBe('ص ٢');
  });

  it('tells a khatm from a goal', async () => {
    const user = await startWith({ members: [you], start: 6236 });
    expect(primary().textContent).toContain('وبه يُختم المصحف');
    await user.click(primary());
    expect(screen.getByRole('heading', { name: 'خُتم المصحف' })).toBeTruthy();
    const again = screen.getByRole('button', { name: 'ختمة جديدة من الفاتحة' });
    expect(document.activeElement).toBe(again);
    expect(screen.getByRole('button', { name: 'إنهاء المجلس' })).toBeTruthy();
  });
});

describe('moving between the screens', () => {
  const heading = () => screen.getByRole('heading', { level: 1 });

  it('takes the focus to the new screen’s heading, and the turn with it', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Not on arrival: nobody has placed the focus yet.
    expect(document.activeElement).toBe(document.body);
    await user.click(screen.getByRole('button', { name: /ابدأ المجلس/ }));
    expect(document.activeElement).toBe(heading());
    expect(heading().textContent).toBe('مجلس نور: الحلقة');
    // Whose turn it is is heard once, with the heading; the turn's own
    // region, already holding it, says it again only when it changes.
    const description = document.getElementById(
      heading().getAttribute('aria-describedby')!,
    );
    expect(description?.textContent).toBe(said());
    expect(said()).toBe('دورك، الصفحة ١');
  });

  it('takes it to the start screen’s heading once the sitting has ended', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'ختام المجلس' })).getByRole(
        'button',
        { name: 'إنهاء' },
      ),
    );
    expect(heading().textContent).toBe('مجلس نور');
    expect(document.activeElement).toBe(heading());
  });

  it('does the same carrying on a sitting left open', async () => {
    const user = await start();
    cleanup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^متابعة/ }));
    expect(document.activeElement).toBe(heading());
  });
});

describe('the menu and the jump', () => {
  const menu = () => screen.getByRole('dialog', { name: 'القائمة' });

  it('holds the sitting, how it looks and sounds, and no place', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    const headings = within(menu())
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'المجلس',
      'المظهر',
      'الصوت',
      'عن مجلس نور',
      'لوحة المفاتيح',
    ]);
    expect(within(menu()).queryByText('الموضع')).toBeNull();
    // The page as wide as the screen, and back.
    await user.click(
      within(menu()).getByRole('radio', { name: 'بعرض الشاشة' }),
    );
    expect(
      document.querySelector('.mushaf-stage')!.getAttribute('data-size'),
    ).toBe('width');
  });

  it('changes the circle in place of the menu, with a way back', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(
      within(menu()).getByRole('button', { name: /^عدّل الحلقة/ }),
    );
    const form = screen.getByRole('dialog', { name: 'عدّل الحلقة' });
    await user.click(within(form).getByRole('button', { name: 'رجوع' }));
    expect(menu()).toBeTruthy();
    // Back where the hand was, not at the top of the menu.
    expect(document.activeElement).toBe(
      within(menu()).getByRole('button', { name: /^عدّل الحلقة/ }),
    );
  });

  it('gives the focus back to the row that chose the listening sheikh', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(
      within(menu()).getByRole('button', { name: /^شيخ الاستماع/ }),
    );
    const list = screen.getByRole('dialog', { name: 'شيخ الاستماع' });
    expect(document.activeElement).toBe(
      within(list).getByRole('heading', { name: 'شيخ الاستماع' }),
    );
    await user.click(
      within(list).getByRole('button', { name: /^محمد صديق المنشاوي/ }),
    );
    expect(document.activeElement).toBe(
      within(menu()).getByRole('button', {
        name: /^شيخ الاستماع محمد صديق المنشاوي/,
      }),
    );
  });

  it('opens the circle’s form straight from the circle', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'الحلقة' }));
    await user.click(screen.getByRole('button', { name: 'عدّل الحلقة' }));
    const form = screen.getByRole('dialog', { name: 'عدّل الحلقة' });
    // Opened for this, it closes rather than going back to a menu.
    expect(within(form).queryByRole('button', { name: 'رجوع' })).toBeNull();
  });

  it('jumps to the ayah a surah begins with', async () => {
    const user = await startWith({
      members: [you, omar],
      unit: 'ayah',
      size: 3,
    });
    await user.click(topLine());
    const sheet = screen.getByRole('dialog', { name: 'الانتقال إلى' });
    await user.type(within(sheet).getByRole('searchbox'), 'الكهف');
    await user.click(within(sheet).getByRole('button', { name: /الكهف/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(status()).toContain('دورك · الآيات ١–٣');
    expect(place()).toBe('ص ٢٩٣');
  });

  it('hides the bars for the page alone, and brings them back', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(
      within(menu()).getByRole('button', { name: /إخفاء الأزرار/ }),
    );
    expect(document.querySelector('.reading[data-quiet]')).toBeTruthy();
    // The menu's button went with the bars; the focus is on the way back.
    expect(document.activeElement).toBe(
      document.querySelector('.quiet-return'),
    );
    // Whose turn it is is still said.
    expect(said()).toContain('دورك');
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(document.querySelector('.reading[data-quiet]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(
      within(menu()).getByRole('button', { name: /إخفاء الأزرار/ }),
    );
    await user.click(screen.getByRole('button', { name: 'إظهار الأزرار' }));
    expect(document.querySelector('.reading[data-quiet]')).toBeNull();
  });
});

describe('an ayah on the page', () => {
  /** The ayah markers drawn, once the page is in. */
  const markers = () =>
    screen.findAllByRole('button', { name: /استمع إليها$/ });
  const ayahBar = () => screen.queryByRole('region', { name: /^الآية/ });

  it('opens the ayah bar from a tapped word, and from a marker', async () => {
    const user = await startWith({ members: [you, omar] });
    await markers();
    // Al-Fatihah 5, its third word.
    await user.click(
      document.querySelector<HTMLElement>('[data-ayah="5"][data-word="3"]')!,
    );
    expect(ayahBar()?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'الآية ٥ · الفاتحة' }));
    expect(
      document.querySelectorAll('.mushaf-words [data-selected]').length,
    ).toBeGreaterThan(0);
    const marker = screen.getByRole('button', {
      name: 'الآية ٢ من سورة الفاتحة — استمع إليها',
    });
    marker.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('region', { name: 'الآية ٢ · الفاتحة' }));
    expect(document.activeElement?.textContent).toContain('استمع');
  });

  it('closes on Escape before the bars come back, giving the marker its focus', async () => {
    const user = await startWith({ members: [you, omar] });
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(screen.getByRole('button', { name: /إخفاء الأزرار/ }));
    const [marker] = await markers();
    marker.focus();
    await user.keyboard('{Enter}');
    expect(ayahBar()).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(ayahBar()).toBeNull();
    expect(document.activeElement).toBe(marker);
    expect(document.querySelector('.reading[data-quiet]')).toBeTruthy();
    await user.keyboard('{Escape}');
    expect(document.querySelector('.reading[data-quiet]')).toBeNull();
  });

  it('lets the ayah chosen go when the turn passes', async () => {
    const user = await startWith({ members: [you, omar] });
    const [marker] = await markers();
    await user.click(marker);
    expect(ayahBar()).toBeTruthy();
    await user.click(primary());
    expect(ayahBar()).toBeNull();
    expect(document.querySelector('.mushaf-words [data-selected]')).toBeNull();
  });

  it('lets the ayah bar go when the sitting is being closed', async () => {
    const user = await startWith({ members: [you, omar] });
    const [marker] = await markers();
    await user.click(marker);
    expect(ayahBar()).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    await user.click(
      await screen.findByRole('button', { name: 'تابعوا القراءة' }),
    );
    expect(ayahBar()).toBeNull();
  });

  it('stops the ayah it played when the sitting is closed by the keyboard', async () => {
    const user = await startWith({ members: [you, omar] });
    const [marker] = await markers();
    marker.focus();
    await user.keyboard('{Enter}');
    await act(() => vi.dynamicImportSettled());
    // The focus is on the bar's «استمع».
    await user.keyboard('{Enter}');
    expect(player.getState().key).toMatch(/^ayah:/);
    // No pointer pressed outside the bar, which would have closed it.
    screen.getByRole('button', { name: 'القائمة' }).focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: 'إنهاء المجلس' }).focus();
    await user.keyboard('{Enter}');
    (await screen.findByRole('button', { name: 'تابعوا القراءة' })).focus();
    await user.keyboard('{Enter}');
    expect(ayahBar()).toBeNull();
    expect(player.getState().key).not.toMatch(/^ayah:/);
    // Space has nothing hidden to play again.
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard(' ');
    expect(player.getState().status).not.toBe('playing');
    expect(player.getState().status).not.toBe('loading');
  });

  it('leaves the sheikh it played over paused when the sitting is closed', async () => {
    const user = await startWith({ members: [minshawi, you] });
    await act(() => vi.dynamicImportSettled());
    expect(player.getState().key).toMatch(/^turn:/);
    const [marker] = await markers();
    marker.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    expect(player.getState()).toMatchObject({
      key: expect.stringMatching(/^ayah:/),
      waiting: { key: expect.stringMatching(/^turn:/) },
    });
    screen.getByRole('button', { name: 'القائمة' }).focus();
    await user.keyboard('{Enter}');
    screen.getByRole('button', { name: 'إنهاء المجلس' }).focus();
    await user.keyboard('{Enter}');
    (await screen.findByRole('button', { name: 'تابعوا القراءة' })).focus();
    await user.keyboard('{Enter}');
    expect(player.getState()).toMatchObject({
      key: expect.stringMatching(/^turn:/),
      status: 'paused',
      waiting: null,
    });
  });

  it('underlines a turn of a few ayat, and never a turn of whole pages', async () => {
    await startWith({
      members: [you, omar],
      unit: 'ayah',
      size: 3,
      start: kahf5,
    });
    await markers();
    const underlined = () =>
      new Set(
        [...document.querySelectorAll<HTMLElement>('[data-turn]')].map(
          (el) => el.dataset.ayah,
        ),
      );
    expect(underlined()).toEqual(
      new Set([kahf5, kahf5 + 1, kahf5 + 2].map(String)),
    );
    cleanup();
    await startWith({ members: [you, omar], start: kahf5 });
    await markers();
    expect(underlined().size).toBe(0);
  });

  it('covers the page on a reader’s turn, in a review from memory', async () => {
    const user = await startWith({
      members: [you, minshawi],
      fromMemory: true,
    });
    expect(screen.getByText('اقرأ من حفظك'));
    await user.click(screen.getByRole('button', { name: /اكشف الصفحة/ }));
    expect(screen.queryByText('اقرأ من حفظك')).toBeNull();
    // The sheikh's turn is followed on the page, not recited from memory.
    await user.click(primary());
    expect(status()).toContain('يتلو المنشاوي');
    expect(screen.queryByText('اقرأ من حفظك')).toBeNull();
  });

  it('follows the word when the reader asks, from the menu', async () => {
    const user = await startWith({ members: [you, omar] });
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    const follow = screen.getByRole<HTMLInputElement>('switch', {
      name: /تتبّع الكلمة/,
    });
    expect(follow.checked).toBe(false);
    await user.click(follow);
    expect(follow.checked).toBe(true);
    const saved = JSON.parse(localStorage.getItem('majlis-noor:v1')!);
    expect(saved.prefs.follow).toBe('word');
  });
});

describe('accessibility', () => {
  const unnamed = () =>
    [...document.querySelectorAll('button, input, select, a')].filter((el) => {
      const labelled =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-labelledby') ||
        (el as HTMLInputElement).labels?.length ||
        el.textContent?.trim();
      return !labelled;
    });

  /** Words alone, as someone speaking to their device says them. */
  const words = (s: string) =>
    s
      .replace(/[،؛:.…·—–()«»/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  /** The text nodes under `el`, but those inside `skip`. */
  const texts = (el: Element, skip: (parent: Element) => boolean) => {
    const out: Text[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode())
      if (!skip(n.parentElement!)) out.push(n as Text);
    return out;
  };
  /** A control's name, as the app gives it: its aria-label, or its words
      (for a radio, its label's) but those hidden from screen readers. */
  const nameOf = (el: Element) => {
    const label = el.getAttribute('aria-label');
    if (label) return label;
    const from = el instanceof HTMLInputElement ? el.labels?.[0] : el;
    return from
      ? texts(from, (p) => !!p.closest('[aria-hidden="true"]'))
          .map((t) => t.data)
          .join(' ')
      : '';
  };
  /** The words a control shows: on a wide screen the longer form of a text
      that has a shorter one for a phone; on a phone, the words before the
      first shortened one, since what follows is only shortened. Words kept
      for screen readers alone are not shown, and nor are a page's glyphs,
      code points that mean nothing as text: an ayah's marker shows its
      number through one, which its name says in words. */
  const shownBy = (el: Element, wide: boolean) => {
    const from = el instanceof HTMLInputElement ? el.labels?.[0] : el;
    if (!from) return '';
    const out: string[] = [];
    for (const t of texts(
      from,
      (p) => !!p.closest('.visually-hidden, .mushaf-words'),
    )) {
      const p = t.parentElement!;
      if (wide ? p.closest('.label-short') : p.closest('.label-long')) continue;
      if (!wide && p.closest('.label-short')) break;
      out.push(t.data);
    }
    return out.join(' ');
  };
  /** Every button and radio whose name does not begin with the words it
      shows (WCAG 2.5.3), at either width. A control hidden from everyone
      (back on the first turn) shows nothing and has no name to begin. */
  const misnamed = () =>
    [...document.querySelectorAll('button, input[type="radio"]')].flatMap(
      (el) => {
        if (el.closest('[inert], [aria-hidden="true"]')) return [];
        const name = words(nameOf(el));
        return [true, false].flatMap((wide) => {
          const shown = words(shownBy(el, wide));
          return shown && !name.startsWith(shown)
            ? [`«${shown}» named «${name}»${wide ? '' : ' (phone)'}`]
            : [];
        });
      },
    );

  it('names every control on the start screen', () => {
    render(<App />);
    expect(unnamed()).toEqual([]);
  });

  it('names every control on the reading screen by the words it shows', async () => {
    const user = await startWith({
      members: [you, omar, minshawi],
      turnChange: 'reciter',
    });
    await screen.findByRole('button', { name: /^[٠-٩]+:/ });
    expect(misnamed()).toEqual([]);
    await user.click(primary());
    await user.click(primary());
    expect(status()).toContain('يتلو المنشاوي');
    expect(misnamed()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'الحلقة' }));
    expect(misnamed()).toEqual([]);
  });

  it('names the start screen’s and the sheets’ controls by their words', async () => {
    render(<App />);
    expect(misnamed()).toEqual([]);
    cleanup();
    const user = await start();
    await user.click(topLine());
    expect(misnamed()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    await user.click(screen.getByRole('button', { name: 'القائمة' }));
    expect(misnamed()).toEqual([]);
  });

  it('names every control on the reading screen', async () => {
    await start();
    expect(unnamed()).toEqual([]);
  });

  it('keeps one main landmark, one h1 and a way past the header', async () => {
    await start();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'تخطَّ إلى الصفحة' })).toBeTruthy();
  });
});
