import { useEffect, useRef, useState } from 'react';

/**
 * Whether the bars round the page are hidden, leaving the page alone. The
 * reader hides them from the menu, which also asks for the whole screen
 * where the browser can give it. They come back from the button at the
 * screen's edge, or Escape, and stay until hidden again. Leaving the whole
 * screen (the browser's own Escape) brings them back too.
 *
 * Nothing hides them by itself. A phone on its side used to, since there
 * the bars would leave the page a strip; now they stand beside the page
 * instead (reading.css), so whose turn it is and «تمّ» are always there.
 */
export function useQuiet() {
  const [hidden, setHidden] = useState(false);
  // Whether the whole screen is ours to give back.
  const full = useRef(false);

  useEffect(() => {
    const change = () => {
      if (document.fullscreenElement || !full.current) return;
      full.current = false;
      setHidden(false);
    };
    document.addEventListener('fullscreenchange', change);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      if (full.current && document.fullscreenElement)
        document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const hide = () => {
    setHidden(true);
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
    setHidden(false);
    if (full.current && document.fullscreenElement) {
      full.current = false;
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return { hidden, hide, show };
}
