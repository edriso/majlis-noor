import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Unit } from '@/halaqa/schedule';
import { misnamed, unnamed } from '@/test-names';
import { Completion } from './Completion';

const card = (
  props: Partial<{
    end: 'khatm' | 'goal';
    unit: Unit;
    pagesRead: number;
    ayatRead: number;
    alone: boolean;
    back: { label: string; onClick: () => void } | null;
  }> = {},
) =>
  render(
    <Completion
      end="goal"
      unit="page"
      pagesRead={0}
      ayatRead={0}
      onRestart={() => {}}
      onCarryOn={() => {}}
      onEnd={() => {}}
      {...props}
    />,
  );

const text = () => document.querySelector('.khatm-text')?.textContent;

describe('the card at the end of a sitting', () => {
  it('counts what was read in pages where whole pages were', () => {
    card({ pagesRead: 3, ayatRead: 40 });
    expect(text()).toBe('تقبّل الله منكم. قرأتم ٣ صفحات في هذا المجلس.');
  });

  it('counts in ayat where less than a page was, never «no page read»', () => {
    card({ pagesRead: 0, ayatRead: 11 });
    expect(text()).toBe('تقبّل الله منكم. قرأتم ١١ آية في هذا المجلس.');
  });

  it('speaks to one reading alone as one', () => {
    card({ alone: true, pagesRead: 2 });
    expect(screen.getByRole('heading', { name: 'بلغتَ الغاية' })).toBeTruthy();
    expect(text()).toBe('تقبّل الله منك. قرأتَ صفحتين في هذا المجلس.');
    expect(screen.getByRole('button', { name: 'تابع' })).toBeTruthy();
  });

  it('says nothing of what was read when nothing was', () => {
    card({ unit: 'ayah' });
    expect(text()).toBe('تقبّل الله منكم.');
  });

  it('offers the way back to the last turn, when there is one', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { unmount } = card({
      end: 'khatm',
      back: { label: 'القارئ السابق', onClick },
    });
    expect(unnamed()).toEqual([]);
    expect(misnamed()).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'القارئ السابق' }));
    expect(onClick).toHaveBeenCalledOnce();
    unmount();
    card({ end: 'khatm' });
    expect(screen.queryByRole('button', { name: 'القارئ السابق' })).toBeNull();
  });
});
