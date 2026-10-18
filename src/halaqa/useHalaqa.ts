import { useEffect, useReducer } from 'react';
import { systemTheme } from '@/styles/themes';
import { initialState, reduce, type State } from './state';
import { loadState, saveState } from './storage';

/** A first visit's halaqa: the default, in the theme the system's light or
    dark calls for. */
const firstVisit = (): State => ({
  ...initialState,
  prefs: { ...initialState.prefs, theme: systemTheme() },
});

/** The halaqa's state, saved after every change. */
export function useHalaqa() {
  const [state, dispatch] = useReducer(reduce, undefined, () =>
    loadState(firstVisit()),
  );
  useEffect(() => saveState(state), [state]);
  return [state, dispatch] as const;
}
