import { defineConfig } from 'vite'

// On GitHub Actions (GitHub Pages) the app lives at /project-titles/.
// On Vercel (and local dev) it lives at the root /.
const base = process.env.GITHUB_ACTIONS ? '/project-titles/' : '/'

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
  },
})
