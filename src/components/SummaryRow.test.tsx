import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SummaryRow } from './SummaryRow';

describe('a summary row', () => {
  it('is one button named by its title, then its detail, then what it does', async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    render(
      <SummaryRow
        title="سورة آل عمران"
        detail="الصفحة ٥٠ · الجزء ٣"
        spokenSuffix="، غيّر موضع البدء"
        leading={<span>٣</span>}
        opensDialog
        onClick={open}
      />,
    );
    const row = screen.getByRole('button', {
      name: 'سورة آل عمران الصفحة ٥٠ · الجزء ٣ ، غيّر موضع البدء',
    });
    expect(row.getAttribute('aria-haspopup')).toBe('dialog');
    await user.click(row);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('can be a title alone, and says nothing of a popup it does not open', () => {
    render(<SummaryRow title="عدّل الحلقة" onClick={() => {}} />);
    const row = screen.getByRole('button', { name: 'عدّل الحلقة' });
    expect(row.hasAttribute('aria-haspopup')).toBe(false);
  });

  it('keeps what leads it, and its chevron, out of its name', () => {
    render(
      <SummaryRow
        title="التتابع · صفحة · يدوي"
        leading={<span>صورة</span>}
        onClick={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'التتابع · صفحة · يدوي' }),
    ).toBeTruthy();
    expect(
      document.querySelector('.summary-row svg')?.getAttribute('aria-hidden'),
    ).toBe('true');
  });
});
