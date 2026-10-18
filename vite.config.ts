/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
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
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
