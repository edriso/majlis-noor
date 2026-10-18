import { useEffect, useEffectEvent } from 'react';
import type { AyahStatus } from '@/halaqa/useAyahListen';
import type { PlayerStatus } from '@/halaqa/player';

/** What Space pauses or resumes: an ayah heard alone first, since it plays
    over everything else; then a reciter's turn, a timed reader's clock
    (and «استمع» with it), or «استمع» on its own. Null when nothing runs
    that Space could hold. */
export function spaceTarget(s: {
  ayah: AyahStatus;
  reciting: boolean;
  timed: boolean;
  listen: PlayerStatus;
}): 'ayah' | 'recitation' | 'timer' | 'listen' | null {
  if (s.ayah !== 'idle') return 'ayah';
  if (s.reciting) return 'recitation';
  if (s.timed) return 'timer';
  if (s.listen !== 'idle' && s.listen !== 'error') return 'listen';
  return null;
}

/** Whether `el` is a region that scrolls, which Space belongs to. */
const scrolls = (el: Element | null) =>
  !!el && el.scrollHeight > el.clientHeight + 1;

/**
 * The reading screen's keys. The arrows turn the page the way a
 * right-to-left book turns: left is forward. A focused button owns Space
 * and Enter, a field owns every key, and an open sheet owns the keyboard,
 * so the handler steps aside for all three; the arrows always work, since
 * no control here claims them.
 *
 * One listener for as long as the screen is open. The screen is drawn
 * again whenever the turn changes; what the keys do is read when a key is
 * pressed (`useEffectEvent`), so the listener never has to be bound again.
 */
export function useReadingKeys(keys: {
  /** False while a sheet is open or nothing is left to read. */
  enabled: boolean;
  forward: () => void;
  back: () => void;
  /** Pauses or resumes what runs, and says whether anything did. */
  space: () => boolean;
}) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('input, select, textarea, dialog[open]')) return;
    if (!keys.enabled) return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      keys.forward();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      keys.back();
    } else if (e.key === ' ' && !t?.closest('button, a') && !scrolls(t)) {
      if (keys.space()) e.preventDefault();
    }
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}
