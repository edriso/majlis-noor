import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ayahIndex, surahRange } from '@/data/mushaf';
import { HalaqaForm } from '@/components/HalaqaForm';
import { defaultConfig, type Config } from '@/halaqa/state';
import { misnamed, unnamed } from '@/test-names';
import { App } from '../App';

const KEY = 'majlis-noor:v1';
const you = { id: 'p1', kind: 'person', name: '' };
const omar = { id: 'p2', kind: 'person', name: 'عمر' };
const minshawi = { id: 'r1', kind: 'reciter', reciter: 'minshawi' };
const teacher = { id: 'r2', kind: 'reciter', reciter: 'husary-muallim' };
/** Eight seats, people and sheikhs. */
const eight = [
  you,
  omar,
  minshawi,
  { id: 'p3', kind: 'person', name: 'فاطمة' },
  { id: 'p4', kind: 'person', name: '' },
  { id: 'r3', kind: 'reciter', reciter: 'abdulbasit' },
  { id: 'p5', kind: 'person', name: 'خديجة' },
  { id: 'p6', kind: 'person', name: 'محمد' },
];

/** The start screen, with `state` saved before it opens. */
const open = (state?: object) => {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  const user = userEvent.setup();
  render(<App />);
  return user;
};

const saved = () => JSON.parse(localStorage.getItem(KEY) ?? '{}');
const placeRow = () =>
  screen.getByRole('button', { name: /، غيّر موضع البدء$/ });
const circleRow = () =>
  screen.getByRole('button', { name: /، غيّر طريقة الحلقة$/ });
const sheet = () => screen.getByRole('dialog');
const close = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(within(sheet()).getByRole('button', { name: 'إغلاق' }));
const seats = () => screen.getAllByRole('listitem');
/** What a summary row shows: its title, and its detail after a bar. */
const shows = (row: HTMLElement) =>
  [...row.querySelectorAll('.summary-row-title, .summary-row-detail')]
    .map((part) => part.textContent)
    .join(' | ');

describe('a first visit', () => {
  it('asks three questions, each answered already', () => {
    open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'مجلس نور',
    );
    expect(shows(placeRow())).toBe('سورة الفاتحة | الصفحة ١ · الجزء ١');
    expect(seats()).toHaveLength(1);
    expect(shows(circleRow())).toBe('صفحة · يدوي');
    expect(
      screen.getByRole('button', { name: /^ابدأ المجلس/ }).getAttribute('type'),
    ).toBe('submit');
    // Not a photo anywhere before the photos setting can be reached.
    expect(document.querySelector('img')).toBeNull();
  });

  it('gives a lone «أنت» nothing to move, and asks for their own name', async () => {
    const user = open();
    const field = screen.getByRole('textbox', {
      name: 'اسم القارئ في المقعد ١',
    });
    expect(field.getAttribute('placeholder')).toBe('اسمك (اختياري)');
    expect(within(seats()[0]).queryAllByRole('button')).toEqual([]);
    await user.click(screen.getByRole('button', { name: /^أضف قارئًا/ }));
    // Two to order: each row can move, and each field asks for a reader's.
    expect(within(seats()[0]).getAllByRole('button')).toHaveLength(3);
    const second = screen.getByRole('textbox', {
      name: 'اسم القارئ في المقعد ٢',
    });
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('placeholder')).toBe('اسم القارئ (اختياري)');
    await user.click(
      screen.getByRole('button', { name: 'إخراج من الحلقة: القارئ الثاني' }),
    );
    // The buttons went with the second reader; the focus is on the name
    // left, not lost.
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'اسم القارئ في المقعد ١' }),
    );
    expect(screen.getByRole('status').textContent).toBe(
      'أُخرج من الحلقة: القارئ الثاني.',
    );
  });
});

describe('where to start', () => {
  it('is chosen in a sheet, and kept for the next visit', async () => {
    const user = open();
    await user.click(placeRow());
    expect(sheet().getAttribute('aria-labelledby')).toBeTruthy();
    await user.type(
      within(sheet()).getByRole('searchbox', { name: 'اسم السورة أو رقمها' }),
      'الكهف',
    );
    await user.click(
      within(sheet()).getByRole('button', { name: /^١٨\. الكهف/ }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(placeRow());
    expect(placeRow().textContent).toContain('سورة الكهف');
    expect(saved().config.start).toBe(surahRange(18).from);
  });

  it('takes a page typed and Enter without starting the halaqa', async () => {
    const user = open();
    await user.click(placeRow());
    await user.click(within(sheet()).getByLabelText('صفحة'));
    const field = within(sheet()).getByLabelText('رقم الصفحة');
    await user.clear(field);
    await user.type(field, '٣٠٠{Enter}');
    expect(placeRow().textContent).toContain('الصفحة ٣٠٠');
    // Still the start screen: the sheet's form did not submit this one.
    expect(screen.getByRole('button', { name: /^ابدأ المجلس/ })).toBeTruthy();
  });
});

describe('the way the circle reads', () => {
  it('shows only the parts that apply', async () => {
    const user = open();
    await user.click(circleRow());
    const groups = () =>
      within(sheet())
        .getAllByRole('group')
        .map((g) => g.querySelector('legend')!.textContent);
    // One reader: no mode, no one to swap with.
    expect(groups()).toEqual([
      'مقدار كل دور',
      'عدد الصفحات في كل دور',
      'الانتقال إلى التالي',
      'إلى أين؟',
    ]);
    expect(
      within(sheet()).getByRole('switch', { name: 'من الحفظ' }),
    ).toBeTruthy();
    await close(user);

    await user.click(screen.getByRole('button', { name: /^أضف قارئًا/ }));
    await user.click(circleRow());
    await user.click(within(sheet()).getByRole('radio', { name: 'آيات' }));
    expect(groups()).toEqual([
      'طريقة القراءة',
      'مقدار كل دور',
      'عدد الآيات في كل دور',
      'الانتقال إلى التالي',
      'إلى أين؟',
      'بدّل البادئ',
    ]);
    const swap = () =>
      within(within(sheet()).getByRole('group', { name: 'بدّل البادئ' }))
        .getAllByRole('radio')
        .map((r) => r.getAttribute('value'));
    expect(swap()).toEqual(['none', 'page', 'surah']);
    await user.click(
      within(sheet()).getByRole('radio', { name: 'مع كل صفحة' }),
    );
    // Turns of pages cannot swap at each page, and the model lets it go.
    await user.click(within(sheet()).getByRole('radio', { name: 'صفحة' }));
    expect(swap()).toEqual(['none', 'surah']);
    expect(
      (within(sheet()).getByRole('radio', { name: 'لا' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    // Repeat mode keeps no swapping at all.
    await user.click(within(sheet()).getByRole('radio', { name: 'التكرار' }));
    expect(
      within(sheet()).queryByRole('group', { name: 'بدّل البادئ' }),
    ).toBeNull();
    await close(user);
    expect(shows(circleRow())).toBe('التكرار · صفحة · يدوي');
  });

  it('names each size of a turn by the numeral it shows, then its words', async () => {
    const user = open({ config: { unit: 'ayah', size: 3 } });
    await user.click(circleRow());
    const sizes = within(
      within(sheet()).getByRole('group', { name: 'عدد الآيات في كل دور' }),
    ).getAllByRole('radio');
    expect(sizes.map((r) => r.closest('label')!.textContent)).toEqual([
      '١آية واحدة',
      '٢آيتان',
      '٣آيات',
      '٥آيات',
      '١٠آيات',
    ]);
    expect(
      within(sheet()).getByRole('radio', { name: '٣ آيات' }),
    ).toHaveProperty('checked', true);
    await user.click(within(sheet()).getByRole('radio', { name: '١٠ آيات' }));
    await close(user);
    expect(shows(circleRow())).toBe('١٠ آيات · يدوي');
  });

  it('chooses the timing sheikh inside the timed option, and comes back to it', async () => {
    const user = open();
    await user.click(circleRow());
    expect(
      within(sheet()).queryByRole('button', { name: /، غيّر الشيخ$/ }),
    ).toBeNull();
    await user.click(
      within(sheet()).getByRole('radio', { name: 'بتوقيت الشيخ' }),
    );
    await user.click(
      within(sheet()).getByRole('button', {
        name: /^محمود خليل الحصري يوقّت الدور.*، غيّر الشيخ$/,
      }),
    );
    // The list takes the sheet's place, with a way back.
    expect(sheet().textContent).toContain('الشيخ الذي يوقّت الدور');
    expect(within(sheet()).getByRole('button', { name: 'رجوع' })).toBeTruthy();
    await user.click(
      within(sheet()).getByRole('button', { name: /^محمد صديق المنشاوي/ }),
    );
    const row = within(sheet()).getByRole('button', {
      name: /^محمد صديق المنشاوي يوقّت الدور/,
    });
    expect(document.activeElement).toBe(row);
    await user.click(
      within(sheet()).getByRole('radio', { name: '×١٫٥ أطول بالنصف' }),
    );
    await close(user);
    expect(shows(circleRow())).toBe('صفحة · بتوقيت الشيخ');
    expect(saved().config).toMatchObject({
      turnChange: 'reciter',
      reciter: 'minshawi',
      allowance: 1.5,
    });
  });

  it('makes a teaching circle in one press', async () => {
    const user = open({ config: { members: [you, omar] } });
    await user.click(circleRow());
    const talqeen = within(sheet()).getByRole('button', { name: 'حلقة تلقين' });
    expect(
      document.getElementById(talqeen.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toBe('يتلو الحصري (المعلّم) ثلاث آيات، ثم يقرؤها الحاضرون.');
    await user.click(talqeen);
    expect(
      (
        within(sheet()).getByRole('radio', {
          name: 'التكرار',
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      within(sheet()).getByRole('radio', { name: '٣ آيات' }),
    ).toHaveProperty('checked', true);
    await close(user);
    expect(seats()[0].textContent).toContain('الشيخ الحصري المعلّم');
    expect(seats()).toHaveLength(3);
    expect(shows(circleRow())).toBe('التكرار · ٣ آيات · يدوي');
  });

  it('finds no seat for the teaching sheikh in a full circle', async () => {
    const user = open({ config: { members: eight } });
    await user.click(circleRow());
    const talqeen = within(sheet()).getByRole('button', { name: 'حلقة تلقين' });
    expect(talqeen.getAttribute('aria-disabled')).toBe('true');
    await user.click(talqeen);
    expect(
      document.getElementById(talqeen.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toMatch(/^اكتملت الحلقة/);
    await close(user);
    // Nobody was moved or taken out to make room.
    expect(seats()[0].textContent).not.toContain('الحصري');
    expect(seats()).toHaveLength(8);
  });

  it('moves the teaching sheikh first if he already sits', async () => {
    const user = open({ config: { members: [you, omar, teacher] } });
    await user.click(circleRow());
    await user.click(
      within(sheet()).getByRole('button', { name: 'حلقة تلقين' }),
    );
    await close(user);
    expect(seats()[0].textContent).toContain('الشيخ الحصري المعلّم');
    expect(seats()).toHaveLength(3);
  });

  it('sets a goal, reading a page typed in either digits', async () => {
    const user = open({ config: { start: surahRange(3).from } });
    await user.click(circleRow());
    await user.click(
      within(sheet()).getByRole('radio', { name: 'إلى آخر السورة' }),
    );
    expect(sheet().textContent).toContain(
      'حتى آخر سورة آل عمران، في الصفحة ٧٦.',
    );
    await user.click(within(sheet()).getByRole('radio', { name: 'إلى صفحة…' }));
    const field = within(sheet()).getByRole('textbox', {
      name: 'آخر صفحة يقرؤها المجلس',
    });
    expect(field.getAttribute('inputmode')).toBe('numeric');
    expect(field.getAttribute('type')).toBe('text');
    await user.clear(field);
    await user.type(field, '٧٠٠');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(sheet().textContent).toContain('اكتب رقمًا من ١ إلى ٦٠٤.');
    await user.clear(field);
    await user.type(field, '60');
    expect(sheet().textContent).toContain(
      'حتى آخر الصفحة ٦٠، في سورة آل عمران.',
    );
    await user.click(within(sheet()).getByRole('switch', { name: 'من الحفظ' }));
    await close(user);
    expect(shows(circleRow())).toBe('صفحة · يدوي | إلى الصفحة ٦٠ · من الحفظ');
    expect(saved().config).toMatchObject({
      goal: { to: 'page', page: 60 },
      fromMemory: true,
    });
  });
});

describe('a full circle', () => {
  it('says why it takes no one else', () => {
    open({ config: { members: eight } });
    for (const name of [/^أضف قارئًا/, /^أضف شيخًا/]) {
      const add = screen.getByRole('button', { name });
      expect(add.getAttribute('aria-disabled')).toBe('true');
      expect(
        document.getElementById(add.getAttribute('aria-describedby')!)
          ?.textContent,
      ).toBe('اكتملت الحلقة: ٨ مقاعد.');
    }
  });
});

describe('a sitting left open', () => {
  const kahf5 = ayahIndex(18, 5);
  const session = {
    config: { members: [you, omar], unit: 'ayah', size: 5, start: kahf5 },
    anchor: { turn: 0, at: kahf5 },
    turn: 1,
  };

  it('is offered first, and starting over is a press away and back', async () => {
    const user = open({ config: session.config, session });
    const card = screen.getByRole('region', { name: 'تابع مجلسك' });
    expect(within(card).getByText('الآيات ١٠–١٤ · سورة الكهف')).toBeTruthy();
    expect(within(card).getByText('دور عمر')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^ابدأ المجلس/ })).toBeNull();
    await user.click(
      within(card).getByRole('button', { name: 'ابدأ مجلسًا جديدًا' }),
    );
    expect(document.activeElement).toBe(placeRow());
    await user.click(
      screen.getByRole('button', { name: 'العودة إلى المجلس المفتوح' }),
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /^متابعة/ }),
    );
  });
});

describe('every control on the start screen and in its sheets', () => {
  it('has a name that begins with the words it shows', async () => {
    const user = open({
      config: {
        members: eight,
        unit: 'ayah',
        size: 5,
        turnChange: 'reciter',
        rotate: 'page',
        goal: { to: 'page', page: 60 },
      },
    });
    expect(unnamed()).toEqual([]);
    expect(misnamed()).toEqual([]);
    for (const row of [placeRow, circleRow]) {
      await user.click(row());
      expect(unnamed()).toEqual([]);
      expect(misnamed()).toEqual([]);
      await close(user);
    }
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    expect(unnamed()).toEqual([]);
    expect(misnamed()).toEqual([]);
    await close(user);
    await user.click(screen.getByRole('button', { name: /^الشيخ المنشاوي/ }));
    expect(unnamed()).toEqual([]);
    expect(misnamed()).toEqual([]);
  });
});

describe('the form in the settings of a sitting', () => {
  it('holds the circle and its way of reading, inline, through one onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(c: Config) => void>();
    const config: Config = {
      ...defaultConfig,
      members: [
        { id: 'p1', kind: 'person', name: '' },
        { id: 'p2', kind: 'person', name: 'عمر' },
      ],
    };
    render(
      <HalaqaForm
        config={config}
        onChange={onChange}
        onPickReciter={() => {}}
      />,
    );
    expect(screen.getByRole('group', { name: /^أهل الحلقة/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'طريقة القراءة' })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'التكرار' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...config, mode: 'repeat' });
    expect(misnamed()).toEqual([]);
  });
});
