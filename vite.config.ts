import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import vercel from './vercel.json';

// `vite preview` (and so the browser checks in e2e/) serves the same security headers as the live site (vercel.json),
// so a change the Content-Security-Policy would block fails a check before it ships. HSTS is left out: preview is plain http.
const siteHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? []).filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value]),
);

// Card pictures are fetched by the service worker with CORS, so what it keeps is a normal picture it can measure and
// cap (a plain <img> request would store an "opaque" copy that browsers count as ~7 MB each). If Scryfall ever refused
// CORS, the picture is fetched the old way and simply not kept: nothing on screen changes.
const PICS = 'ch-pics';
const PICS_BIG = 'ch-pics-big';
const PICS_ART = 'ch-pics-art';
const SYMBOLS = 'ch-symbols';
const corsPics = {
  requestWillFetch: async ({ request }: { request: Request }) => new Request(request.url, { mode: 'cors', credentials: 'omit' }),
  handlerDidError: async ({ request }: { request: Request }) => fetch(request).catch(() => Response.error()),
};
// Small pictures of your deck cards are saved ahead of time into their own cache (src/lib/offlinepics.ts): look there too.
const ownedFirst = {
  cachedResponseWillBeUsed: async ({ request, cachedResponse }: { request: Request; cachedResponse?: Response }) =>
    cachedResponse ?? (await (await caches.open('ch-pics-owned')).match(request.url)) ?? null,
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'brain/*.json'],
        // Card pictures (Phase 5B): every picture you have seen is kept on this device, so it shows offline and is never
        // downloaded twice. Capped, oldest seen goes first (sizes measured Nov 20: small 16 KB, art crop 120 KB, full
        // size 165 KB): small 2,500 (~40 MB), art crops 150 (~18 MB), full size 150 (~25 MB), symbols 600 (~2 MB).
        // With the deck cards saved ahead on Wi-Fi (up to 1,000, ~16 MB: src/lib/offlinepics.ts) that is ~100 MB at
        // most (Guillermo, Nov 21: keep the app light; it was ~250 MB).
        runtimeCaching: [
          { urlPattern: /^https:\/\/cards\.scryfall\.io\/small\//, handler: 'CacheFirst', options: { cacheName: PICS, plugins: [corsPics, ownedFirst], expiration: { maxEntries: 2500, maxAgeSeconds: 180 * 86400, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /^https:\/\/cards\.scryfall\.io\/art_crop\//, handler: 'CacheFirst', options: { cacheName: PICS_ART, plugins: [corsPics], expiration: { maxEntries: 150, maxAgeSeconds: 180 * 86400, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /^https:\/\/cards\.scryfall\.io\//, handler: 'CacheFirst', options: { cacheName: PICS_BIG, plugins: [corsPics], expiration: { maxEntries: 150, maxAgeSeconds: 180 * 86400, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } } },
          { urlPattern: /^https:\/\/svgs\.scryfall\.io\//, handler: 'CacheFirst', options: { cacheName: SYMBOLS, plugins: [corsPics], expiration: { maxEntries: 600, maxAgeSeconds: 60 * 86400, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } } },
        ],
      },
      manifest: {
        name: 'DeckMage',
        short_name: 'DeckMage',
        description: 'Your MTG collections, compared with EDHREC commander data.',
        theme_color: '#1b1f2a',
        background_color: '#1b1f2a',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  preview: { headers: siteHeaders },
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely: their own files stay cached across app updates.
        manualChunks: (id) =>
          id.includes('node_modules/@supabase') ? 'supabase' : id.includes('node_modules/react') || id.includes('node_modules/scheduler') ? 'react' : id.includes('node_modules/dexie') ? 'dexie' : undefined,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'worker/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'reference/**', 'legacy/**'],
  },
});
