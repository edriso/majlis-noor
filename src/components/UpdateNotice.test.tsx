import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* A new version of the app installs in the background and waits. The start
   screen says so and offers to switch; the reading screen never does. The
   browser's service worker API is faked here, since jsdom has none. */

class FakeWorker extends EventTarget {
  postMessage = vi.fn();
  constructor(public state: ServiceWorkerState) {
    super();
  }
  become(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
}

class FakeContainer extends EventTarget {
  controller: object | null = {};
  registration = new FakeRegistration();
  register = vi.fn(() => Promise.resolve(this.registration));
}

let container: FakeContainer;

/** The app and the hook as a fresh page load has them: the hook's state
    lives in its module, so each test imports both anew. */
const load = async () => {
  vi.resetModules();
  const hook = await import('@/hooks/useServiceWorker');
  const { App } = await import('@/App');
  return { ...hook, App };
};

const NOTICE = 'نسخة جديدة من التطبيق جاهزة';
const button = () => screen.queryByRole('button', { name: 'حدِّث الآن' });

beforeEach(() => {
  container = new FakeContainer();
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  });
  vi.stubEnv('PROD', true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('a new version of the app', () => {
  it('is offered on the start screen, and never while reading', async () => {
    container.registration.waiting = new FakeWorker('installed');
    const { registerServiceWorker, App } = await load();
    registerServiceWorker();
    render(<App />);
    expect(await screen.findByText(NOTICE)).toBeTruthy();
    expect(container.register).toHaveBeenCalledWith('/sw.js');
    expect(button()).toBeTruthy();
    // The notice is a status, read out without taking focus.
    expect(screen.getByText(NOTICE).closest('output')).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /ابدأ الحلقة/ }));
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(button()).toBeNull();
  });

  it('is offered as soon as it finishes installing', async () => {
    const { registerServiceWorker, App } = await load();
    registerServiceWorker();
    render(<App />);
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
    const worker = new FakeWorker('installing');
    container.registration.installing = worker;
    await act(async () => {
      container.registration.dispatchEvent(new Event('updatefound'));
      await Promise.resolve();
    });
    expect(screen.queryByText(NOTICE)).toBeNull();
    act(() => worker.become('installed'));
    expect(screen.getByText(NOTICE)).toBeTruthy();
    // Taken over from another tab: nothing is waiting any more.
    act(() => worker.become('activated'));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('is not offered on a first visit, when nothing was in charge', async () => {
    container.controller = null;
    container.registration.waiting = new FakeWorker('installed');
    const { registerServiceWorker, App } = await load();
    registerServiceWorker();
    render(<App />);
    await vi.waitFor(() => expect(container.register).toHaveBeenCalled());
    await act(() => Promise.resolve());
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('takes over when asked, and reloads the page once it has', async () => {
    const worker = new FakeWorker('installed');
    container.registration.waiting = worker;
    const { registerServiceWorker, applyUpdate, App } = await load();
    registerServiceWorker();
    render(<App />);
    await screen.findByText(NOTICE);

    await userEvent.setup().click(button()!);
    expect(worker.postMessage).toHaveBeenCalledWith('skip-waiting');

    const reload = vi.fn();
    applyUpdate(reload);
    expect(reload).not.toHaveBeenCalled();
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is not looked for in development', async () => {
    vi.stubEnv('PROD', false);
    const { registerServiceWorker } = await load();
    registerServiceWorker();
    await act(() => Promise.resolve());
    expect(container.register).not.toHaveBeenCalled();
  });
});
