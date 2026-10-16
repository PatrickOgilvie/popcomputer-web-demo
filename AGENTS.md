# For coding agents

This application is built on `@popcomputer/web`. Follow
`node_modules/@popcomputer/web/AGENTS.md`: its rules name the one API for each
task, and its README (`node_modules/@popcomputer/web/README.md`) shows each
in full. Where this file and those rules differ, the rules win.

## Where things are declared

Each is declared once, and everything else derives from it:

- `src/paths.ts`: every URL. Build links with `href(paths.x, params)`.
- `src/schema.ts`: the D1 tables (`src/auth-schema.ts` holds Better Auth's).
- `src/forms.ts`: the schemas forms are validated with, which type the forms
  in React too (`FormInput<typeof ProjectForm>`).
- `src/pages.ts`: each page's props, taken from the tables' columns.
- `src/app.ts`: `setupWeb`, which owns rendering, D1, auth and route binding.
- `src/routes.ts`: every route, with the action that answers it.
- `src/actions/`: the actions. `src/pages/`: the React pages, each listed in
  `src/main.tsx`.

## Adding a page

1. Declare its path in `src/paths.ts`.
2. Declare its props in `src/pages.ts`.
3. Declare its form's fields, if it has a form, in `src/forms.ts`.
4. Write its action in `src/actions/`, and register it in `src/routes.ts`
   (behind `RequireAuthLayer` when it needs a signed-in member).
5. Write the component in `src/pages/`, typed `WebPage<'Name'>`, and add it
   to `components` in `src/main.tsx`; a page without one is a type error.
6. Test it in `test/` through the app, as the tests there do.

A route that reads a record names it in its path (`/projects/{project}`)
and reads it with `bound('project')`, after `authorize()`; add the table to
`bindings` in `src/app.ts`. Another member's record answers `notFound`.

## Changing the database

Edit `src/schema.ts`, then run `bun run db:generate` for a new migration in
`migrations/`, and `bun run db:migrate:local` to apply it locally; restarting
the app with `bun run stop` and `bun run dev` applies it too, since `bun run dev`
applies new migrations as it starts. Never edit
a migration that has been applied. Tests migrate each test's own D1 database
from `migrations/`.

## Deploying

Deploy only when asked, with `bun run deploy`: it does everything, and is
safe to run again. It stops, saying why, when `src/schema.ts` has a change
with no migration (run `bun run db:generate`) or when Wrangler isn't signed in
to Cloudflare (`bun run cloudflare:login` opens the user's browser to allow
it). It ends by printing the app's address.

To see what the deployed app is doing, run `bun run logs` in the background:
it prints each request, its `console.log` lines and any error, as JSON without
a terminal, until stopped. To undo a deploy, `bun run rollback` puts the one
before back, without asking when there's no terminal; the database keeps its
migrations.

## Before finishing

Run `bun run check`: the type check, the framework's lint rules and the
tests. Fix what they report rather than disabling a rule.
