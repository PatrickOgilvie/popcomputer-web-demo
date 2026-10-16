import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, isPreview }) => ({
  plugins: [
    tailwindcss(),
    react(),
    // Runs the Worker inside Vite's dev server, so the pages and their scripts
    // share one address. Only the dev server runs it in development; a build
    // keeps wrangler.jsonc's production vars.
    cloudflare(
      command === 'serve' && isPreview !== true
        ? { config: (worker) => ({ vars: { ...worker.vars, ENVIRONMENT: 'development' } }) }
        : {}
    ),
  ],
  resolve: {
    alias: { '~': resolve(import.meta.dirname, 'src') },
  },
  environments: {
    client: {
      build: {
        // The Worker's page shell reads the bundle's files from the manifest.
        manifest: 'manifest.json',
        // React, Inertia and the framework's client come to about 600 kB before
        // an app adds anything, past Vite's 500 kB warning.
        chunkSizeWarningLimit: 1000,
        rollupOptions: { input: 'src/main.tsx' },
      },
    },
  },
  builder: {
    // The client first, so the Worker's build can import the client's manifest.
    async buildApp(builder) {
      const { client, ...workers } = builder.environments
      if (client !== undefined) await builder.build(client)
      for (const worker of Object.values(workers)) await builder.build(worker)
    },
  },
}))
