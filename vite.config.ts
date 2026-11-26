import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app with the shell saved on the device, so it opens offline.
    // AI requests are never cached: they always go through the router.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt', 'sitemap.xml'],
      manifest: {
        name: 'Hybrid Study',
        short_name: 'Hybrid Study',
        description: 'Summaries, quizzes and timed exams from your lecture PDFs, with AI that runs on your laptop when it can.',
        theme_color: '#182848',
        background_color: '#e7eae9',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Fonts as woff2 only (what Chrome uses); the PDF engine's worker is an .mjs file.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
