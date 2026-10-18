import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { Countdown } from './countdown';
import type { TurnTime } from './useTimeLeft';

/**
 * The countdown for a turn timed by a reciter's pace.
 *
 * A clock belongs to one turn (`turnKey`): a new turn starts a fresh, running
 * clock, which is what the next reader expects whether or not the last one
 * paused. `duration` is null until the reciter's timings have loaded, and the
 * clock waits for it rather than counting down from nothing.
 *
 * The component that calls this is drawn again only when the clock is
 * paused, resumed or runs out. Its ticks reach only what shows the time,
 * through `time` and `useTimeLeft` (see countdown.ts).
 */
export function useTurnClock({
  enabled,
  duration,
  turnKey,
  onExpire,
}: {
  enabled: boolean;
  duration: number | null;
  turnKey: string;
  onExpire: () => void;
}) {
  const [clock] = useState(() => new Countdown());
  const paused = useSyncExternalStore(
    clock.subscribe,
    () => clock.pausedIn(turnKey),
    () => false,
  );
  const expired = useSyncExternalStore(
    clock.subscribe,
    () => enabled && duration !== null && clock.elapsedIn(turnKey) >= duration,
    () => false,
  );

  useEffect(() => {
    if (!enabled || duration === null) return;
    return clock.run(turnKey, duration);
  }, [clock, enabled, turnKey, duration]);

  const expire = useEffectEvent(onExpire);
  useEffect(() => {
    if (expired) expire();
  }, [expired]);

  const time = useMemo<TurnTime | null>(
    () =>
      enabled
        ? {
            total: duration,
            left: () =>
              duration === null
                ? null
                : Math.max(0, duration - clock.elapsedIn(turnKey)),
            subscribe: clock.subscribe,
          }
        : null,
    [clock, enabled, duration, turnKey],
  );

  return {
    /** The turn's time, for whatever shows it; null on an untimed turn. */
    time,
    paused,
    pause: () => clock.pause(turnKey),
    resume: () => clock.resume(turnKey),
  };
}
