import { sweepSignInFailures } from '@popcomputer/web/auth'
import { app, routes } from './app'
import './routes'

export default {
  fetch: app.fetch,
  // The daily Cron Trigger wrangler.jsonc declares.
  scheduled: routes.scheduled(() => sweepSignInFailures),
}
