import './styles.css'
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'

const pages = import.meta.glob('./pages/**/*.tsx')

// The server template's static <title> lacks Inertia's `inertia` marker, so it
// would shadow every <Head title>. Remove it before Inertia manages the head.
document.head.querySelector('title:not([inertia])')?.remove()

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
