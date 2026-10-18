import { describe, expect, it } from 'vitest';
import { spreadOf, swipeOf } from './spread';

const one = (p: number) => ({ first: p, last: p });

describe('the spread', () => {
  it('opens as the Mushaf does, the odd page on the right', () => {
    expect(spreadOf(1, one(1))).toEqual([1, 2]);
    expect(spreadOf(2, one(2))).toEqual([1, 2]);
    expect(spreadOf(51, one(51))).toEqual([51, 52]);
    expect(spreadOf(50, one(50))).toEqual([49, 50]);
    expect(spreadOf(604, one(604))).toEqual([603, 604]);
  });

  it('shows a turn of two pages whole, wherever it starts', () => {
    expect(spreadOf(50, { first: 50, last: 51 })).toEqual([50, 51]);
    expect(spreadOf(51, { first: 50, last: 51 })).toEqual([50, 51]);
    expect(spreadOf(52, { first: 51, last: 52 })).toEqual([51, 52]);
  });

  it('keeps the print’s pairs in a longer turn', () => {
    expect(spreadOf(51, { first: 50, last: 52 })).toEqual([51, 52]);
    expect(spreadOf(50, { first: 50, last: 52 })).toEqual([49, 50]);
  });
});

describe('a finger across the page', () => {
  it('turns forward to the right and back to the left', () => {
    expect(swipeOf({ dx: 120, dy: 10, width: 400 })).toBe('forward');
    expect(swipeOf({ dx: -120, dy: -20, width: 400 })).toBe('back');
  });

  it('leaves a tap, a slip and a scroll alone', () => {
    expect(swipeOf({ dx: 20, dy: 0, width: 400 })).toBeNull();
    expect(swipeOf({ dx: 120, dy: 100, width: 400 })).toBeNull();
    // A wide room asks for a longer stroke.
    expect(swipeOf({ dx: 120, dy: 0, width: 1400 })).toBeNull();
  });
});
