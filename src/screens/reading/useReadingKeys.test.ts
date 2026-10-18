import { describe, expect, it } from 'vitest';
import { spaceTarget } from './useReadingKeys';

const nothing = {
  ayah: 'idle',
  reciting: false,
  timed: false,
  listen: 'idle',
} as const;

describe('Space', () => {
  it('goes first to an ayah heard alone, whatever else runs', () => {
    expect(spaceTarget({ ...nothing, ayah: 'playing', reciting: true })).toBe(
      'ayah',
    );
    expect(spaceTarget({ ...nothing, ayah: 'paused', timed: true })).toBe(
      'ayah',
    );
    // One that failed is tried again, as its own button would.
    expect(spaceTarget({ ...nothing, ayah: 'error', listen: 'playing' })).toBe(
      'ayah',
    );
  });

  it('then to a reciter’s turn, a timed reader’s clock, or «استمع»', () => {
    expect(spaceTarget({ ...nothing, reciting: true })).toBe('recitation');
    expect(spaceTarget({ ...nothing, timed: true, listen: 'playing' })).toBe(
      'timer',
    );
    expect(spaceTarget({ ...nothing, listen: 'paused' })).toBe('listen');
  });

  it('is left to the page when nothing runs', () => {
    expect(spaceTarget(nothing)).toBeNull();
    expect(spaceTarget({ ...nothing, listen: 'error' })).toBeNull();
  });
});
