/* Measures the reading screen in a real browser, at every size AGENTS.md
   lists, and fails if anything is out of place.

     node scripts/check-layout.ts                 build, then measure
     node scripts/check-layout.ts --no-build      measure the last build
     node scripts/check-layout.ts --shots [dir]   and keep a screenshot of each

   It builds the app, serves the build with `vite preview`, and drives the
   Chrome installed on the machine (CHROME=/path/to/chrome to point
   elsewhere) through its DevTools protocol, with Node's own WebSocket and
   fetch, so the repository carries no browser dependency. A halaqa of four
   (two readers, two reciters) is put in localStorage and opened from the
   start screen, on a timed reader's turn and on a reciter's, and a circle
   of eight on a reader's turn; at each size it checks, in the page view
   and the circle view:

     overflow  the document is no wider than the window
     page      every page shown is whole in its room, nothing scrolled, but
               where a page keeps its 220px floor
     spread    two pages side by side where the room is wider than 1.2
               times its height, the odd one on the right; one otherwise
     seats     every seat of the circle is inside the circle's room
     button    the main button is at least 140px wide, its words whole
     targets   every button in the bars is at least 44 by 44
     type      no words in the bars under 14px
     lines     with the page font host blocked, the page is drawn from its
               text, and no line is wider than the page or clipped

   A phone on its side keeps both bars, as rails beside the page, and is
   measured like any other screen. Nothing here hides the bars, so finding
   them hidden is a failure.

   It prints a table, and exits 1 if any check failed. Run it before and
   after any change to the layout. */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/* The few things in the app this script relies on. A restyled screen may
   rename them; change them here, and nowhere else. */
const SELECTORS = {
  /** «متابعة», on the start screen's card for the halaqa left open. */
  resume: '.resume .button-primary',
  /** The switch between the page and the circle, in the top bar. */
  toggle: '.topbar-toggle',
  /** The page's room, and the page, whose accessible name begins with
      the page it is: «الصفحة ٢٩٣، …». */
  stage: '.mushaf-stage',
  page: '.mushaf-leaf[data-current] .mushaf-page',
  /** Every page drawn on the stage: one, or a spread of two, the one
      beside hidden where the room has no space for it. */
  pages: '.mushaf-leaf .mushaf-page',
  /** The bars above and below (beside, on a phone on its side), and the
      screen with them hidden. */
  bars: '.topbar, .action-bar',
  quiet: '.reading[data-quiet]',
  /** The page's lines, once drawn; `data-font` says glyphs or text. */
  lines: '.mushaf-leaf[data-current] .mushaf-lines[data-font]',
  /** One line's readable text, which is the line itself in text mode. */
  lineText: '.mushaf-text',
  /** The circle's room, and each seat in it. */
  circleRoom: '.circle-view',
  seat: '.halaqa-seat',
  /** The main button under the page: «تمّ», or a reciter's pause. */
  primary: '.action-primary',
};

/** Where the page fonts come from (src/mushaf/fonts.ts). Blocked, every
    page is drawn from its text. */
const FONT_HOST = '*static.qurancdn.com*';

/** The key the halaqa is kept under (src/halaqa/storage.ts). */
const STORAGE_KEY = 'majlis-noor:v1';

const SIZES: [number, number][] = [
  [320, 568],
  [360, 640],
  [375, 667],
  [390, 844],
  [844, 390],
  [740, 360],
  [568, 320],
  [820, 1180],
  [1100, 700],
  [1440, 900],
  [2560, 1440],
];

const FIRST_PAGE = 293;

/** A halaqa of four, reader-timed: turn 0 is the reader «أنت» with a
    clock, turn 1 a reciter. Long names keep the top line, the button and
    the seats honest, and page 293 has the longest lines of fallback text.
    Anything this gets wrong, the app's sanitizeState() repairs. */
function halaqa(turn: number, seats = 4) {
  const config = {
    members: [
      { id: 'p1', kind: 'person', name: '' },
      { id: 'r1', kind: 'reciter', reciter: 'abdulbasit' },
      { id: 'p2', kind: 'person', name: 'عبد الرحمن' },
      { id: 'r2', kind: 'reciter', reciter: 'minshawi' },
      ...circleOfEight.slice(0, seats - 4),
    ],
    mode: 'continue',
    pagesPerTurn: 1,
    turnChange: 'reciter',
    allowance: 1,
    reciter: 'husary',
    startPage: FIRST_PAGE,
  };
  return {
    prefs: {
      theme: 'green',
      photos: 'show',
      speed: 1,
      listenRepeat: 1,
      cue: 'none',
    },
    config,
    session: {
      config,
      anchor: { turn: 0, page: FIRST_PAGE },
      turn,
      pageInTurn: 0,
      pagesRead: 0,
    },
  };
}

/** The four more who make a circle of eight, the most it seats. */
const circleOfEight = [
  { id: 'p3', kind: 'person', name: 'فاطمة' },
  { id: 'r3', kind: 'reciter', reciter: 'husary' },
  { id: 'p4', kind: 'person', name: '' },
  { id: 'p5', kind: 'person', name: 'مريم' },
];

const TURNS = [
  { name: 'reader', turn: 0, seats: 4 },
  { name: 'reciter', turn: 1, seats: 4 },
  { name: 'eight', turn: 2, seats: 8 },
];

const args = process.argv.slice(2);
const shotsAt = args.indexOf('--shots');
const shotsDir = args[shotsAt + 1];
const shots =
  shotsAt < 0
    ? null
    : shotsDir && !shotsDir.startsWith('--')
      ? resolve(shotsDir)
      : mkdtempSync(join(tmpdir(), 'majlis-noor-layout-shots-'));
const build = !args.includes('--no-build');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const arabic = (n: number) =>
  String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

const freePort = () =>
  new Promise<number>((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => done(port));
    });
  });

/* ---------- The DevTools protocol, as much of it as this needs ---------- */

type Message = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
  sessionId?: string;
};

class Browser {
  socket: WebSocket;
  next = 0;
  waiting = new Map<number, (m: Message) => void>();
  listeners = new Set<(m: Message) => void>();

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(String(event.data)) as Message;
      if (m.id === undefined) for (const listen of this.listeners) listen(m);
      else this.waiting.get(m.id)?.(m);
    });
  }

  send<T = Record<string, unknown>>(
    method: string,
    params: object = {},
    sessionId?: string,
  ): Promise<T> {
    const id = ++this.next;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((done, fail) =>
      this.waiting.set(id, (m) => {
        this.waiting.delete(id);
        if (m.error) fail(new Error(`${method}: ${m.error.message}`));
        else done(m.result as T);
      }),
    );
  }

  /** A tab of its own, in a fresh context: its own storage and cache, so
      a font loaded in one mode is not served from memory in the other. */
  async tab() {
    const { browserContextId } = await this.send<{ browserContextId: string }>(
      'Target.createBrowserContext',
    );
    const { targetId } = await this.send<{ targetId: string }>(
      'Target.createTarget',
      { url: 'about:blank', browserContextId },
    );
    const { sessionId } = await this.send<{ sessionId: string }>(
      'Target.attachToTarget',
      { targetId, flatten: true },
    );
    return new Tab(this, sessionId);
  }
}

class Tab {
  browser: Browser;
  session: string;

  constructor(browser: Browser, session: string) {
    this.browser = browser;
    this.session = session;
  }

  send<T = Record<string, unknown>>(method: string, params: object = {}) {
    return this.browser.send<T>(method, params, this.session);
  }

  event(method: string, timeout = 30_000) {
    return new Promise<void>((done, fail) => {
      const timer = setTimeout(() => {
        this.browser.listeners.delete(listen);
        fail(new Error(`no ${method} in ${timeout / 1000}s`));
      }, timeout);
      const listen = (m: Message) => {
        if (m.sessionId !== this.session || m.method !== method) return;
        clearTimeout(timer);
        this.browser.listeners.delete(listen);
        done();
      };
      this.browser.listeners.add(listen);
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.send<{
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails)
      throw new Error(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      );
    return result.value;
  }

  /** Runs `fn` in the page with `arg`; `fn` must use nothing outside it. */
  run<A, T>(fn: (arg: A) => T, arg: A) {
    return this.evaluate<Awaited<T>>(
      `(${fn.toString()})(${JSON.stringify(arg)})`,
    );
  }

  seeded: string | null = null;

  /** Puts `value` in localStorage under `key` as every page this tab opens
      begins, before the app reads it. Written after a page has loaded, it
      can lose to the app saving what it read a moment before. */
  async seed(key: string, value: string) {
    if (this.seeded)
      await this.send('Page.removeScriptToEvaluateOnNewDocument', {
        identifier: this.seeded,
      });
    const { identifier } = await this.send<{ identifier: string }>(
      'Page.addScriptToEvaluateOnNewDocument',
      {
        source: `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})`,
      },
    );
    this.seeded = identifier;
  }

  async go(url: string) {
    const loaded = this.event('Page.loadEventFired');
    await this.send('Page.navigate', { url });
    await loaded;
  }

  async until(what: string, test: string, timeout = 30_000) {
    const end = Date.now() + timeout;
    while (!(await this.evaluate<boolean>(`!!(${test})`))) {
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(100);
    }
  }

  async screenshot(path: string) {
    const { data } = await this.send<{ data: string }>(
      'Page.captureScreenshot',
      { format: 'png' },
    );
    writeFileSync(path, Buffer.from(data, 'base64'));
  }
}

/* ---------- What is measured, in the page ---------- */

type Selectors = typeof SELECTORS;
/** Each check's complaints: none is a pass, null is not measured here. */
type Findings = Record<Check, string[] | null>;
type Check =
  | 'overflow'
  | 'page'
  | 'spread'
  | 'seats'
  | 'button'
  | 'targets'
  | 'type'
  | 'lines';
const CHECKS: Check[] = [
  'overflow',
  'page',
  'spread',
  'seats',
  'button',
  'targets',
  'type',
  'lines',
];

/** Runs in the page, so it uses nothing from this file. */
function measure({
  sel,
  view,
  text,
}: {
  sel: Selectors;
  view: 'page' | 'circle';
  text: boolean;
}) {
  const px = (n: number) => `${Math.round(n)}px`;
  const box = (r: DOMRect) => `${px(r.width)}×${px(r.height)}`;
  const outside = (inner: DOMRect, outer: DOMRect) =>
    inner.left < outer.left - 1 ||
    inner.right > outer.right + 1 ||
    inner.top < outer.top - 1 ||
    inner.bottom > outer.bottom + 1;
  const found: Record<string, string[] | null> = {
    overflow: [],
    page: null,
    spread: null,
    seats: null,
    button: [],
    targets: null,
    type: null,
    lines: null,
  };
  const shown = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const root = document.documentElement;
  const wide = Math.max(root.scrollWidth, document.body.scrollWidth);
  if (wide > root.clientWidth)
    found.overflow!.push(
      `the document is ${px(wide)} wide in ${px(root.clientWidth)}`,
    );

  if (view === 'page') {
    found.page = [];
    found.spread = [];
    const stage = document.querySelector(sel.stage);
    const pages = [...document.querySelectorAll(sel.pages)].filter(shown);
    if (!stage || !pages.length) found.page.push('no page');
    else {
      const room = stage.getBoundingClientRect();
      for (const page of pages) {
        const p = page.getBoundingClientRect();
        const name = page.getAttribute('aria-label')?.split('،')[0];
        // Too short a room for a page anyone can read: it keeps 220px of
        // width and the room scrolls.
        const floor = p.height > room.height + 1 && p.width <= 221;
        if (floor) {
          if (p.left < room.left - 1 || p.right > room.right + 1)
            found.page.push(`${name} is wider than its room (${box(room)})`);
        } else if (outside(p, room))
          found.page.push(
            `${name} (${box(p)}) is outside its room (${box(room)})`,
          );
      }
      const floored = pages.some(
        (page) => page.getBoundingClientRect().height > room.height + 1,
      );
      if (!floored && stage.scrollHeight > stage.clientHeight + 1)
        found.page.push(
          `the room scrolls (${px(stage.scrollHeight)} in ${px(stage.clientHeight)})`,
        );
      // The spread follows the room's shape, and opens as the Mushaf does.
      const wide = room.width > room.height * 1.2;
      if (pages.length !== (wide ? 2 : 1))
        found.spread.push(`${pages.length} pages in a room of ${box(room)}`);
      if (pages.length === 2) {
        const [a, b] = pages.map((page) => ({
          n: Number(
            (page.getAttribute('aria-label') ?? '')
              .split('،')[0]
              .replace(/[^٠-٩]/g, '')
              .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))),
          ),
          x: page.getBoundingClientRect().left,
        }));
        const right = a.x > b.x ? a : b;
        if (right.n % 2 !== 1)
          found.spread.push(`page ${right.n} is on the right`);
      }
    }
  }

  if (view === 'circle') {
    found.seats = [];
    const room = document
      .querySelector(sel.circleRoom)
      ?.getBoundingClientRect();
    const seats = [...document.querySelectorAll(sel.seat)];
    if (!room || !seats.length) found.seats.push('no circle');
    else
      seats.forEach((seat, i) => {
        // Its avatar, name and status, not the box around them, which is
        // wider than its words; and only what is drawn, since a large
        // circle on a phone hides most seats' names.
        const parts = [...seat.children]
          .filter(shown)
          .map((c) => c.getBoundingClientRect());
        const r = new DOMRect(
          Math.min(...parts.map((b) => b.left)),
          Math.min(...parts.map((b) => b.top)),
          Math.max(...parts.map((b) => b.right)) -
            Math.min(...parts.map((b) => b.left)),
          Math.max(...parts.map((b) => b.bottom)) -
            Math.min(...parts.map((b) => b.top)),
        );
        if (outside(r, room))
          found.seats!.push(
            `seat ${i + 1} (${seat.textContent?.trim()}) is outside the circle's room`,
          );
      });
  }

  const button = document.querySelector<HTMLElement>(sel.primary);
  // Only the menu hides the bars, and this never opens it.
  if (document.querySelector(sel.quiet))
    found.overflow!.push('the bars are hidden');
  measureBars(sel, found);
  if (!button || !shown(button)) found.button!.push('no main button');
  else {
    const { width } = button.getBoundingClientRect();
    if (width < 140) found.button!.push(`the main button is ${px(width)} wide`);
    for (const el of [button, ...button.querySelectorAll<HTMLElement>('*')]) {
      const style = getComputedStyle(el);
      // Inline boxes have no width of their own to overflow, and words
      // kept only for screen readers are absolutely placed out of sight.
      if (
        el.closest('svg') ||
        style.display === 'inline' ||
        style.display === 'none' ||
        style.position === 'absolute'
      )
        continue;
      if (el.scrollWidth > el.clientWidth)
        found.button!.push(
          `«${el.textContent?.trim()}» is cut (${px(el.scrollWidth)} in ${px(el.clientWidth)})`,
        );
    }
  }

  if (view === 'page' && text) {
    found.lines = [];
    const lines = document.querySelector(sel.lines);
    const page = document.querySelector(sel.page);
    if (lines?.getAttribute('data-font') !== 'text')
      found.lines.push('the page is not drawn from its text');
    else
      lines.querySelectorAll<HTMLElement>(sel.lineText).forEach((line, i) => {
        if (line.scrollWidth > line.clientWidth)
          found.lines!.push(
            `line ${i + 1} is ${px(line.scrollWidth)} in ${px(line.clientWidth)}`,
          );
        for (let el: Element | null = line; el; el = el.parentElement) {
          const { overflowX, overflowY } = getComputedStyle(el);
          if (overflowX !== 'visible' || overflowY !== 'visible') {
            found.lines!.push(`line ${i + 1} is clipped by .${el.className}`);
            break;
          }
          if (el === page) break;
        }
      });
  }

  return found;

  /** Every control in the bars a finger can hit, and every word in them a
      reader can read. Declared inside `measure`, which runs in the page. */
  function measureBars(s: Selectors, out: Record<string, string[] | null>) {
    const targets: string[] = [];
    const type: string[] = [];
    for (const bar of document.querySelectorAll(s.bars)) {
      for (const el of bar.querySelectorAll<HTMLElement>('button')) {
        if (!shown(el) || getComputedStyle(el).visibility === 'hidden')
          continue;
        const r = el.getBoundingClientRect();
        if (r.width < 43.5 || r.height < 43.5)
          targets.push(
            `«${el.getAttribute('aria-label') ?? el.textContent?.trim()}» is ${box(r)}`,
          );
      }
      const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement!;
        if (!n.textContent?.trim() || el.closest('.visually-hidden')) continue;
        // Words kept for screen readers alone are clipped to a pixel.
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 13.9) type.push(`«${n.textContent.trim()}» is ${px(size)}`);
      }
    }
    out.targets = targets;
    out.type = type;
  }
}

/* ---------- The run ---------- */

const procs: ChildProcess[] = [];
let profile: string | null = null;
let browser: Browser | null = null;

async function stop() {
  await browser?.send('Browser.close').catch(() => {});
  await sleep(300);
  for (const p of procs)
    try {
      // vite runs under npx, so the whole group goes.
      if (p.pid) process.kill(-p.pid);
    } catch {
      p.kill();
    }
  try {
    if (profile) rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome still closing; the system's temporary folder is cleared anyway.
  }
}

/** `vite preview` on a free port, and the address it says it serves,
    which carries the base path the build was made for. */
async function preview() {
  const port = await freePort();
  const server = spawn(
    'npx',
    [
      'vite',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    // Uncoloured, so the address can be read from what it prints.
    {
      detached: true,
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, NO_COLOR: '1' },
    },
  );
  procs.push(server);
  return new Promise<string>((done, fail) => {
    let out = '';
    const timer = setTimeout(
      () => fail(new Error('vite preview did not start')),
      30_000,
    );
    server.stdout!.on('data', (chunk: Buffer) => {
      out += String(chunk);
      const url = /http:\/\/127\.0\.0\.1:\d+\/\S*/.exec(out)?.[0];
      if (url) {
        clearTimeout(timer);
        done(url);
      }
    });
    server.once('exit', () => fail(new Error('vite preview exited')));
  });
}

async function chrome() {
  const port = await freePort();
  profile = mkdtempSync(join(tmpdir(), 'majlis-noor-layout-'));
  const proc = spawn(
    process.env.CHROME ??
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' },
  );
  procs.push(proc);
  for (let i = 0; i < 150; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const { webSocketDebuggerUrl } = (await res.json()) as {
        webSocketDebuggerUrl: string;
      };
      const socket = new WebSocket(webSocketDebuggerUrl);
      await new Promise((done, fail) => {
        socket.addEventListener('open', done);
        socket.addEventListener('error', fail);
      });
      return new Browser(socket);
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Chrome did not open its debugging port');
}

type Row = {
  size: string;
  turn: string;
  view: 'page' | 'circle';
  font: string;
  found: Findings;
  /** Why nothing could be measured, if so. */
  error?: string;
};

async function main() {
  if (build) execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  if (shots) mkdirSync(shots, { recursive: true });
  const url = await preview();
  browser = await chrome();
  const rows: Row[] = [];

  for (const text of [false, true]) {
    const tab = await browser.tab();
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    await tab.send('Network.enable');
    // The service worker would answer for the network, blocked or not.
    await tab.send('Network.setBypassServiceWorker', { bypass: true });
    if (text) await tab.send('Network.setBlockedURLs', { urls: [FONT_HOST] });
    // Transitions stilled, so what is measured is where things end up.
    await tab.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });

    for (const [width, height] of SIZES)
      for (const { name, turn, seats } of TURNS) {
        const size = `${width}×${height}`;
        const label = `${size} ${name}${text ? ' text' : ''}`;
        try {
          await tab.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false,
          });
          await tab.seed(STORAGE_KEY, JSON.stringify(halaqa(turn, seats)));
          await tab.go(url);
          await tab.until(
            'the start screen',
            `document.querySelector('${SELECTORS.resume}')`,
          );
          await tab.evaluate(
            `document.querySelector('${SELECTORS.resume}').click()`,
          );
          await tab.until(
            'the page',
            `document.querySelector('${SELECTORS.lines}')`,
          );
          await tab.evaluate('document.fonts.ready.then(() => true)');
          await sleep(400);
          const font = await tab.evaluate<string>(
            `document.querySelector('${SELECTORS.lines}').dataset.font`,
          );
          // The page is named in Arabic digits: a different one means the
          // halaqa was not the one seeded, and nothing here would count.
          const expected = `الصفحة ${arabic(FIRST_PAGE + turn)}،`;
          const named = await tab.evaluate<string>(
            `document.querySelector('${SELECTORS.page}').getAttribute('aria-label')`,
          );
          if (!named.includes(expected))
            throw new Error(`opened «${named}», not «${expected}»`);
          const views: ('page' | 'circle')[] = text
            ? ['page']
            : ['page', 'circle'];
          for (const view of views) {
            if (view === 'circle') {
              await tab.evaluate(
                `document.querySelector('${SELECTORS.toggle}').click()`,
              );
              await tab.until(
                'the circle',
                `document.querySelector('${SELECTORS.seat}')`,
              );
              await sleep(300);
            }
            const found = (await tab.run(measure, {
              sel: SELECTORS,
              view,
              text,
            })) as Findings;
            rows.push({ size, turn: name, view, font, found });
            if (shots)
              await tab.screenshot(
                join(
                  shots,
                  `${width}x${height}-${name}-${view}${text ? '-text' : ''}.png`,
                ),
              );
          }
        } catch (error) {
          rows.push({
            size,
            turn: name,
            view: 'page',
            font: '?',
            found: Object.fromEntries(CHECKS.map((c) => [c, null])) as Findings,
            error: `${label}: ${(error as Error).message}`,
          });
        }
      }
  }
  return rows;
}

function report(rows: Row[]) {
  const cell = (r: Row, f: string[] | null) =>
    r.error ? 'ERROR' : f === null ? '–' : f.length ? 'FAIL' : 'ok';
  const head = ['size', 'turn', 'view', 'font', ...CHECKS];
  const body = rows.map((r) => [
    r.size,
    r.turn,
    r.view,
    r.font,
    ...CHECKS.map((c) => cell(r, r.found[c])),
  ]);
  const widths = head.map((h, i) =>
    Math.max(h.length, ...body.map((row) => row[i].length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(
    `\n${line(head)}\n${widths.map((w) => '─'.repeat(w)).join('  ')}`,
  );
  for (const row of body) console.log(line(row));

  const failures = rows.flatMap((r) =>
    r.error
      ? [r.error]
      : CHECKS.flatMap((c) =>
          (r.found[c] ?? []).map(
            (f) => `${r.size} ${r.turn} ${r.view} (${r.font}) ${c}: ${f}`,
          ),
        ),
  );
  if (failures.length) console.log(`\n${failures.join('\n')}`);
  console.log(
    `\n${rows.length} screens measured, ${failures.length ? `${failures.length} failures` : 'all whole'}.`,
  );
  if (shots) console.log(`Screenshots in ${shots}`);
  return failures.length === 0;
}

let ok = false;
try {
  ok = report(await main());
} catch (error) {
  console.error(error);
} finally {
  await stop();
}
process.exit(ok ? 0 : 1);
