import { useSyncExternalStore } from 'react';
import type { Position } from './player';
import { PositionFeed } from './position';
import { player } from './useRecitation';

/** The halaqa's player's position, read on every frame while anyone
    follows it (see position.ts). */
const feed = new PositionFeed(player);

const followNothing = () => () => {};

/**
 * Where the halaqa's recitation is in its recording, on every frame, for
 * marking the ayah or the word being recited: the recording, the page its
 * stretch recites, and the milliseconds into the file, which compare with
 * the timings as they are, at any speed. Null unless it is reciting.
 *
 * Only the component that calls it is drawn again as the time moves, so it
 * belongs in the small one that draws the mark, never in the page.
 *
 * `key` follows one recitation, the `key` its hook returns; left out, it
 * follows whatever the halaqa's player recites (a turn, «استمع», an ayah);
 * null follows nothing and costs nothing, as when the mark is turned off.
 */
export function usePlaybackPosition(key?: string | null): Position | null {
  return useSyncExternalStore(
    key === null ? followNothing : feed.subscribe,
    () => {
      const position = key === null ? null : feed.getSnapshot();
      return position && (key === undefined || position.key === key)
        ? position
        : null;
    },
    () => null,
  );
}
