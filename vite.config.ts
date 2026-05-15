import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SmartReceipt',
        short_name: 'SmartReceipt',
        description: 'Scan receipts, track spending, stay on budget',
        theme_color: '#3B82F6',
        background_color: '#F9FAFB',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon.svg',     sizes: 'any',     type: 'image/svg+xml' },
        ],
      },
    }),
  ],
});
