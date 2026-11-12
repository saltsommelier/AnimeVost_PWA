import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * AnimeVost PWA (PLAN.md §9). Manifest + service worker через vite-plugin-pwa.
 * Офлайн-оболочка кэшируется, API/видео — НЕ кэшируются.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'AnimeVost',
        short_name: 'AnimeVost',
        description: 'Смотритель аниме с animevost.org',
        lang: 'ru',
        start_url: '/',
        display: 'standalone',
        background_color: '#0B0B0F',
        theme_color: '#0B0B0F',
        orientation: 'any',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app-shell: пре-кэш собранных ассетов; runtime-кэш — постеры
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/animevost\.org\/uploads\/posts\//i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'posters',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
