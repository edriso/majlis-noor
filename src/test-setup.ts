import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom has neither; the app only feature-detects them.
if (!window.matchMedia)
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;

// jsdom draws nothing, so it implements no scrolling either.
window.scrollTo = () => {};
if (!('scrollTo' in Element.prototype))
  Object.assign(Element.prototype, { scrollTo: () => {} });

// jsdom has <dialog> but can neither open nor close one. These do the part
// the app relies on: the open attribute, and the close event the sheet's
// state follows, fired here at once where a browser fires it a task later.
Object.assign(HTMLDialogElement.prototype, {
  showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  },
  close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  },
});

// jsdom has media elements but plays nothing; a recitation here only ever
// starts, and the player is tested on its own with a fake element.
Object.assign(HTMLMediaElement.prototype, {
  play: () => Promise.resolve(),
  pause: () => {},
  load: () => {},
});

/* The Mushaf's pages are files in public/pages, which the app fetches by
   address and which no server serves here. Those addresses, and only those,
   are answered from disk; every other request goes where it went before. */
const networkFetch = globalThis.fetch;
const pageFile = (input: RequestInfo | URL) => {
  try {
    const href = input instanceof Request ? input.url : String(input);
    const path = new URL(href, window.location.href).pathname;
    return /\/pages\/(\d+)\.json$/.exec(path)?.[1];
  } catch {
    return undefined;
  }
};
globalThis.fetch = async (input, init) => {
  const n = pageFile(input);
  if (n === undefined) return networkFetch(input, init);
  try {
    const body = await readFile(
      join(import.meta.dirname, `../public/pages/${n}.json`),
      'utf8',
    );
    return new Response(body, {
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response('', { status: 404 });
  }
};
