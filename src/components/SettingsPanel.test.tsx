import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultConfig,
  defaultPrefs,
  initialState,
  reduce,
  type Action,
} from '@/halaqa/state';
import { SettingsPanel } from './SettingsPanel';

/* The about text links to the source and to NOTICE at the address the
   build was given (VITE_REPO_URL, from the Pages workflow), and to nothing
   when it was given none: a wrong address is worse than no link. */

const open = (dispatch: (action: Action) => void = () => {}) => {
  const session = reduce(initialState, {
    type: 'start',
    config: defaultConfig,
    at: 0,
  }).session!;
  render(
    <SettingsPanel
      open
      onOpenChange={() => {}}
      session={session}
      prefs={defaultPrefs}
      dispatch={dispatch}
      onQuiet={() => {}}
    />,
  );
};

describe('ending the sitting', () => {
  it('asks once, and keeps the sitting if the answer is no', async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    open(dispatch);
    await user.click(screen.getByRole('button', { name: 'إنهاء المجلس' }));
    expect(dispatch).not.toHaveBeenCalled();
    // A second Enter keeps the sitting.
    const cancel = screen.getByRole('button', { name: 'تراجع' });
    expect(document.activeElement).toBe(cancel);
    expect(cancel.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(cancel.getAttribute('aria-describedby')!)
        ?.textContent,
    ).toMatch(/^أتنهون المجلس؟/);
    await user.keyboard('{Enter}');
    expect(dispatch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'إنهاء المجلس' }),
    );
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'نعم، أنهوا المجلس' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'end' });
  });
});

const link = (name: string) => screen.queryByRole('link', { name });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the repository links', () => {
  it('point at the address the build was given', () => {
    vi.stubEnv('VITE_REPO_URL', 'https://example.org/someone/a-fork/');
    open();
    expect(link('الشيفرة المصدرية')?.getAttribute('href')).toBe(
      'https://example.org/someone/a-fork',
    );
    expect(link('ملف المصادر')?.getAttribute('href')).toBe(
      'https://example.org/someone/a-fork/blob/HEAD/NOTICE',
    );
  });

  it('are left out of a build given no address', () => {
    vi.stubEnv('VITE_REPO_URL', '');
    open();
    expect(link('الشيفرة المصدرية')).toBeNull();
    expect(link('ملف المصادر')).toBeNull();
    // The sentence still says where the photographs' sources are.
    expect(screen.getByText(/ملف المصادر/)).toBeTruthy();
  });

  it('are left out for an address that is not https', () => {
    vi.stubEnv('VITE_REPO_URL', 'javascript:alert(1)');
    open();
    expect(link('الشيفرة المصدرية')).toBeNull();
    expect(link('ملف المصادر')).toBeNull();
  });

  it('are never written into the code', () => {
    // AGENTS.md: nothing may name the repository or assume its host.
    const files = readdirSync(join(process.cwd(), 'src'), {
      recursive: true,
      encoding: 'utf8',
    }).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
    for (const f of files)
      expect(
        readFileSync(join(process.cwd(), 'src', f), 'utf8'),
        f,
      ).not.toMatch(/https:\/\/github\.com\//);
  });
});
