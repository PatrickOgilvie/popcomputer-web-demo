import { name } from '../package.json'

/**
 * The app's name in the browser's tab. `bun create` names the package after
 * the app's folder, so an app made as `reading-list` reads "Reading list".
 */
export const appTitle =
  name === 'popcomputer-web-demo'
    ? 'popcomputer/web demo'
    : name.replace(/[-_]+/g, ' ').replace(/^./, (first) => first.toUpperCase())
