import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Countdown } from './countdown';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A countdown on the fake clock, and how many times it told anyone. */
const make = () => {
  const clock = new Countdown(() => Date.now());
  const heard = vi.fn();
  clock.subscribe(heard);
  return { clock, heard };
};

describe('a turn’s countdown', () => {
  it('counts the time that passes, and stops at the end', () => {
    const { clock, heard } = make();
    const stop = clock.run('a', 1_000);
    vi.advanceTimersByTime(750);
    expect(clock.elapsedIn('a')).toBe(750);
    expect(heard).toHaveBeenCalledTimes(4); // the claim, then three ticks
    vi.advanceTimersByTime(5_000);
    expect(clock.elapsedIn('a')).toBe(1_000);
    stop();
  });

  it('counts the time between ticks, however late they come', () => {
    // A background tab may run a 250ms timer once a second.
    let now = 0;
    const clock = new Countdown(() => now);
    const stop = clock.run('a', 10_000);
    now = 1_000;
    vi.advanceTimersByTime(250);
    expect(clock.elapsedIn('a')).toBe(1_000);
    stop();
  });

  it('counts nothing while paused, and carries on from there', () => {
    const { clock } = make();
    const stop = clock.run('a', 10_000);
    vi.advanceTimersByTime(500);
    clock.pause('a');
    expect(clock.pausedIn('a')).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(clock.elapsedIn('a')).toBe(500);
    clock.resume('a');
    vi.advanceTimersByTime(500);
    expect(clock.elapsedIn('a')).toBe(1_000);
    stop();
  });

  it('starts a new turn from nothing, running, even after a pause', () => {
    const { clock } = make();
    let stop = clock.run('a', 10_000);
    vi.advanceTimersByTime(500);
    clock.pause('a');
    stop();
    stop = clock.run('b', 10_000);
    expect(clock.pausedIn('b')).toBe(false);
    expect(clock.elapsedIn('b')).toBe(0);
    // What it says about the turn it left is that nothing was counted.
    expect(clock.elapsedIn('a')).toBe(0);
    vi.advanceTimersByTime(250);
    expect(clock.elapsedIn('b')).toBe(250);
    stop();
  });

  it('carries on the same turn when run again', () => {
    const { clock } = make();
    let stop = clock.run('a', 10_000);
    vi.advanceTimersByTime(500);
    stop();
    stop = clock.run('a', 10_000);
    vi.advanceTimersByTime(250);
    expect(clock.elapsedIn('a')).toBe(750);
    stop();
  });

  it('may be paused before its time is known', () => {
    const { clock } = make();
    clock.pause('a');
    const stop = clock.run('a', 10_000);
    vi.advanceTimersByTime(1_000);
    expect(clock.elapsedIn('a')).toBe(0);
    stop();
  });
});
