import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultConfig,
  defaultPrefs,
  initialState,
  reduce,
} from '@/halaqa/state';
import { SettingsPanel } from './SettingsPanel';

/* The about text links to the source and to NOTICE at the address the
   build was given (VITE_REPO_URL, from the Pages workflow), and to nothing
   when it was given none: a wrong address is worse than no link. */

const open = () => {
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
      dispatch={() => {}}
    />,
  );
};

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
