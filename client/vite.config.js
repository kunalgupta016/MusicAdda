import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

function seoFilesPlugin(siteUrl) {
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, '')
  return {
    name: 'musicadda-seo-files',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\nDisallow: /room/\n\nSitemap: ${normalizedSiteUrl}/sitemap.xml\n`,
      })
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${normalizedSiteUrl}/</loc>\n  </url>\n</urlset>\n`,
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  plugins: [
    react(),
    tailwindcss(),
    seoFilesPlugin(env.VITE_SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://localhost:5173')),
    VitePWA({
      // autoUpdate: a new deploy's service worker takes over as soon as the
      // user's tab next loads/regains focus, instead of them getting stuck
      // on stale cached JS that could drift out of sync with the live
      // socket protocol — important for a real-time app like this one.
      registerType: 'autoUpdate',
      // Don't intercept Socket.io's own requests — this app's real-time
      // state must always hit the network, never come from a cache.
      workbox: {
        navigateFallbackDenylist: [/^\/socket\.io\//],
        runtimeCaching: [
          {
            urlPattern: /\/socket\.io\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: 'musicAdda',
        short_name: 'musicAdda',
        description: 'Listen to YouTube together, perfectly in sync — like everyone is at the same chai tapri.',
        start_url: '/',
        display: 'standalone',
        background_color: '#f3e4c2',
        theme_color: '#c1440e',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '500x500', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  }
})
