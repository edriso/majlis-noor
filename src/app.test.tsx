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

/* Every Mushaf page drawn is counted, and every brand in a bar, which the
   reading screen draws whenever it is drawn itself, so a test can tell
   that a turn's clock running draws neither the page nor the screen. */
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
vi.mock('@/components/Logo', async (original) => {
  const real = await original<typeof import('@/components/Logo')>();
  return {
    ...real,
    Brand: (props: Parameters<typeof real.Brand>[0]) => {
      draws.screen++;
      return createElement(real.Brand, props);
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
  await user.click(screen.getByRole('button', { name: /ابدأ الحلقة/ }));
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
  await user.click(screen.getByRole('button', { name: /ابدأ الحلقة/ }));
  return user;
};

/** The line at the top: whose turn, and where; a press opens the jump. */
const topLine = () =>
  within(document.querySelector<HTMLElement>('.topbar')!).getByRole('button', {
    name: /انتقل إلى موضع آخر/,
  });
const status = () => topLine().textContent;

describe('the start screen', () => {
  it('names the app once, as the page heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'مجلس نور',
    );
  });

  it('shows the starting page whichever way it is chosen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByLabelText('السورة'), '2');
    expect(screen.getByText('الصفحة ٢')).toBeTruthy();
    await user.click(screen.getByLabelText('جزء'));
    await user.selectOptions(screen.getByLabelText('الجزء'), '30');
    expect(screen.getByText('الصفحة ٥٨٢')).toBeTruthy();
    await user.click(screen.getByLabelText('صفحة'));
    const field = screen.getByLabelText(/رقم الصفحة/);
    await user.clear(field);
    await user.type(field, '٢٤{Enter}');
    expect(screen.getByText('الصفحة ٢٤')).toBeTruthy();
  });

  it('seats only «أنت» at first, and hides the reading mode for one', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(
      screen.getByRole('textbox', { name: 'اسم القارئ في المقعد ١' }),
    ).toHaveProperty('placeholder', 'أنت');
    expect(screen.queryByRole('group', { name: 'طريقة القراءة' })).toBeNull();
    await addReader(user);
    expect(screen.getByRole('group', { name: 'طريقة القراءة' })).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'إخراج من الحلقة: القارئ الثاني' }),
    );
    expect(screen.queryByRole('group', { name: 'طريقة القراءة' })).toBeNull();
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
    // Closed before «ابدأ الحلقة» was ever pressed.
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

    await user.click(screen.getByRole('button', { name: /ابدأ الحلقة/ }));
    expect(status()).toContain('يتلو المنشاوي');
    expect(screen.getByRole('button', { name: /تلاوة المنشاوي/ })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^تخطَّ إلى أنت/ }));
    expect(status()).toContain('دورك');
    expect(status()).toContain('الصفحة ٢');
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
    expect(photos().length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    await user.click(screen.getByRole('radio', { name: 'مموّهة' }));
    expect([...photos()].every((img) => img.hasAttribute('data-blur'))).toBe(
      true,
    );
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
    await user.click(screen.getByRole('button', { name: /ابدأ الحلقة/ }));
    expect(status()).toContain('دور عمر');
  });
});

describe('a halaqa', () => {
  it('passes the turn round the circle', async () => {
    const user = await start();
    expect(status()).toContain('دورك');
    expect(status()).toContain('الصفحة ١');
    await user.click(screen.getByRole('button', { name: /^تمّ — التالي/ }));
    expect(status()).toContain('دور القارئ الثاني');
    expect(status()).toContain('الصفحة ٢');
    await user.click(screen.getByRole('button', { name: /القارئ السابق/ }));
    expect(status()).toContain('دورك');
  });

  it('moves on with the left arrow, the way an Arabic book turns', async () => {
    await start();
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(status()).toContain('الصفحة ٢');
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(status()).toContain('الصفحة ١');
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
    expect(status()).toContain('الصفحة ١');
    await user.click(within(sheet).getByRole('button', { name: 'إغلاق' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(status()).toContain('الصفحة ٢');
  });

  it('is offered again after a refresh', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^تمّ — التالي/ }));
    cleanup();
    render(<App />);
    const card = screen.getByRole('region', { name: 'تابع حلقتك' });
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
    // In the top line and on the pause button.
    expect(await screen.findAllByText(/١:١[٠-٣]/)).toHaveLength(2);
  });

  it('announces whose turn it is to a screen reader', async () => {
    const user = await start();
    await user.click(screen.getByRole('button', { name: /^تمّ — التالي/ }));
    expect(screen.getByRole('status').textContent).toContain(
      'دور القارئ الثاني، الصفحة ٢',
    );
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

  it('listens for keys once, however often the turn passes', async () => {
    const user = await start();
    const bound = vi.spyOn(window, 'addEventListener');
    for (let i = 0; i < 3; i++) await user.click(primary());
    expect(bound.mock.calls.filter(([type]) => type === 'keydown')).toEqual([]);
    bound.mockRestore();
  });

  it('draws only the clock as a timed turn’s clock runs', async () => {
    await startWith({ members: [you, omar], turnChange: 'reciter' });
    const timer = await screen.findByRole('button', { name: /^[٠-٩]+:/ });
    const before = timer.getAttribute('aria-label');
    const { page, screen: drawn } = draws;
    await act(() => new Promise((r) => setTimeout(r, 1300)));
    expect(timer.getAttribute('aria-label')).not.toBe(before);
    expect(draws.page).toBe(page);
    expect(draws.screen).toBe(drawn);
  });
});

describe('a circle that reads by the ayah', () => {
  const ayat = { members: [you, omar], unit: 'ayah', size: 5, start: kahf5 };

  it('names each turn by its ayat, and passes them round', async () => {
    const user = await startWith(ayat);
    expect(status()).toContain('دورك · الآيات ٥–٩');
    expect(primary().textContent).toContain('عمر · الآيات ١٠–١٤');
    expect(screen.getByRole('status').textContent).toBe(
      'دورك، الآيات ٥–٩ من سورة الكهف',
    );
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

  it('turns the page when a turn’s ayat run onto the next', async () => {
    // Al-Kahf 14 to 18: two ayat at the foot of page 294, three on 295.
    const user = await startWith({ ...ayat, start: ayahIndex(18, 14) });
    expect(status()).toContain('الآيات ١٤–١٨');
    expect(primary().textContent).toContain('الصفحة التالية');
    expect(primary().textContent).toContain('٢ من ٢ · ثم عمر');
    await user.click(primary());
    expect(screen.getByRole('status').textContent).toContain('الآن الصفحة ٢٩٥');
    expect(status()).toContain('دورك');
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
      screen.getByRole('button', { name: 'تخطَّ إلى أنت، الآيات ١٠–١٤' }),
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

describe('the end of a sitting', () => {
  it('stops at the goal, and carries on past it when asked', async () => {
    const user = await startWith({
      members: [you],
      start: 1,
      goal: { to: 'page', page: 1 },
    });
    expect(primary().textContent).toContain('وبه تبلغون الغاية');
    await user.click(primary());
    expect(screen.getByRole('heading', { name: 'بلغتم الغاية' })).toBeTruthy();
    expect(status()).toContain('بلغتم الغاية');
    // The buttons it replaced had the focus; the card takes it.
    const carryOn = screen.getByRole('button', { name: 'تابعوا' });
    expect(document.activeElement).toBe(carryOn);
    await user.click(carryOn);
    expect(status()).toContain('دورك · الصفحة ٢');
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
      for screen readers alone are not shown. */
  const shownBy = (el: Element, wide: boolean) => {
    const from = el instanceof HTMLInputElement ? el.labels?.[0] : el;
    if (!from) return '';
    const out: string[] = [];
    for (const t of texts(from, (p) => !!p.closest('.visually-hidden'))) {
      const p = t.parentElement!;
      if (wide ? p.closest('.label-short') : p.closest('.label-long')) continue;
      if (!wide && p.closest('.label-short')) break;
      out.push(t.data);
    }
    return out.join(' ');
  };
  /** Every button and radio whose name does not begin with the words it
      shows (WCAG 2.5.3), at either width. */
  const misnamed = () =>
    [...document.querySelectorAll('button, input[type="radio"]')].flatMap(
      (el) => {
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
    // The form's turn sizes show a numeral and are named by the count it
    // stands for; the start screen's rework writes them out, and then
    // this exception goes.
    const sizes = /^«[١٢٣]» named «(صفحة واحدة|صفحتان|ثلاث صفحات)»/;
    const others = () => misnamed().filter((m) => !sizes.test(m));
    render(<App />);
    expect(others()).toEqual([]);
    cleanup();
    const user = await start();
    await user.click(topLine());
    expect(misnamed()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    expect(others()).toEqual([]);
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
