import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as icons from './icons';

/* The drawings were copied from Lucide and checked against it, byte for
   byte, before the package went. What can still drift is the frame they
   share, which is what made them look like Lucide's: this holds it. */

describe('the icons', () => {
  for (const [name, Icon] of Object.entries(icons))
    it(`draws ${name} in Lucide's frame, hidden from screen readers`, () => {
      const { container } = render(<Icon />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(svg.getAttribute('width')).toBe('24');
      expect(svg.getAttribute('fill')).toBe('none');
      expect(svg.getAttribute('stroke')).toBe('currentColor');
      expect(svg.getAttribute('stroke-width')).toBe('2');
      expect(svg.getAttribute('stroke-linecap')).toBe('round');
      expect(svg.getAttribute('stroke-linejoin')).toBe('round');
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.children.length).toBeGreaterThan(0);
    });

  it('takes the size, stroke and class it is given', () => {
    const { container } = render(
      <icons.Check size={12} strokeWidth={3} className="spin" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('12');
    expect(svg.getAttribute('height')).toBe('12');
    expect(svg.getAttribute('stroke-width')).toBe('3');
    expect(svg.getAttribute('class')).toBe('spin');
  });
});
