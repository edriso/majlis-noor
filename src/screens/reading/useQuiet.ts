import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** A phone on its side: too short for the bars and the page both. */
const SIDEWAYS = '(orientation: landscape) and (max-height: 500px)';

const watchSideways = (listener: () => void) => {
  const query = window.matchMedia(SIDEWAYS);
  query.addEventListener?.('change', listener);
  return () => query.removeEventListener?.('change', listener);
};
const isSideways = () => window.matchMedia(SIDEWAYS).matches;

/**
 * Whether the bars round the page are hidden, leaving the page alone. The
 * reader hides them from the menu, which also asks for the whole screen
 * where the browser can give it; a phone on its side hides them by itself,
 * since there the bars would leave the page a strip. Either way they come
 * back from the small button at the screen's edge, or Escape, and stay
 * until hidden again. Leaving the whole screen (the browser's own Escape)
 * brings them back too.
 */
export function useQuiet() {
  const [bars, setBars] = useState<'auto' | 'shown' | 'hidden'>('auto');
  const onSide = useSyncExternalStore(watchSideways, isSideways, () => false);
  // Whether the whole screen is ours to give back.
  const full = useRef(false);

  useEffect(() => {
    const change = () => {
      if (document.fullscreenElement || !full.current) return;
      full.current = false;
      setBars('shown');
    };
    document.addEventListener('fullscreenchange', change);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      if (full.current && document.fullscreenElement)
        document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const hide = () => {
    setBars('hidden');
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen)
      root.requestFullscreen({ navigationUI: 'hide' }).then(
        () => {
          full.current = true;
        },
        // Refused (an iPhone, a frame): the bars are hidden all the same.
        () => {},
      );
  };
  const show = () => {
    setBars('shown');
    if (full.current && document.fullscreenElement) {
      full.current = false;
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return {
    hidden: bars === 'hidden' || (bars === 'auto' && onSide),
    hide,
    show,
  };
}
