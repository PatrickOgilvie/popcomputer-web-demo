import type { MiddlewareHandler } from 'hono'

/**
 * Prevents dynamic Worker responses, including errors, from being cached.
 * A response that already carries a cache policy keeps it: @popcomputer/web
 * marks the static pages its page cache serves, and signed-in responses.
 */
export const noStoreResponse: MiddlewareHandler = async (context, next) => {
  await next()

  if (!context.res.headers.has('Cache-Control')) {
    context.header('Cache-Control', 'no-store')
  }
}
