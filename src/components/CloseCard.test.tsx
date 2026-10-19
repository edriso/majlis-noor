import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ayahIndex } from '@/data/mushaf';
import {
  defaultConfig,
  initialState,
  reduce,
  summaryOf,
  type CardDesign,
  type Member,
} from '@/halaqa/state';
import { cardImage } from '@/sitting/cardImage';
import { saveImage } from '@/sitting/saveImage';
import { CloseCard, type Closing } from './CloseCard';

/* jsdom draws nothing on a canvas and has no share sheet, so the picture
   and its saving are stood in for; both are tested on their own. */
vi.mock('@/sitting/cardImage', () => ({
  cardImage: vi.fn(() => Promise.resolve(new Blob(['png']))),
}));
vi.mock('@/sitting/saveImage', async (actual) => ({
  ...(await actual<typeof import('@/sitting/saveImage')>()),
  saveImage: vi.fn(() => Promise.resolve('downloaded')),
}));

const at = (h: number, m: number) => new Date(2026, 9, 18, h, m).getTime();

/** The brief's sitting: «أنت», فاطمة and al-Husary, four pages of Al
    Imran in twenty-five minutes. */
function sitting(): Closing {
  const members: Member[] = [
    { id: 'p1', kind: 'person', name: '' },
    { id: 'p2', kind: 'person', name: 'فاطمة' },
    { id: 'r1', kind: 'reciter', reciter: 'husary' },
  ];
  let s = reduce(initialState, {
    type: 'start',
    config: { ...defaultConfig, members, start: ayahIndex(3, 1) },
    at: at(19, 0),
  });
  for (let i = 0; i < 4; i++) s = reduce(s, { type: 'finishTurn' });
  return { summary: summaryOf(s.session!, at(19, 25)), endedAt: at(19, 25) };
}

function Harness({
  onEnd = () => {},
  onDesign = () => {},
  start = 'ornate',
}: {
  onEnd?: () => void;
  onDesign?: (d: CardDesign) => void;
  start?: CardDesign;
}) {
  const [closing, setClosing] = useState<Closing | null>(null);
  const [design, setDesign] = useState<CardDesign>(start);
  return (
    <>
      <button type="button" onClick={() => setClosing(sitting())}>
        إنهاء المجلس
      </button>
      <CloseCard
        closing={closing}
        design={design}
        onDesign={(d) => {
          setDesign(d);
          onDesign(d);
        }}
        onContinue={() => setClosing(null)}
        onEnd={onEnd}
      />
    </>
  );
}

const opened = async (onEnd?: () => void) => {
  const user = userEvent.setup();
  render(<Harness onEnd={onEnd} />);
  await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
  return user;
};

const saveButton = () =>
  screen.getByRole('button', { name: /صورة|التحضير/ }) as HTMLButtonElement;

beforeEach(() => {
  vi.mocked(cardImage).mockClear();
  vi.mocked(saveImage).mockReset();
  vi.mocked(saveImage).mockResolvedValue('downloaded');
});

describe('the close of a sitting', () => {
  it('is not in the page until a sitting is closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens named «ختام المجلس», with focus on its title', async () => {
    await opened();
    expect(screen.getByRole('dialog', { name: 'ختام المجلس' })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'ختام المجلس' }),
    );
  });

  it('says it all as text a screen reader reads', async () => {
    await opened();
    const dialog = screen.getByRole('dialog');
    for (const line of [
      'الأحد، ٧ جمادى الأولى ١٤٤٨ هـ',
      '١٨ أكتوبر ٢٠٢٦',
      'من الساعة ٧:٠٠ إلى ٧:٢٥ م',
      'من سورة آل عمران، الآية ١ (الصفحة ٥٠)',
      'إلى سورة آل عمران، الآية ٢٩ (الصفحة ٥٣)',
      '٤ صفحات · ٢٩ آية · ٢٥ دقيقة',
      'الحاضرون: أنت وفاطمة والشيخ الحصري',
      'سبحانك اللهم وبحمدك،',
      'أستغفرك وأتوب إليك',
      'مجلس نور',
    ])
      // No-break spaces keep a line's units whole; they read as spaces.
      expect(dialog.textContent.replaceAll('\u00a0', ' ')).toContain(line);
  });

  it('goes back to the sitting with «تابعوا القراءة», Escape or «إغلاق»', async () => {
    const user = await opened();
    await user.click(screen.getByRole('button', { name: 'تابعوا القراءة' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    // jsdom has no Escape of its own; a browser turns it into `cancel`.
    fireEvent(screen.getByRole('dialog'), new Event('cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'إنهاء المجلس' }),
    );
  });

  it('ends the sitting with «إنهاء», which says nothing is kept', async () => {
    const onEnd = vi.fn();
    const user = await opened(onEnd);
    const end = screen.getByRole('button', { name: 'إنهاء' });
    expect(
      document.getElementById(end.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toBe('لا يحتفظ التطبيق بهذا الملخّص بعد الإنهاء.');
    await user.click(end);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('saves the picture, saying each step, under the day’s name', async () => {
    let finish: (v: 'downloaded') => void = () => {};
    vi.mocked(saveImage).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = await opened();
    await user.click(saveButton());
    expect(saveButton().textContent).toBe('جارٍ التحضير…');
    expect(saveButton().getAttribute('aria-busy')).toBe('true');
    // A second press while it is busy does nothing.
    await user.click(saveButton());
    expect(saveImage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(saveImage).mock.calls[0][1]).toBe(
      'majlis-noor-2026-10-18.png',
    );
    await act(async () => finish('downloaded'));
    expect(saveButton().textContent).toBe('حُفظت الصورة');
    expect(document.querySelector('output')?.textContent).toBe('حُفظت الصورة');
  });

  it('draws the picture once, ahead of the press', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    await act(async () => vi.advanceTimersByTime(500));
    expect(cardImage).toHaveBeenCalledTimes(1);
    await user.click(saveButton());
    expect(cardImage).toHaveBeenCalledTimes(1);
    expect(saveImage).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('goes quietly back when the share sheet is closed', async () => {
    vi.mocked(saveImage).mockResolvedValue('cancelled');
    const user = await opened();
    await user.click(saveButton());
    expect(saveButton().textContent).toBe('احفظ صورة');
    expect(document.querySelector('output')?.textContent).toBe('');
  });

  it('says so when the picture cannot be saved, and tries again', async () => {
    vi.mocked(saveImage).mockRejectedValueOnce(new Error('disk'));
    const user = await opened();
    await user.click(saveButton());
    expect(saveButton().textContent).toBe('تعذّر حفظ الصورة، أعد المحاولة');
    expect(document.querySelector('output')?.textContent).toBe(
      'تعذّر حفظ الصورة',
    );
    await user.click(saveButton());
    expect(saveButton().textContent).toBe('حُفظت الصورة');
  });

  it('names every button by the words it shows', async () => {
    await opened();
    for (const button of screen.getAllByRole('button')) {
      const shown = button.textContent?.trim() ?? '';
      const name = button.getAttribute('aria-label') ?? shown;
      expect(name.length).toBeGreaterThan(0);
      if (shown) expect(name.startsWith(shown)).toBe(true);
    }
  });
});

describe('choosing the picture', () => {
  const choice = (name: string) =>
    screen.getByRole('radio', { name: new RegExp(`^${name}`) });

  it('offers three designs as one group over «احفظ صورة»', async () => {
    await opened();
    const group = screen.getByRole('group', { name: 'تصميم الصورة' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual([
      'ornate',
      'status',
      'simple',
    ]);
    // Each is named by the word it shows, then what it is for.
    expect(choice('مزخرفة').matches(':checked')).toBe(true);
    expect(choice('حالة')).toBeTruthy();
    expect(choice('بسيطة')).toBeTruthy();
    expect(
      group.compareDocumentPosition(saveButton()) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('starts on the design this device chose last', async () => {
    const user = userEvent.setup();
    render(<Harness start="simple" />);
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    expect(choice('بسيطة').matches(':checked')).toBe(true);
    expect(
      document.querySelector('.close-face')?.getAttribute('data-design'),
    ).toBe('simple');
  });

  it('hands the choice up to be kept, and saves the picture in it', async () => {
    const onDesign = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDesign={onDesign} />);
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    await user.click(choice('حالة'));
    expect(onDesign).toHaveBeenLastCalledWith('status');
    expect(choice('حالة').matches(':checked')).toBe(true);
    expect(
      document.querySelector('.close-face')?.getAttribute('data-design'),
    ).toBe('status');
    await user.click(saveButton());
    expect(vi.mocked(cardImage).mock.lastCall?.[1]).toBe('status');
    expect(vi.mocked(saveImage).mock.calls[0][1]).toBe(
      'majlis-noor-2026-10-18.png',
    );
  });

  it('moves between the designs with the arrow keys', async () => {
    const onDesign = vi.fn();
    const user = userEvent.setup();
    render(<Harness onDesign={onDesign} />);
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    choice('مزخرفة').focus();
    await user.keyboard('{ArrowDown}');
    expect(onDesign).toHaveBeenLastCalledWith('status');
    expect(document.activeElement).toBe(choice('حالة'));
    await user.keyboard('{ArrowDown}');
    expect(onDesign).toHaveBeenLastCalledWith('simple');
    await user.keyboard('{ArrowUp}');
    expect(onDesign).toHaveBeenLastCalledWith('status');
  });

  it('draws the chosen design ahead of the press, again when it changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    await act(async () => vi.advanceTimersByTime(500));
    expect(vi.mocked(cardImage).mock.calls.map((c) => c[1])).toEqual([
      'ornate',
    ]);
    await user.click(choice('بسيطة'));
    await act(async () => vi.advanceTimersByTime(500));
    expect(vi.mocked(cardImage).mock.calls.map((c) => c[1])).toEqual([
      'ornate',
      'simple',
    ]);
    // Pressed now, the picture already drawn is the one handed over.
    await user.click(saveButton());
    expect(cardImage).toHaveBeenCalledTimes(2);
    expect(saveImage).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
