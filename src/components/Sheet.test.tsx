import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';

/* jsdom neither opens nor closes a <dialog> (test-setup.ts stands in for
   showModal and close) and has no Escape of its own, so Escape is the
   `cancel` event a browser turns it into. */

function Harness({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'first' | 'second'>('first');
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        افتح
      </button>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          onOpenChange?.(v);
          setOpen(v);
        }}
        title={panel === 'first' ? 'الأولى' : 'الثانية'}
        description="لوحة للتجربة"
        onBack={panel === 'second' ? () => setPanel('first') : undefined}
      >
        {panel === 'first' ? (
          <button type="button" onClick={() => setPanel('second')}>
            إلى الثانية
          </button>
        ) : (
          <p>الثانية</p>
        )}
      </Sheet>
    </>
  );
}

const opened = async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'افتح' }));
  return user;
};

const dialog = () =>
  screen.getByRole('dialog', { name: 'الأولى' }) as HTMLDialogElement;

describe('a sheet', () => {
  it('is not in the page while closed', () => {
    render(<Harness />);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('opens as a modal dialog, named and described, with focus on its title', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    await opened();
    expect(showModal).toHaveBeenCalledTimes(1);
    showModal.mockRestore();
    const sheet = dialog();
    expect(sheet.open).toBe(true);
    const description = document.getElementById(
      sheet.getAttribute('aria-describedby')!,
    );
    expect(description?.textContent).toBe('لوحة للتجربة');
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'الأولى' }),
    );
  });

  it('closes with «إغلاق» and gives focus back to what opened it', async () => {
    const user = await opened();
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'افتح' }),
    );
    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });

  it('closes on Escape, playing its own exit rather than the browser’s', async () => {
    await opened();
    const cancel = new Event('cancel', { cancelable: true });
    act(() => {
      dialog().dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'افتح' }),
    );
  });

  it('closes on a tap on the dimmed page, and not on one in the panel', async () => {
    const user = await opened();
    await user.click(screen.getByRole('heading', { name: 'الأولى' }));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    // Pressed in the panel and let go outside it, as when selecting text.
    fireEvent.pointerDown(screen.getByRole('heading', { name: 'الأولى' }));
    fireEvent.click(dialog());
    expect(screen.queryByRole('dialog')).not.toBeNull();
    await user.click(dialog());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('follows the browser when it closes the dialog itself', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'افتح' }));
    act(() => {
      dialog().close();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps focus in the sheet when its panel changes in place', async () => {
    const user = await opened();
    await user.click(screen.getByRole('button', { name: 'إلى الثانية' }));
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'الثانية' }),
    );
    await user.click(screen.getByRole('button', { name: 'رجوع' }));
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'الأولى' }),
    );
  });
});
