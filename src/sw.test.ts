import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { injectPrecache, type Precache } from '../scripts/precache.ts';

/* public/sw.js run as a browser runs it, against a fake Cache Storage and
   a fake network, as the build writes it: what it installs, what it serves
   offline, and how one version hands over to the next without pulling the
   files from under a page still open. */

const SCOPE = 'https://example.org/app/';
const FONT = 'https://static.qurancdn.com/fonts/quran/hafs/v2/woff2/p1.woff2';
const AUDIO = 'https://download.quranicaudio.com/qdc/husary/murattal/1.mp3';
const source = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');

type Req = { url: string; method?: string; mode?: string };
const urlOf = (r: string | URL | Req) =>
  typeof r === 'string' ? r : r instanceof URL ? r.href : r.url;

class FakeCache {
  entries = new Map<string, Response>();
  match(r: string | Req) {
    return Promise.resolve(this.entries.get(urlOf(r))?.clone());
  }
  put(r: string | Req, response: Response) {
    this.entries.set(urlOf(r), response);
    return Promise.resolve();
  }
  keys() {
    return Promise.resolve([...this.entries.keys()].map((url) => ({ url })));
  }
  delete(r: string | Req) {
    return Promise.resolve(this.entries.delete(urlOf(r)));
  }
}

class FakeCaches {
  stores = new Map<string, FakeCache>();
  open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache());
    return Promise.resolve(this.stores.get(name)!);
  }
  keys() {
    return Promise.resolve([...this.stores.keys()]);
  }
  delete(name: string) {
    return Promise.resolve(this.stores.delete(name));
  }
  async match(r: string | Req, options?: { cacheName?: string }) {
    for (const name of options?.cacheName
      ? [options.cacheName]
      : this.stores.keys()) {
      const hit = await this.stores.get(name)?.match(r);
      if (hit) return hit;
    }
    return undefined;
  }
  /** What one cache holds, as paths from the scope with their hash. */
  paths(name: string) {
    return [...(this.stores.get(name)?.entries.keys() ?? [])]
      .map((u) => u.replace(SCOPE, ''))
      .toSorted();
  }
}

/** The server: its files, whether it can be reached, what was asked of it. */
class Network {
  files = new Map<string, string>();
  online = true;
  asked: { url: string; cache?: string }[] = [];
  serve(files: Record<string, string>) {
    for (const [path, body] of Object.entries(files))
      this.files.set(path.startsWith('https:') ? path : SCOPE + path, body);
  }
  fetch = (r: string | URL | Req, init?: { cache?: string }) => {
    const url = urlOf(r);
    this.asked.push({ url: url.replace(SCOPE, ''), cache: init?.cache });
    if (!this.online) return Promise.reject(new TypeError('Failed to fetch'));
    // A static host answers a folder with its index.html.
    const path = new URL(url);
    const file = path.origin + path.pathname;
    const body = this.files.get(file.endsWith('/') ? `${file}index.html` : url);
    return Promise.resolve(
      new Response(body ?? 'not found', { status: body ? 200 : 404 }),
    );
  };
}

let caches: FakeCaches;
let network: Network;

/** One version of the worker, started as the browser starts it. */
function worker(precache: Precache) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    registration: { scope: SCOPE },
    location: { origin: new URL(SCOPE).origin },
    addEventListener: (type: string, fn: (event: unknown) => void) =>
      listeners.set(type, fn),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(() => Promise.resolve()) },
  };
  runInNewContext(injectPrecache(source, precache), {
    self,
    caches,
    fetch: network.fetch,
    URL,
    Response,
  });
  const extendable = async (type: string, extra = {}) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      ...extra,
    });
    await Promise.all(waits);
  };
  return {
    self,
    install: () => extendable('install'),
    activate: () => extendable('activate'),
    message: (data: unknown) => listeners.get('message')!({ data }),
    /** What the page gets for a request: the worker's answer, or
        `undefined` when the worker leaves it to the network. */
    async fetch(request: Req): Promise<string | undefined> {
      let answer: Promise<Response> | undefined;
      const waits: Promise<unknown>[] = [];
      listeners.get('fetch')!({
        request: { method: 'GET', mode: 'cors', ...request },
        respondWith: (p: Promise<Response>) => (answer = p),
        waitUntil: (p: Promise<unknown>) => waits.push(p),
      });
      const response = answer && (await answer);
      await Promise.all(waits);
      return response?.text();
    },
  };
}

const at = (path: string) => ({ url: SCOPE + path });
const open = (path = '') => ({ url: SCOPE + path, mode: 'navigate' });

const v1: Precache = {
  files: {
    'index.html': 'i1',
    'assets/index-A1.js': '',
    'pages/1.json': 'p1',
    'pages/2.json': 'p2',
    'fonts/amiri-quran/AmiriQuran.woff2': 'f1',
  },
  words: 'w1',
};
const site1 = {
  'index.html': 'page v1',
  'assets/index-A1.js': 'app v1',
  'pages/1.json': 'page one',
  'pages/2.json': 'page two',
  'fonts/amiri-quran/AmiriQuran.woff2': 'amiri quran',
  'words/husary/1.json': 'words of al-Fatiha',
  'reciters/husary.webp': 'photo',
  [FONT]: 'page font',
  [AUDIO]: 'recitation',
};

beforeEach(() => {
  caches = new FakeCaches();
  network = new Network();
  network.serve(site1);
});

describe('installing', () => {
  it('fetches every file the build listed, once, and takes over nothing', async () => {
    const sw = worker(v1);
    await sw.install();
    expect(network.asked.map((a) => a.url).toSorted()).toEqual(
      Object.keys(v1.files).toSorted(),
    );
    expect(caches.paths('majlis-noor-app-v4')).toEqual([
      'assets/index-A1.js',
      'fonts/amiri-quran/AmiriQuran.woff2?v=f1',
      'index.html?v=i1',
      'pages/1.json?v=p1',
      'pages/2.json?v=p2',
    ]);
    expect(sw.self.skipWaiting).not.toHaveBeenCalled();
  });

  it('asks the server again for files whose names do not change', async () => {
    await worker(v1).install();
    const cache = Object.fromEntries(
      network.asked.map((a) => [a.url, a.cache]),
    );
    expect(cache['index.html']).toBe('no-cache');
    expect(cache['pages/1.json']).toBe('no-cache');
    expect(cache['assets/index-A1.js']).toBe('default');
  });

  it('fails if a file cannot be had, and resumes where it stopped', async () => {
    network.files.delete(SCOPE + 'pages/2.json');
    await expect(worker(v1).install()).rejects.toThrow(/pages\/2\.json: 404/);
    network.serve(site1);
    network.asked = [];
    await worker(v1).install();
    expect(network.asked.map((a) => a.url)).toEqual(['pages/2.json']);
  });
});

describe('a visit after the first', () => {
  const installed = async () => {
    const sw = worker(v1);
    await sw.install();
    await sw.activate();
    network.asked = [];
    return sw;
  };

  it('opens and reads with no connection', async () => {
    const sw = await installed();
    network.online = false;
    expect(await sw.fetch(open())).toBe('page v1');
    expect(await sw.fetch(open('?from=home'))).toBe('page v1');
    expect(await sw.fetch(at('assets/index-A1.js'))).toBe('app v1');
    expect(await sw.fetch(at('pages/2.json'))).toBe('page two');
    expect(await sw.fetch(at('fonts/amiri-quran/AmiriQuran.woff2'))).toBe(
      'amiri quran',
    );
  });

  it('serves installed files without the network, and the page from it', async () => {
    const sw = await installed();
    network.serve({ 'index.html': 'page v2' });
    expect(await sw.fetch(at('pages/1.json'))).toBe('page one');
    expect(network.asked).toEqual([]);
    expect(await sw.fetch(open())).toBe('page v2');
  });

  it('keeps word timings and photos the first time they are fetched', async () => {
    const sw = await installed();
    expect(await sw.fetch(at('words/husary/1.json'))).toBe(
      'words of al-Fatiha',
    );
    expect(await sw.fetch(at('reciters/husary.webp'))).toBe('photo');
    network.online = false;
    expect(await sw.fetch(at('words/husary/1.json'))).toBe(
      'words of al-Fatiha',
    );
    expect(await sw.fetch(at('reciters/husary.webp'))).toBe('photo');
    expect(caches.paths('majlis-noor-words-v4-w1')).toEqual([
      'words/husary/1.json',
    ]);
  });

  it('keeps the page fonts it has fetched', async () => {
    const sw = await installed();
    expect(await sw.fetch({ url: FONT })).toBe('page font');
    network.online = false;
    expect(await sw.fetch({ url: FONT })).toBe('page font');
    expect(caches.paths('majlis-noor-page-fonts')).toEqual([FONT]);
  });

  it('leaves recitations, and anything not fetched, to the network', async () => {
    const sw = await installed();
    expect(await sw.fetch({ url: AUDIO })).toBeUndefined();
    expect(
      await sw.fetch({ ...at('pages/1.json'), method: 'POST' }),
    ).toBeUndefined();
    expect(await sw.fetch({ url: 'https://example.org/elsewhere.js' })).toBe(
      undefined,
    );
    expect(caches.paths('majlis-noor-runtime-v4')).toEqual([]);
  });
});

describe('a new version', () => {
  const v2: Precache = {
    files: {
      'index.html': 'i2',
      'assets/index-B2.js': '',
      'pages/1.json': 'p1',
      'pages/2.json': 'p2b',
      'fonts/amiri-quran/AmiriQuran.woff2': 'f1',
    },
    words: 'w2',
  };
  const deploy = () => {
    // GitHub Pages replaces the site: the old version's script is gone.
    network.files.delete(SCOPE + 'assets/index-A1.js');
    network.serve({
      'index.html': 'page v2',
      'assets/index-B2.js': 'app v2',
      'pages/2.json': 'page two, rebuilt',
    });
    network.asked = [];
  };

  it('fetches only what changed', async () => {
    const old = worker(v1);
    await old.install();
    await old.activate();
    deploy();
    await worker(v2).install();
    expect(network.asked.map((a) => a.url).toSorted()).toEqual([
      'assets/index-B2.js',
      'index.html',
      'pages/2.json',
    ]);
  });

  it('waits, leaving the open tab its own files, until it is asked', async () => {
    const old = worker(v1);
    await old.install();
    await old.activate();
    deploy();
    const next = worker(v2);
    await next.install();
    // The old worker still serves the sitting in progress, offline too.
    network.online = false;
    expect(await old.fetch(at('assets/index-A1.js'))).toBe('app v1');
    expect(await old.fetch(at('pages/2.json'))).toBe('page two');
    expect(await old.fetch(open())).toBe('page v1');
    expect(next.self.skipWaiting).not.toHaveBeenCalled();
    next.message('something else');
    expect(next.self.skipWaiting).not.toHaveBeenCalled();
    next.message('skip-waiting');
    expect(next.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('serves a page of the new version its scripts before taking over', async () => {
    const old = worker(v1);
    await old.install();
    await old.activate();
    deploy();
    await worker(v2).install();
    // The page is the new version's, from the network; the connection then
    // goes, and the old worker finds the new script the new one installed.
    expect(await old.fetch(open())).toBe('page v2');
    network.online = false;
    expect(await old.fetch(at('assets/index-B2.js'))).toBe('app v2');
  });

  it('drops the old version’s files once it has taken over', async () => {
    const old = worker(v1);
    await old.install();
    await old.activate();
    await old.fetch(at('words/husary/1.json'));
    await old.fetch(at('reciters/husary.webp'));
    deploy();
    const next = worker(v2);
    await next.install();
    await next.activate();
    expect(caches.paths('majlis-noor-app-v4')).toEqual([
      'assets/index-B2.js',
      'fonts/amiri-quran/AmiriQuran.woff2?v=f1',
      'index.html?v=i2',
      'pages/1.json?v=p1',
      'pages/2.json?v=p2b',
    ]);
    expect(next.self.clients.claim).toHaveBeenCalled();
    // The word timings changed, so their cache went; the photo stays.
    expect([...caches.stores.keys()]).not.toContain('majlis-noor-words-v4-w1');
    expect(caches.paths('majlis-noor-runtime-v4')).toEqual([
      'reciters/husary.webp',
    ]);
    network.online = false;
    expect(await next.fetch(open())).toBe('page v2');
    expect(await next.fetch(at('pages/2.json'))).toBe('page two, rebuilt');
  });

  it('clears the caches of earlier versions, and keeps their page fonts', async () => {
    const earlier = await caches.open('majlis-noor-assets-v3');
    await earlier.put(FONT, new Response('page font'));
    await earlier.put(SCOPE + 'assets/index-Old.js', new Response('old'));
    await (
      await caches.open('majlis-ayah-shell-v2')
    ).put(SCOPE, new Response('old name'));
    await caches.open('someone-elses-cache');
    const sw = worker(v1);
    await sw.install();
    await sw.activate();
    expect([...caches.stores.keys()].toSorted()).toEqual([
      'majlis-noor-app-v4',
      'majlis-noor-page-fonts',
      'majlis-noor-runtime-v4',
      'someone-elses-cache',
    ]);
    network.online = false;
    expect(await sw.fetch({ url: FONT })).toBe('page font');
  });
});
