import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

const addReader = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /أضف قارئًا/ }));

/** A halaqa of three readers, «أنت» and the two added after. */
const start = async () => {
  const user = userEvent.setup();
  render(<App />);
  await addReader(user);
  await addReader(user);
  await user.click(screen.getByRole('button', { name: /ابدأ الحلقة/ }));
  return user;
};

/** The top bar: whose turn, and which page. */
const status = () =>
  screen.getByRole('button', { name: /الانتقال إلى صفحة/ }).textContent;

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
    await user.click(
      screen.getByRole('button', { name: /تمّ — القارئ التالي/ }),
    );
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
    await user.click(screen.getByRole('button', { name: /الانتقال إلى صفحة/ }));
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
    await user.click(
      screen.getByRole('button', { name: /تمّ — القارئ التالي/ }),
    );
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
    await screen.findByRole('button', { name: 'إيقاف الاستماع مؤقتًا' });
    await user.click(screen.getByRole('button', { name: /^إيقاف التوقيت/ }));
    expect(
      screen.getByRole('button', { name: /^متابعة الاستماع/ }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^استئناف التوقيت/ }));
    expect(
      await screen.findByRole('button', { name: 'إيقاف الاستماع مؤقتًا' }),
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
    await user.click(
      screen.getByRole('button', { name: /تمّ — القارئ التالي/ }),
    );
    expect(screen.getByRole('status').textContent).toContain(
      'دور القارئ الثاني، الصفحة ٢',
    );
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

  it('names every control on the start screen', () => {
    render(<App />);
    expect(unnamed()).toEqual([]);
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
