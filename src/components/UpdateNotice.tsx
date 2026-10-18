import { useServiceWorker } from '@/hooks/useServiceWorker';

/**
 * Says, quietly, that a new version of the app is installed and waiting, and
 * offers to switch to it. Only ever on the start screen: switching reloads
 * the page, which must never happen in the middle of a sitting, and a
 * waiting version harms no one, since the worker keeps serving the files of
 * the one in use. Its look is its own (styles/notice.css), so it can sit on
 * the start screen whatever that screen becomes.
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
    <output className="update-notice">
      <span>نسخة جديدة من التطبيق جاهزة</span>
      <button
        type="button"
        className="button update-notice-button"
        onClick={() => applyUpdate()}
      >
        حدِّث الآن
      </button>
    </output>
  );
}
