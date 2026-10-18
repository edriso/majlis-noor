/* Keeps Majlis Noor usable with a weak or absent connection, which is what a
   mosque often has.

   - Everything the app needs to open and read is fetched as the worker
     installs, from the list the build writes in below: the page, its
     scripts and styles, the Mushaf's pages, the fonts, the icons. After one
     visit online, the app opens and reads with no connection at all.
   - The page itself is network-first, so a deploy is picked up on the next
     visit, falling back to the installed copy offline.
   - Anything else of ours, fetched as it is asked for (a reciter's photo,
     a surah's word timings, a file of another version), is kept the first
     time and served from the cache after: none of it changes under the
     same address.
   - The page fonts from static.qurancdn.com never change under theirs
     either, and are kept for good, in a cache no version drops.
   - Recitation audio is never cached here: it is large, streamed in ranges,
     and only listened to, never needed to read.

   A new version never takes over a page already open. GitHub Pages deletes
   the old version's files when it publishes a new one, and a sitting in
   progress must keep finding them. So the new worker installs and waits
   until no tab of the old one is left, or until the page asks it to take
   over ('skip-waiting', which «حدِّث الآن» on the start screen sends). Old
   caches are deleted only once it has.

   Bump VERSION to drop every cache this worker made but the page fonts. */

const VERSION = 'v4';

/* Written in at build time (scripts/precache.ts, called by vite.config.ts):
   each file to keep, by its path from this worker's scope, with a hash of
   its contents ('' under assets/, whose names carry one), and one hash over
   the word timings. */
const { files, words } = self.__PRECACHE__;
const PRECACHE = new Map(Object.entries(files));

const SCOPE = self.registration.scope;
const FONT_HOST = 'static.qurancdn.com';
const APP = `majlis-noor-app-${VERSION}`;
const RUNTIME = `majlis-noor-runtime-${VERSION}`;
const WORDS = `majlis-noor-words-${VERSION}-${words}`;
const PAGE_FONTS = 'majlis-noor-page-fonts';
const KEEP = [APP, RUNTIME, WORDS, PAGE_FONTS];

/* A file this version keeps is stored under its address plus its hash, so
   a new version's copy of a page or a font sits beside the old one, which
   an open tab may still be reading, instead of overwriting it. */
const keyOf = (path) => {
  const url = new URL(path, SCOPE);
  const hash = PRECACHE.get(path);
  if (hash) url.searchParams.set('v', hash);
  return url.href;
};

/** The path of one of our addresses from this worker's scope, or null. */
const pathOf = (url) => {
  const address = url.origin + url.pathname;
  return url.origin === self.location.origin && address.startsWith(SCOPE)
    ? address.slice(SCOPE.length)
    : null;
};

self.addEventListener('install', (event) => {
  event.waitUntil(install());
});

const install = async () => {
  const cache = await caches.open(APP);
  const have = new Set((await cache.keys()).map((r) => r.url));
  // What the last version already fetched, with the same contents, is kept.
  const missing = [...PRECACHE.keys()].filter((p) => !have.has(keyOf(p)));
  // A few at a time, so 600-odd pages do not crowd out a weak connection,
  // and each stored as it lands, so an install cut short resumes where it
  // stopped. A file whose name does not change with its contents is asked
  // of the server again, never taken from the browser's own cache.
  let next = 0;
  const fetcher = async () => {
    while (next < missing.length) {
      const path = missing[next++];
      const response = await fetch(new URL(path, SCOPE), {
        cache: PRECACHE.get(path) ? 'no-cache' : 'default',
      });
      if (!response.ok) throw new Error(`${path}: ${response.status}`);
      await cache.put(keyOf(path), response);
    }
  };
  await Promise.all(Array.from({ length: 6 }, fetcher));
};

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(activate());
});

const activate = async () => {
  const fonts = await caches.open(PAGE_FONTS);
  for (const name of await caches.keys()) {
    if (KEEP.includes(name)) continue;
    // Caches of earlier versions, and of the app's first name, مجلس آية,
    // which shares this origin. Versions before v4 kept the page fonts
    // with everything else; those move here instead of being fetched again.
    if (!name.startsWith('majlis-noor-') && !name.startsWith('majlis-ayah-'))
      continue;
    const old = await caches.open(name);
    for (const request of await old.keys()) {
      if (new URL(request.url).hostname !== FONT_HOST) continue;
      const font = await old.match(request);
      if (font) await fonts.put(request, font);
    }
    await caches.delete(name);
  }
  // No tab of the last version is left, so neither are its files: those
  // it installed, and those of other versions fetched as they were asked
  // for. Only the photos outlive a version.
  const app = await caches.open(APP);
  const wanted = new Set([...PRECACHE.keys()].map(keyOf));
  for (const request of await app.keys())
    if (!wanted.has(request.url)) await app.delete(request);
  const runtime = await caches.open(RUNTIME);
  for (const request of await runtime.keys())
    if (!pathOf(new URL(request.url))?.startsWith('reciters/'))
      await runtime.delete(request);
  await self.clients.claim();
};

const navigate = async (request) => {
  try {
    return await fetch(request);
  } catch {
    return (
      (await caches.match(keyOf('index.html'), { cacheName: APP })) ??
      Response.error()
    );
  }
};

const precached = async (request, path) =>
  (await caches.match(keyOf(path), { cacheName: APP })) ?? fetch(request);

/* Looks in every cache of ours, not only its own: after a deploy the page
   is the new version's while this worker is still the old one, and the
   new worker, installed and waiting, already holds the new scripts under
   their own names. */
const cacheFirst = async (event, name) => {
  const hit = await caches.match(event.request);
  if (hit) return hit;
  const response = await fetch(event.request);
  if (response.ok) {
    const cache = await caches.open(name);
    event.waitUntil(cache.put(event.request, response.clone()).catch(() => {}));
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (url.hostname === FONT_HOST) {
    event.respondWith(cacheFirst(event, PAGE_FONTS));
    return;
  }
  // Recitations, and anything else not ours, go to the network untouched.
  const path = pathOf(url);
  if (path === null) return;
  if (PRECACHE.has(path)) {
    event.respondWith(precached(request, path));
    return;
  }
  if (path.startsWith('words/')) {
    event.respondWith(cacheFirst(event, WORDS));
    return;
  }
  if (/^(assets|pages|fonts|reciters)\//.test(path))
    event.respondWith(cacheFirst(event, RUNTIME));
});
