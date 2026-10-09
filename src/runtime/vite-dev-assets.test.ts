import { describe, expect, test } from 'bun:test'

import { viteDevAssets } from './vite-dev-assets'

describe('Vite development assets', () => {
  test('loads the entry, refresh runtime, and client from the Vite origin', () => {
    const assets = viteDevAssets(
      new URL('https://vite.popcomputer-web-demo.localhost')
    )

    expect(assets.scripts).toEqual([
      'https://vite.popcomputer-web-demo.localhost/src/main.tsx',
    ])
    expect(assets.head).toContain(
      "import RefreshRuntime from 'https://vite.popcomputer-web-demo.localhost/@react-refresh'"
    )
    expect(assets.head).toContain(
      'src="https://vite.popcomputer-web-demo.localhost/@vite/client"'
    )
  })

  test('preserves an explicit proxy port', () => {
    const assets = viteDevAssets(new URL('http://localhost:5173'))

    expect(assets.scripts).toEqual(['http://localhost:5173/src/main.tsx'])
    expect(assets.head).toContain('http://localhost:5173/@vite/client')
  })
})
