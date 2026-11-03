import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//, /^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
});
