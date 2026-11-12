import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import vercel from './vercel.json';

// `vite preview` (and so the browser checks in e2e/) serves the same security headers as the live site (vercel.json),
// so a change the Content-Security-Policy would block fails a check before it ships. HSTS is left out: preview is plain http.
const siteHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? []).filter((h) => h.key !== 'Strict-Transport-Security').map((h) => [h.key, h.value]),
);

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'brain/*.json'] },
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
