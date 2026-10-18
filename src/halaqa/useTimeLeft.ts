import { useSyncExternalStore } from 'react';

/**
 * How long a turn has left, wherever its time is kept: the countdown of a
 * reader's timed turn, or the player reciting a reciter's turn. Both change
 * four times a second, so whatever shows the time reads it through
 * `useTimeLeft` in a component of its own, and nothing else is drawn again
 * as it runs.
 */
export type TurnTime = {
  /** The whole turn in milliseconds on the clock; null until known. */
  total: number | null;
  /** Milliseconds left now; null until known. */
  left: () => number | null;
  subscribe: (listener: () => void) => () => void;
};

const nothing = () => () => {};

/** The time left in `time`, redrawn as it runs; null with no time to
    show. Call it only in the small component that shows it. */
export function useTimeLeft(time: TurnTime | null): number | null {
  return useSyncExternalStore(
    time?.subscribe ?? nothing,
    () => time?.left() ?? null,
    () => null,
  );
}
