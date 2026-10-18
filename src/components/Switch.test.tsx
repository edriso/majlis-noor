import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Switch } from './Switch';

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <Switch
      label="من الحفظ"
      hint="تُغطّى الصفحة في دور القارئ، ويكشفها إن احتاج."
      checked={on}
      onChange={setOn}
      disabled={disabled}
    />
  );
}

describe('a switch', () => {
  it('is a checkbox with the switch role, named by its label', () => {
    render(<Harness />);
    const sw = screen.getByRole('switch', { name: 'من الحفظ' });
    expect(sw).toHaveProperty('type', 'checkbox');
    expect(sw).toHaveProperty('checked', false);
  });

  it('is described by its hint, not named by it', () => {
    render(<Harness />);
    const sw = screen.getByRole('switch', { name: 'من الحفظ' });
    expect(
      document.getElementById(sw.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toBe('تُغطّى الصفحة في دور القارئ، ويكشفها إن احتاج.');
  });

  it('turns with a tap on its words, and with Space', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const sw = screen.getByRole('switch');
    await user.click(screen.getByText('من الحفظ'));
    expect(sw).toHaveProperty('checked', true);
    expect(sw.closest('label')!.hasAttribute('data-checked')).toBe(true);
    await user.keyboard(' ');
    expect(sw).toHaveProperty('checked', false);
  });

  it('does not turn while disabled', async () => {
    const user = userEvent.setup();
    render(<Harness disabled />);
    await user.click(screen.getByText('من الحفظ'));
    expect(screen.getByRole('switch')).toHaveProperty('checked', false);
  });
});
