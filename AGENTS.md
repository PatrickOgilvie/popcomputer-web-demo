# For coding agents

This application is built on `@popcomputer/web`. Follow
`node_modules/@popcomputer/web/AGENTS.md`: its rules name the one API for each
task, and its docs (`node_modules/@popcomputer/web/docs/`, one short file per
task, which `docs/which-api.md` indexes) show each in full. Where this file and
those rules differ, the rules win.

## Where things are declared

Each is declared once, and everything else derives from it:

- `src/paths.ts`: every URL. Build links with `href(paths.x, params)`.
- `src/schema.ts`: the D1 tables (`src/auth-schema.ts` holds Better Auth's).
- `src/forms.ts`: the schemas forms are validated with, which type the forms
  in React too (`FormInput<typeof ProjectForm>`).
- `src/pages.ts`: each page's props, taken from the tables' columns.
- `src/env.ts`: the Worker's vars and secrets, each with its schema; the
  bindings type derives from it.
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

The projects pages are an example to copy and learn from: a list, a form
that creates, a page that shows, edits and deletes one, and a public page.
Build what the user asks for beside them the same way, and remove them when
the user no longer wants them.

A route that reads a record names it in its path (`/projects/{project}`)
and reads it with `bound('project')`. Add its table to `bindings` in
`src/app.ts` with who may load it, and never check that in the action:
`routeBinding(schema.projects, { ownedBy: 'userId' })` for the signed-in
member's own records, whose others are the 404 a missing record is;
`{ publicWhen: { visibility: 'public' } }` for a page anyone may see, under
a binding of its own (`publicProject` shows the table bound twice);
`{ public: true }` for any record, to anyone. A record that lives inside
another, such as a task in a project, goes under it in the path
(`/projects/{project}/tasks/{task}`) and says
`{ scope: { project: { foreignKey: 'projectId' } } }`, so it loads only under
its project and the project's binding decides. The lint rule
`require-binding-access` reports a binding that doesn't say.

## Changing the database

Edit `src/schema.ts`, then run `bun run db:generate` for a new migration in
`migrations/`, and `bun run db:migrate:local` to apply it locally; restarting
the app with `bun run stop` and `bun run dev` applies it too, since `bun run dev`
applies new migrations as it starts. Never edit
a migration that has been applied. Tests migrate each test's own D1 database
from `migrations/`.

`bun run db:seed` deletes the local database's data, migrates a new one and
runs `src/seed.ts`, whose member signs in as `ada@example.com` with the
password `at least twelve characters`; keep the seed working when the schema
changes, as `bun run check` type-checks it. `bun run db:reset` empties the
local database. Both delete data, so without a terminal they stop and ask
for `--yes`: pass it only when the user asked for the reset, and run
`bun run stop` first if `bun run dev` is running.

`bun run db:execute "SQL"` runs one statement on the local database and
prints its result as JSON. With `--remote` it runs on the live app's
database on Cloudflare; a statement that could change data there stops and
asks for `--yes`, which you pass only once the user has said to run that
statement on the live data.

`preview_database_id: "local"` in `wrangler.jsonc` names the local database,
so its data survives the first deploy writing `database_id`; leave it. It
makes wrangler label remote D1 runs "preview database", though they run on
the live one.

## Adding a var or a secret

1. Declare it in `src/env.ts`: `secret(schema)` for a secret, with
   `{ generate: randomSecret }` when the app can make its own value;
   `variable(schema)` for a plain var; `{ optional: true }` when the app runs
   without it. Read it with `config.string('NAME')` or
   `config.redacted('NAME')`.
2. A var goes in `vars` in `wrangler.jsonc`. Never put a secret there.
3. A secret goes in `.dev.vars` (`NAME=value`) for `bun run dev`, as a
   placeholder line in `.dev.vars.example`, and in `test/app.ts`'s bindings.
   Ask the user for a value nothing generates; never invent one.
4. On Cloudflare, `bun run secret NAME` sets it, with the value piped in
   (`printf %s "$VALUE" | bun run secret NAME`), checked against its schema
   first. `bun run deploy` uploads a generated one itself.

`bun run env:check` checks `.dev.vars` and the vars, and
`bun run env:check --remote` checks the secrets on Cloudflare, by name.

## Deploying

Deploy only when asked, with `bun run deploy`: it does everything, and is
safe to run again. It stops, saying why, when `src/schema.ts` has a change
with no migration (run `bun run db:generate`), when Wrangler isn't signed in
to Cloudflare (`bun run cloudflare:login` opens the user's browser to allow
it), or when the Worker lacks a secret `src/env.ts` needs that nothing
generates (`bun run secret NAME`, with the user's value). It uploads the new
version beside the live one, and makes it live only once its `/login`
answers 200 at the version's own address; it ends by printing the app's
address. When the check fails, the live version is unchanged and the output
names the address and what it answered: fetch that address to see the
error, fix it, and deploy again.

`bun run preview`, also only when asked, uploads a version that takes no
traffic and prints its address to share; it runs on the live database and
secrets, so say so to whoever it's shared with. `bun run status` says which version is live and
which migrations each database hasn't had. Each prints a sentence naming
the next command when it stops, and exits 1.

To see what the live app is doing, run `bun run logs` in the background:
it prints each request, its `console.log` lines and any error, as JSON without
a terminal, until stopped; requests to a preview's address don't show there.
To undo a deploy, `bun run rollback` puts the one before back, without asking
when there's no terminal; the database keeps its migrations.

`.github/workflows/check.yml` runs `bun run check` on GitHub, and
`.github/workflows/deploy.yml` runs `bun run deploy` for each push to `main`
once the repository has the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` secrets; the README's "Deploying from GitHub" says
how the user adds them.

## Before finishing

Run `bun run check`: the type check, the framework's lint rules and the
tests. Fix what they report rather than disabling a rule.
