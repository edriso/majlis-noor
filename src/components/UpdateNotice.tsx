import type { CSSProperties } from 'react';
import { useServiceWorker } from '@/hooks/useServiceWorker';

/* Its own few styles, from the tokens, so it can sit on the start screen
   whatever that screen's stylesheet becomes. */
const box: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px 16px',
  width: 'min(560px, calc(100% - 32px))',
  margin: 'max(16px, env(safe-area-inset-top)) auto 0',
  paddingBlock: 8,
  paddingInline: '16px 8px',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  background: 'var(--surface)',
  color: 'var(--muted)',
  fontSize: 15,
};
// `.button` alone keeps the browser's own grey; gold on the notice's ground
// is a pair the contrast test measures.
const button: CSSProperties = {
  minHeight: 44,
  background: 'transparent',
  borderColor: 'var(--gold-line)',
  color: 'var(--gold)',
};

/**
 * Says, quietly, that a new version of the app is installed and waiting, and
 * offers to switch to it. Only ever on the start screen: switching reloads
 * the page, which must never happen in the middle of a sitting, and a
 * waiting version harms no one, since the worker keeps serving the files of
 * the one in use.
 *
 * An `<output>`, so it is a status a screen reader reads without moving
 * focus to it. It is drawn only while a version waits: the start screen has
 * its own status, which nothing should be mistaken for.
 */
export function UpdateNotice() {
  const { updateWaiting, applyUpdate } = useServiceWorker();
  if (!updateWaiting) return null;
  return (
    // Spans, since an <output> holds phrasing content only.
    <output style={box}>
      <span>نسخة جديدة من التطبيق جاهزة</span>
      <button
        type="button"
        className="button"
        style={button}
        onClick={() => applyUpdate()}
      >
        حدِّث الآن
      </button>
    </output>
  );
}
