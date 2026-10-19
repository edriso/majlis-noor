import { describe, expect, it, vi } from 'vitest';
import { defaultPrefs, initialState, memberName, type State } from './state';
import { loadState, saveState, STORAGE_KEY } from './storage';

describe('the saved halaqa', () => {
  it('reads an older saved shape and saves it back in the current one', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        prefs: { theme: 'green', view: 'halaqa' },
        config: { readers: ['أحمد', ''] },
        session: null,
      }),
    );
    const state = loadState();
    expect(state.prefs.theme).toBe('green');
    expect(state.config.members.map(memberName)).toEqual([
      'أحمد',
      'القارئ الثاني',
    ]);
    saveState(state);
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.prefs.theme).toBe('green');
    expect(saved.config.readers).toBeUndefined();
    expect(saved.config.members).toHaveLength(2);
  });

  it('starts fresh from a value it cannot read', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadState().session).toBeNull();
  });
});

describe('a first visit', () => {
  const fresh: State = {
    ...initialState,
    prefs: { ...defaultPrefs, theme: 'sand' },
  };

  it('starts from the halaqa it is handed when nothing is saved', () => {
    expect(loadState(fresh)).toBe(fresh);
  });

  it('starts from it too when storage is refused or unreadable', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadState(fresh)).toBe(fresh);
    const refused = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
    expect(loadState(fresh)).toBe(fresh);
    refused.mockRestore();
  });

  it('never outweighs a saved halaqa, whose theme is kept', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ prefs: { theme: 'blue' } }),
    );
    expect(loadState(fresh).prefs.theme).toBe('blue');
    // Saved before themes could be chosen: the default, as sanitizeState
    // reads it, not the first visit's.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ config: {} }));
    expect(loadState(fresh).prefs.theme).toBe(defaultPrefs.theme);
  });
});
