import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely: their own files stay cached across app updates.
        manualChunks: (id) =>
          id.includes('node_modules/@supabase') ? 'supabase' : id.includes('node_modules/react') || id.includes('node_modules/scheduler') ? 'react' : id.includes('node_modules/dexie') ? 'dexie' : undefined,
      },
    },
  },
  test: { environment: 'node', exclude: ['e2e/**', 'node_modules/**'] },
});
