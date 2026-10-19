import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { App } from '@/App';
import { Choice, type Option } from './Choice';

function Harness({ options }: { options: Option<string>[] }) {
  const [value, setValue] = useState(options[0].value);
  return (
    <Choice
      legend="الاختيار"
      options={options}
      value={value}
      onChange={setValue}
      variant="cards"
    />
  );
}

/** The words a radio's option shows: its label as drawn, without the
    radio, what is hidden from sight, or the hint under it. */
const visibleText = (radio: HTMLElement) => {
  const option = radio.closest('label')!.cloneNode(true) as HTMLElement;
  option
    .querySelectorAll(
      'input, .visually-hidden, [aria-hidden="true"], .choice-hint',
    )
    .forEach((el) => el.remove());
  return option.textContent!.replace(/\s+/g, ' ').trim();
};

/** Every radio in the page with the name a screen reader computes for it. */
const radioNames = () => {
  const names = new Map<HTMLElement, string>();
  screen.queryAllByRole('radio', {
    name: (name, el) => {
      names.set(el as HTMLElement, name);
      return true;
    },
  });
  return [...names];
};

/** Radios whose name does not begin with the words they show (WCAG 2.5.3):
    a voice-control user says what they see, and it must work. */
const mislabelled = () =>
  radioNames()
    .filter(([radio, name]) => !name.startsWith(visibleText(radio)))
    .map(([radio, name]) => `«${visibleText(radio)}» is named «${name}»`);

describe('a choice', () => {
  const options: Option<string>[] = [
    { value: 'a', label: 'كلٌّ يُكمل', hint: 'يقرأ كل واحد ما بعد صاحبه.' },
    { value: 'b', label: '٣', spokenSuffix: 'آيات' },
    { value: 'c', label: 'كلٌّ يكرّر' },
  ];

  it('is a group of native radios named by its legend', () => {
    render(<Harness options={options} />);
    const group = screen.getByRole('group', { name: 'الاختيار' });
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
    expect(
      (screen.getByRole('radio', { name: 'كلٌّ يُكمل' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('names an option by what it shows, and hears its hint as a description', () => {
    render(<Harness options={options} />);
    const radio = screen.getByRole('radio', { name: 'كلٌّ يُكمل' });
    const hint = document.getElementById(
      radio.getAttribute('aria-describedby')!,
    );
    expect(hint?.textContent).toBe('يقرأ كل واحد ما بعد صاحبه.');
  });

  it('adds spoken words after a terse label, never in its place', () => {
    render(<Harness options={options} />);
    expect(screen.getByRole('radio', { name: '٣ آيات' })).toBeTruthy();
    expect(mislabelled()).toEqual([]);
  });

  it('moves with the arrow keys and marks the chosen option', async () => {
    const user = userEvent.setup();
    render(<Harness options={options} />);
    await user.click(screen.getByRole('radio', { name: 'كلٌّ يُكمل' }));
    await user.keyboard('{ArrowDown}');
    const chosen = screen.getByRole('radio', { name: '٣ آيات' });
    expect((chosen as HTMLInputElement).checked).toBe(true);
    expect(chosen.closest('label')!.hasAttribute('data-checked')).toBe(true);
    expect(
      screen
        .getByRole('radio', { name: 'كلٌّ يُكمل' })
        .closest('label')!
        .hasAttribute('data-checked'),
    ).toBe(false);
  });

  it('is caught by the check when a name does not start with the label', () => {
    render(
      <fieldset>
        <label className="choice-option">
          <input type="radio" name="x" aria-label="صفحة واحدة" />
          <span className="choice-label">١</span>
        </label>
      </fieldset>,
    );
    expect(mislabelled()).toEqual(['«١» is named «صفحة واحدة»']);
  });
});

describe('every choice in the app', () => {
  it('is named by the words it shows', async () => {
    localStorage.setItem(
      'majlis-noor:v1',
      JSON.stringify({ config: { turnChange: 'reciter' } }),
    );
    const user = userEvent.setup();
    render(<App />);
    // A second reader brings the reading mode, and the timed turn its
    // allowance, in the circle's sheet; the settings hold the appearance
    // and the sound.
    await user.click(screen.getByRole('button', { name: /أضف قارئًا/ }));
    await user.click(screen.getByRole('button', { name: /غيّر طريقة الحلقة$/ }));
    expect(radioNames().length).toBeGreaterThan(8);
    expect(mislabelled()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'إغلاق' }));
    await user.click(screen.getByRole('button', { name: 'الإعدادات' }));
    expect(mislabelled()).toEqual([]);
  });
});
