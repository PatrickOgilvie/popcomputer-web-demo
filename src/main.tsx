import './styles.css'
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'

const pages = import.meta.glob('./pages/**/*.tsx')

createInertiaApp({
  title: (title) =>
    title ? `${title} · popcomputer/web demo` : 'popcomputer/web demo',
  defaults: {
    future: {
      useScriptElementForInitialPage: true,
    },
  },
  resolve: (name) => {
    const page = pages[`./pages/${name}.tsx`]
    if (!page) {
      throw new Error(`Page not found: ${name}`)
    }
    return page()
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />)
  },
})
