import { useEffect, useRef, useState } from 'react';
import type { Segment } from '@/data/timings';
import type { Meta } from './player';
import { player, usePlayer } from './useRecitation';

export type AyahStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

let played = 0;
/** A key of its own for every ayah played, so that stopping one never
    stops the next. */
const nextKey = (id: string) => `ayah:${++played}:${id}`;

/**
 * One ayah, or a few, heard alone: to hear how a word is read, or to repeat
 * after the sheikh. The caller works out the stretches of the recording
 * from the timings and gives them a name of its choosing (`id`, the verse
 * key, say); they play once or `times` times on the halaqa's one player,
 * since a phone plays only the element a tap unlocked.
 *
 * Whatever was playing waits: a seated reciter's turn, or «استمع». When the
 * ayah ends or is stopped, it carries on from the same place in its
 * recording, reciting if it was, paused if the reader had paused it. An
 * ayah that will not play says so (`error`) and leaves what waits as it
 * was, to carry on when the ayah is stopped or its own button is pressed.
 *
 * The ayah belongs to `scope` (the turn and page it was chosen on): when
 * the scope changes, or the screen closes, it stops, so it never plays on
 * over a page or a turn it was not chosen for.
 */
export function useAyahListen(scope = '') {
  const state = usePlayer();
  const [mine, setMine] = useState<{
    key: string;
    id: string;
    scope: string;
  } | null>(null);
  // The ayah last played in this scope, stopped when the scope ends.
  const live = useRef<{ key: string | null }>({ key: null });
  useEffect(() => {
    const token: { key: string | null } = { key: null };
    live.current = token;
    return () => {
      if (token.key) player.stop(token.key);
    };
  }, [scope]);

  const current =
    mine && mine.scope === scope && state.key === mine.key ? mine : null;
  const raw = current ? state.status : 'idle';
  // Only ever started by a tap, so one the browser held back anyway is as
  // good as paused: the next tap starts it.
  const status: AyahStatus =
    raw === 'idle' || raw === 'ended'
      ? 'idle'
      : raw === 'blocked'
        ? 'paused'
        : raw;
  const sounding = status === 'playing' || status === 'loading';

  return {
    /** What the ayah plays under, for `usePlaybackPosition`; null when
        none plays. */
    key: status === 'idle' ? null : (current?.key ?? null),
    /** The `id` of the ayah playing, or that failed. */
    id: status === 'idle' ? null : (current?.id ?? null),
    status,
    /** Plays `stretches` `times` times over, replacing an ayah already
        playing; what waited under that one still waits. */
    play: (
      id: string,
      stretches: readonly Segment[],
      options: { times?: number; meta?: Meta } = {},
    ) => {
      const key = nextKey(id);
      const times = Math.max(1, Math.floor(options.times ?? 1));
      live.current.key = key;
      player.play(key, Array.from({ length: times }, () => stretches).flat(), {
        over: true,
        meta: options.meta,
      });
      setMine({ key, id, scope });
    },
    /** Stops it; what waited carries on. */
    stop: () => {
      if (current) player.stop(current.key);
    },
    /** Pauses it if it is sounding, and says whether it was. */
    pause: () => {
      if (!sounding) return false;
      player.pause();
      return true;
    },
    /** Carries it on, or tries again after a failure. */
    resume: () => {
      if (status === 'paused' || status === 'error') player.resume();
    },
  };
}
