import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { misnamed, unnamed } from '@/test-names';
import { MemoryCover } from './MemoryCover';

const page = <article aria-label="الصفحة ٥٠">نص الصفحة</article>;
const content = () => document.querySelector('.memory-cover-content')!;
const reveal = () => screen.getByRole('button', { name: 'اكشف الصفحة' });

describe('the cover of a review from memory', () => {
  it('covers the page from sight, from the keyboard and from screen readers', () => {
    render(<MemoryCover cover="turn:1">{page}</MemoryCover>);
    expect(screen.getByText('اقرأ من حفظك'));
    // Inert: neither seen by a screen reader nor reached by the keyboard
    // (jsdom keeps it in its tree; Chrome's accessibility tree does not).
    expect(content().hasAttribute('inert')).toBe(true);
    expect(unnamed()).toEqual([]);
    expect(misnamed()).toEqual([]);
  });

  it('uncovers it on the button, and hands the focus to the page', async () => {
    const user = userEvent.setup();
    render(<MemoryCover cover="turn:1">{page}</MemoryCover>);
    await user.click(reveal());
    expect(screen.queryByText('اقرأ من حفظك')).toBeNull();
    expect(content().hasAttribute('inert')).toBe(false);
    expect(screen.getByRole('article'));
    await act(() => new Promise(requestAnimationFrame));
    expect(document.activeElement).toBe(content());
  });

  it('stays uncovered until told to cover again', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MemoryCover cover="turn:1">{page}</MemoryCover>,
    );
    await user.click(reveal());
    rerender(<MemoryCover cover="turn:1">{page}</MemoryCover>);
    expect(screen.queryByText('اقرأ من حفظك')).toBeNull();
    rerender(<MemoryCover cover="turn:2">{page}</MemoryCover>);
    expect(reveal());
  });

  it('never covers without a value, and names both pages of a spread', () => {
    const { rerender } = render(<MemoryCover cover={null}>{page}</MemoryCover>);
    expect(screen.getByRole('article'));
    rerender(
      <MemoryCover cover="turn:3" pages={2}>
        {page}
      </MemoryCover>,
    );
    // Both words are there; the room decides which is shown (marks.css),
    // and the hidden one is no part of the name.
    const button = screen.getByRole('button', { name: /اكشف/ });
    expect(button.querySelector('.memory-cover-one')?.textContent).toBe(
      'اكشف الصفحة',
    );
    expect(button.querySelector('.memory-cover-two')?.textContent).toBe(
      'اكشف الصفحتين',
    );
  });
});
