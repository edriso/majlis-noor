import { useSyncExternalStore } from 'react';

/* The service worker (public/sw.js) keeps the app on the device. A new
   version of it installs in the background and waits, so a sitting is never
   switched to new files under its feet; this is how the page learns that one
   is waiting, and how it hands over when the reader agrees. */

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

const offer = (worker: ServiceWorker | null) => {
  waiting = worker;
  for (const listener of listeners) listener();
};

/** Watches a registration for a worker that installs while another is in
    charge. The first worker of all takes charge at once, so it is no
    update; nor is a worker that stopped waiting (it took over, or a newer
    one replaced it). */
function watch(registration: ServiceWorkerRegistration) {
  const consider = (worker: ServiceWorker | null) => {
    if (!worker || !navigator.serviceWorker.controller) return;
    if (worker.state === 'installed') offer(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker);
      else if (waiting === worker) offer(null);
    });
  };
  // The browser checks for a new worker as the page opens, so one may be
  // installing, or done, before this runs.
  consider(registration.waiting);
  consider(registration.installing);
  registration.addEventListener('updatefound', () =>
    consider(registration.installing),
  );
}

/**
 * Registers the service worker once the page has loaded, so it never
 * competes with the first visit for the connection. Production only: in
 * development it would serve stale modules.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () =>
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(watch)
      .catch(() => {});
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

/** Lets the waiting worker take over, then reloads once, so the page and
    the files it asks for come from the same version. */
export function applyUpdate(reload = () => window.location.reload()) {
  const worker = waiting;
  if (!worker) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    reload();
  });
  worker.postMessage('skip-waiting');
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether a new version of the app is installed and waiting, and the
    function that switches to it. */
export function useServiceWorker() {
  const updateWaiting = useSyncExternalStore(
    subscribe,
    () => waiting !== null,
    () => false,
  );
  return { updateWaiting, applyUpdate };
}
