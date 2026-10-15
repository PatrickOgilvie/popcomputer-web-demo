import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { readViteDevServerConfiguration } from './scripts/dev-environment'

// `bun run dev` supplies both origins; portless supplies --port and --host.
const devServer = readViteDevServerConfiguration()

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { '~': resolve(import.meta.dirname, 'src') },
  },
  // `bun run dev` serves the pages from here while wrangler serves the Worker,
  // and only the Worker's own origin may load them.
  server:
    devServer === undefined
      ? {}
      : { cors: { origin: devServer.workerOrigin }, origin: devServer.viteOrigin },
  build: {
    // The Worker's page shell reads the bundle's files from the manifest.
    manifest: 'manifest.json',
    outDir: 'dist',
    rollupOptions: { input: 'src/main.tsx' },
  },
})
