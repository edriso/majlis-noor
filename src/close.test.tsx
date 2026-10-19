import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

/* The close of a sitting as the reader reaches it: from the menu, from
   the goal's card and from the khatm's, back to the sitting, and out.
   jsdom draws nothing on a canvas, so the picture is stood in for; it is
   tested on its own (src/sitting). */
vi.mock('@/sitting/cardImage', () => ({
  cardImage: vi.fn(() => Promise.resolve(new Blob(['png']))),
}));

/** Starts a halaqa set up as `config`, as the start screen would. */
const startWith = async (config: object = {}) => {
  localStorage.setItem('majlis-noor:v1', JSON.stringify({ config }));
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /ابدأ المجلس/ }));
  return user;
};

const you = { id: 'p1', kind: 'person', name: '' };
const omar = { id: 'p2', kind: 'person', name: 'عمر' };

const primary = () => document.querySelector<HTMLElement>('.action-primary')!;
const card = () => screen.getByRole('dialog', { name: 'ختام المجلس' });
/** What the card says, its no-break spaces read as spaces. */
const cardWords = () => card().textContent.replaceAll('\u00a0', ' ');
const place = () =>
  within(document.querySelector<HTMLElement>('.topbar')!).getByRole('button', {
    name: /انتقل إلى موضع آخر/,
  }).textContent;

/** Opens the menu and presses «إنهاء المجلس» in it. */
const endFromMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'القائمة' }));
  await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
};

describe('closing a sitting from the menu', () => {
  it('closes the menu, then shows what the sitting read', async () => {
    const user = await startWith({ members: [you, omar] });
    await user.click(primary());
    await endFromMenu(user);
    expect(screen.queryByRole('dialog', { name: 'القائمة' })).toBeNull();
    // One dialog, not a sheet over a sheet.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const text = cardWords();
    expect(text).toContain('من سورة الفاتحة، الآية ١ (الصفحة ١)');
    expect(text).toContain('إلى سورة الفاتحة، الآية ٧ (الصفحة ١)');
    expect(text).toContain('صفحة واحدة · ٧ آيات');
    expect(text).toContain('الحاضران: أنت وعمر');
    expect(document.activeElement).toBe(
      within(card()).getByRole('heading', { name: 'ختام المجلس' }),
    );
  });

  it('ends it with «إنهاء», keeping the place for the next', async () => {
    const user = await startWith({ members: [you, omar] });
    await user.click(primary());
    await endFromMenu(user);
    await user.click(within(card()).getByRole('button', { name: 'إنهاء' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /ابدأ المجلس/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'تابع مجلسك' })).toBeNull();
    expect(
      screen.getByRole('button', { name: /غيّر موضع البدء$/ }).textContent,
    ).toContain('الصفحة ٢');
  });

  it('goes back to the sitting as it was with «تابعوا القراءة»', async () => {
    const user = await startWith({ members: [you, omar] });
    await user.click(primary());
    await endFromMenu(user);
    await user.click(
      within(card()).getByRole('button', { name: 'تابعوا القراءة' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(place()).toBe('ص ٢');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'القائمة' }),
    );
    // The keys are the sitting's again.
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    expect(place()).toBe('ص ٣');
  });

  it('leaves the keys to the card while it is open', async () => {
    const user = await startWith({ members: [you, omar] });
    await endFromMenu(user);
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    });
    fireEvent(card(), new Event('cancel'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(place()).toBe('ص ١');
  });

  it('stills «استمع», and leaves it stilled when the sitting goes on', async () => {
    const user = await startWith({ members: [you, omar] });
    await user.click(screen.getByRole('button', { name: /^استمع إلى الصفحة/ }));
    await screen.findByRole('button', { name: /^إيقاف مؤقت للاستماع/ });
    await endFromMenu(user);
    await user.click(
      within(card()).getByRole('button', { name: 'تابعوا القراءة' }),
    );
    expect(
      screen.getByRole('button', { name: /^متابعة الاستماع/ }),
    ).toBeTruthy();
  });

  it('stops a timed turn’s clock, and leaves it stopped', async () => {
    const user = await startWith({
      members: [you, omar],
      turnChange: 'reciter',
    });
    await screen.findByRole('button', { name: /إيقاف التوقيت مؤقتًا/ });
    await endFromMenu(user);
    await user.click(
      within(card()).getByRole('button', { name: 'تابعوا القراءة' }),
    );
    expect(
      screen.getByRole('button', { name: /استئناف التوقيت/ }),
    ).toBeTruthy();
  });
});

describe('closing a sitting at its end', () => {
  it('closes from the goal’s card, and goes back to it', async () => {
    const user = await startWith({
      members: [you],
      goal: { to: 'page', page: 1 },
    });
    await user.click(primary());
    expect(screen.getByRole('heading', { name: /^بلغت/ })).toBeTruthy();
    const end = screen.getByRole('button', { name: 'إنهاء المجلس' });
    await user.click(end);
    expect(cardWords()).toContain('إلى سورة الفاتحة، الآية ٧ (الصفحة ١)');
    // «أنت» alone is not named, and is spoken to as one.
    expect(cardWords()).not.toContain('الحاضر');
    await user.click(
      within(card()).getByRole('button', { name: 'تابع القراءة' }),
    );
    expect(screen.getByRole('heading', { name: /^بلغت/ })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'إنهاء المجلس' }),
    );
  });

  it('closes from the khatm’s card, and ends there', async () => {
    const user = await startWith({ members: [you], start: 6236 });
    await user.click(primary());
    expect(screen.getByRole('heading', { name: 'خُتم المصحف' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    expect(cardWords()).toContain('إلى سورة الناس، الآية ٦ (الصفحة ٦٠٤)');
    await user.click(within(card()).getByRole('button', { name: 'إنهاء' }));
    expect(screen.getByRole('button', { name: /ابدأ المجلس/ })).toBeTruthy();
  });
});
