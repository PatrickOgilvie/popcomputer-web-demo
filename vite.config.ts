import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { '~': resolve(import.meta.dirname, 'src') },
  },
  // `bun run dev` serves the pages from here while wrangler serves the Worker.
  server: { cors: true },
  build: {
    // The Worker's page shell reads the bundle's files from the manifest.
    manifest: 'manifest.json',
    outDir: 'dist',
    rollupOptions: { input: 'src/main.tsx' },
  },
})
