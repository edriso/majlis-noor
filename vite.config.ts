/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { configDefaults } from 'vitest/config';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { injectPrecache, precacheManifest } from './scripts/precache.ts';
import { themeHtml } from './src/styles/themes.ts';

/* The site is served from a project path on GitHub Pages and could be served
   from a domain root or a mirror, so nothing may assume where it lives. The
   workflow sets VITE_BASE_PATH from `actions/configure-pages`. */
const base = process.env.VITE_BASE_PATH || '/';

/* A link scraper is not a browser and will not resolve a relative address,
   so the share card is made absolute wherever the build knows its address.
   VITE_SITE_URL also comes from `configure-pages`, so a fork gets a card of
   its own with nothing configured; unset, as in a local build, it stays
   relative. */
const siteUrl = process.env.VITE_SITE_URL?.trim();
const shareCard = siteUrl
  ? new URL('og.png', siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`).href
  : `${base}og.png`;
const TOKEN = '%SHARE_CARD%';

/* The service worker installs every file the app needs to open and read
   offline, so it must be told which files a build made. Once the site is
   written out, public files included, the list is written into the built
   sw.js (see scripts/precache.ts); a worker with no placeholder for it
   fails the build. */
const precache = (): Plugin => {
  let outDir = '';
  return {
    name: 'precache-list',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const sw = join(outDir, 'sw.js');
      writeFileSync(
        sw,
        injectPrecache(readFileSync(sw, 'utf8'), precacheManifest(outDir)),
      );
    },
  };
};

export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: 'share-card-address',
      transformIndexHtml(html: string) {
        if (!html.includes(TOKEN))
          throw new Error(
            `index.html no longer contains ${TOKEN}, so the share card would ship with no address.`,
          );
        return html.replaceAll(TOKEN, shareCard);
      },
    },
    {
      /* The boot screen is painted before the bundle loads, so index.html
         cannot import the theme colours; it is given them here, from the
         same map the app reads. First, before Vite reads the inline style
         as CSS, which a token is not. */
      name: 'theme-colours',
      transformIndexHtml: { order: 'pre', handler: themeHtml },
    },
    precache(),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // Agents' worktrees are whole copies of the repository, tests and all.
    exclude: [...configDefaults.exclude, '.claude/**'],
    // The app's tests drive whole screens, and a shared CI runner is slower
    // than a laptop: five seconds is too tight for them there.
    testTimeout: 15_000,
  },
});
