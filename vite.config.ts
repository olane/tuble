import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GitHub Pages has no SPA fallback, so client-side routes like /test and
 * /gallery would 404. Copying index.html to 404.html means GH Pages serves
 * the same app shell for any unknown path, and our pathname-based router
 * picks up from there.
 */
function githubPagesSpaFallback(): PluginOption {
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    closeBundle() {
      const out = this.environment?.config.build.outDir ?? 'dist'
      const indexPath = resolve(out, 'index.html')
      const notFoundPath = resolve(out, '404.html')
      copyFileSync(indexPath, notFoundPath)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), githubPagesSpaFallback()],
})
