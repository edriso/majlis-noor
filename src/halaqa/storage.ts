/* The halaqa is kept in this browser's localStorage and nowhere else, so a
   refresh in the middle of a sitting offers to carry on from the same page
   with the same reader. Nothing is sent anywhere.

   The key is part of the contract with every device that already has a
   halaqa saved under it, and `index.html` reads it too, to paint the theme
   before the bundle loads. */

import { initialState, sanitizeState, type State } from './state';

export const STORAGE_KEY = 'majlis-noor:v1';

/**
 * The halaqa saved on this device, or `fresh` when there is none: a first
 * visit, which useHalaqa gives the system's light or dark theme. Anything
 * saved wins, a theme with it, even one chosen on a system that has since
 * turned dark; index.html's boot script reads it the same way.
 */
export function loadState(fresh: State = initialState): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : fresh;
  } catch {
    // Storage blocked (a private window, a sandboxed frame) or a corrupt
    // value: start fresh rather than not at all.
    return fresh;
  }
}

export function saveState(state: State) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // A refused write loses only the ability to resume after a refresh; the
    // halaqa in front of the reader carries on.
  }
}
