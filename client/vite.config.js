import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [react(), tailwindcss(), seoFilesPlugin(env.VITE_SITE_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://localhost:5173'))],
  server: {
    port: 5173,
  },
  }
})
