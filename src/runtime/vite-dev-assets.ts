/** Template inputs that load the client entry from a running Vite server. */
export interface ViteDevAssets {
  readonly scripts: ReadonlyArray<string>
  readonly head: string
}

/**
 * Builds Vite development tags for an exact dev-server origin. The framework's
 * `vite` helpers only address `http://localhost:<port>`; portless serves Vite
 * from a named, possibly HTTPS, `*.localhost` origin instead.
 */
export function viteDevAssets(
  origin: URL,
  entry = '/src/main.tsx'
): ViteDevAssets {
  const asset = (path: string) => new URL(path, origin).href

  return {
    scripts: [asset(entry)],
    head: `
      <script type="module">
        import RefreshRuntime from '${asset('/@react-refresh')}'
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
      </script>
      <script type="module" src="${asset('/@vite/client')}"></script>
    `,
  }
}
