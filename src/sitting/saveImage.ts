/* Handing the picture of a sitting's close to the reader: to the system's
   share sheet on a phone or tablet that takes files there, where «حفظ
   الصورة» puts it in the photos, or as a download otherwise. Nothing is
   uploaded; the file goes only where the reader sends it. */

import { CARD_TITLE } from './cardText';

/** What became of the picture: handed to the share sheet, downloaded, or
    the share sheet closed without choosing, which is not a failure. */
export type Saved = 'shared' | 'downloaded' | 'cancelled';

/** «majlis-noor-2026-10-18.png», the day the sitting closed, on this
    device's calendar. Latin digits, since a file name travels to systems
    that sort and search it. */
export function imageName(at: number) {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, '0');
  return `majlis-noor-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.png`;
}

/** What saving needs from the browser, passed in so a test can stand in
    for it. */
export type Browser = {
  navigator: Partial<Pick<Navigator, 'canShare' | 'share'>>;
  /** Whether the device is held and touched, a phone or a tablet. A
      computer's browser may share files too, but its share sheet has no
      «save» on every system, and «احفظ صورة» there means a download. */
  touch: boolean;
  document: Document;
  URL: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
  setTimeout: (run: () => void, ms: number) => unknown;
};

const browser = (): Browser => ({
  navigator,
  touch: matchMedia('(pointer: coarse)').matches,
  document,
  URL,
  setTimeout: (run, ms) => window.setTimeout(run, ms),
});

/** A browser may still be reading a download's address after `click()`
    returns, Firefox and Safari especially, so it is let go a while later
    rather than at once. */
const KEEP_ADDRESS = 40_000;

function download(file: File, b: Browser) {
  const address = b.URL.createObjectURL(file);
  const a = b.document.createElement('a');
  a.href = address;
  a.download = file.name;
  a.hidden = true;
  b.document.body.append(a);
  a.click();
  a.remove();
  b.setTimeout(() => b.URL.revokeObjectURL(address), KEEP_ADDRESS);
}

/**
 * Saves `blob` as the PNG `name`: shared on a touch device whose browser
 * can share a file, downloaded anywhere else, or where sharing fails for
 * any reason but the reader closing the sheet. Rejects only if the
 * download itself cannot be made.
 */
export async function saveImage(
  blob: Blob,
  name: string,
  b: Browser = browser(),
): Promise<Saved> {
  const file = new File([blob], name, { type: 'image/png' });
  const files = [file];
  if (b.touch && b.navigator.share && b.navigator.canShare?.({ files })) {
    try {
      await b.navigator.share({ files, title: CARD_TITLE });
      return 'shared';
    } catch (error) {
      // Read by name: a DOMException is not an Error in every engine.
      if ((error as { name?: unknown } | null)?.name === 'AbortError')
        return 'cancelled';
      // Refused (no tap close enough to the share, a type it will not
      // take, a system that failed): the picture is downloaded instead.
    }
  }
  download(file, b);
  return 'downloaded';
}
