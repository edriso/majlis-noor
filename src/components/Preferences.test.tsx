import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { defaultPrefs, type Theme } from '@/halaqa/state';
import { THEMES } from '@/styles/themes';
import { AppearanceFields } from './Preferences';

const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

it('draws each theme’s swatch in that theme’s colour, whichever is on', () => {
  render(
    <AppearanceFields
      prefs={{ ...defaultPrefs, theme: 'sand' }}
      onChange={() => {}}
    />,
  );
  const labels: Record<Theme, string> = {
    green: 'أخضر',
    burgundy: 'عنّابي',
    blue: 'أزرق',
    sand: 'رملي',
  };
  for (const [theme, label] of Object.entries(labels) as [Theme, string][]) {
    const option = screen.getByLabelText(label).closest('label');
    const swatch = option?.querySelector<HTMLElement>('.swatch');
    expect(swatch?.style.background, theme).toBe(rgb(THEMES[theme].swatch));
  }
});
