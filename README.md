# popcomputer-web-demo

A Cloudflare Workers demo for [@popcomputer/web](https://github.com/PatrickOgilvie/popcomputer-web), the Effect-powered, Inertia-style web adapter for Hono. This repository follows the upstream rename from Honertia to `@popcomputer/web` and demonstrates server-driven React pages, D1 persistence, and Better Auth.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PatrickOgilvie/popcomputer-web-demo)

## Version baseline

The demo pins its framework and Effect versions exactly:

- `@popcomputer/web@0.6.0`, the first release on stable Effect 4
- `effect@4.0.2`

Exact pins keep the demo on a tested pair. When upgrading, move both together
and run `bun run verify`; the OpenAPI check catches changes in how Effect
generates JSON Schema.

## What the demo shows

### Server-driven React on Workers

Hono owns routing on the Worker, `@popcomputer/web` renders Inertia responses, and React handles client-side navigation. Application workflows use Effect v4 services, layers, schemas, typed failures, and named `Effect.fn` operations. The app also enables origin verification and observes Effect failures through a safe, structured error hook.

### Projects CRUD with explicit boundaries

Authenticated users can create, list, view, edit, and delete projects stored in D1. The feature demonstrates several framework capabilities together:

- Effect Schema domain and command models, including UUID, length, and visibility constraints
- authorization-first, 8 KiB-bounded body parsing with `onExcessProperty: 'error'` to reject undeclared fields; JSON validation failures consistently return 422
- an application-owned `Projects` service whose HTTP handlers depend on use cases rather than D1 queries
- a `ProjectStore` adapter that scopes private reads and writes by both project ID and authenticated owner ID
- persisted read rows decoded before they are projected into schema-derived, browser-safe resources
- write adapters that return minimal D1 `RETURNING` commit proofs, so a fallible row decode cannot occur after a write commits
- atomic, optimistic updates and deletes whose monotonic integer revision must still match in D1, preventing stale forms from overwriting or deleting a newer edit even when writes happen in the same millisecond
- retry-safe, first-write-wins creation using a client-stable project identifier
- scrubbed retirement markers that remove deleted content while preventing delayed creates from resurrecting the identifier for as long as its owning account exists
- a database-enforced lifetime limit of 100 active plus retired project identifiers per account, which also makes owner collection reads and JSON responses explicitly bounded
- declarative route-model binding only at the anonymous public-project boundary

Private project routes authenticate before parameter parsing, then perform owner-scoped application lookups before reading mutation bodies; a missing project and somebody else's project are intentionally indistinguishable. A separate anonymous route, `/showcase/projects/{project}`, keeps declarative binding for public projects and returns 404 for private or retired rows.

The protected `GET /api/projects` route returns the same browser-safe resources as JSON. Its payload is decoded against the declared response schema before being sent, so the generated OpenAPI success contract and the runtime response share one source of truth.

### Immediate public-project privacy

The anonymous showcase is deliberately not placed in front of the Worker cache. A CDN hit would bypass Worker middleware, so no in-Worker visibility check or best-effort tag purge could guarantee immediate concealment after a project becomes private or is retired. The route executes its declarative D1 binding on every request, checks the current lifecycle and visibility, and emits `Cache-Control: no-store`.

This chooses a strong privacy invariant over edge-cache latency: once the D1 write commits, the next showcase request cannot receive an older public representation. Projects that remain public also always render their current presentation data.

Authentication and authenticated responses, including JSON, Inertia pages,
redirects, and errors, also emit `Cache-Control: no-store`. Account, project,
session, IP, and user-agent data therefore cannot be retained by a browser or
shared intermediary after logout. This is a global Worker response policy, so
it also covers personalized not-found responses; hashed static assets continue
to be served directly by the Workers Assets binding.

The incoming request cancellation signal is available to application services as
an optional request-scoped capability. Reads stop at pre/post I/O boundaries.
If the caller disconnects during a write, the typed cancellation result records whether
the mutation committed so the browser can reload before deciding what to do next.
The application does not automatically retry project writes.

### Authoritative, token-safe session management

The protected `/sessions` page calls an application-owned `SessionLifecycle` service through a request-scoped Better Auth adapter. It can list active sessions, revoke one other session, revoke every other session, or authoritatively end the current session.

Session tokens remain server-side. Better Auth results are parsed, checked against the authenticated owner, and wrapped with `Redacted`; the browser receives only a schema-derived, non-secret session projection. Individual revocation posts a session ID, resolves its token from the authenticated user's current provider view, and unwraps it only inside the Better Auth adapter. An already-inactive target is an idempotent success, while the current session cannot be revoked through the “other session” operation.

The database retains at most five session rows per user. The migration trims
legacy rows first, then a D1 trigger keeps every newly created session plus the
newest four other rows; expired rows count toward the storage cap. A sixth
login can therefore retire the oldest retained login. The provider adapter
validates that invariant and returns the complete active view newest-first
instead of silently truncating an unexpected response.

Session provider calls observe request cancellation before and after I/O. To
revoke every other session, the lifecycle lists the bounded owner view once and
revokes each non-current token sequentially, checking cancellation between
mutations. Session mutations are intentionally not retried automatically. A
caller retry re-lists the remaining sessions, so already-completed idempotent
revocations are not repeated, and provider exceptions or tokens are never
exposed.

Logout revokes the current provider session before clearing its browser cookie. If the provider call fails, the cookie is deliberately retained instead of telling the browser that logout succeeded. Once logout succeeds, replaying a copy of the old cookie cannot restore the session; the Workerd smoke suite verifies this behavior.

Better Auth cookie caching is deliberately not configured. Enabling it could
allow a cached session to outlive authoritative revocation until the cache entry
expires, so that configuration would require re-auditing the immediate-revocation
guarantee.

Better Auth is an internal identity provider rather than a browser API in this demo. The entire inbound `/api/auth/*` namespace is denied, preventing provider session payloads from bypassing the token-free application projection. Login and registration invoke the provider router internally, so its production-only, atomic D1 rate limiter still protects the real form endpoints. Cloudflare's `CF-Connecting-IP` header supplies the per-route client key, credential bodies are capped before parsing, and passwords are rejected above the provider's 128-character limit without trimming valid whitespace.

Provider diagnostics use an application-owned logger that records only a closed log level. Better Auth messages, SQL parameters, exceptions, passwords, and session tokens are discarded at that boundary before any console output.

Credential rate-limit counters live in D1 for atomic cross-isolate decisions.
An application-owned storage adapter decides and records each request with one
key-scoped UPSERT. It does not use Better Auth's database storage cleanup path,
so resetting a stale key cannot start an unbounded request-time delete. The
Worker instead runs a minutely scheduled cleanup. Each tick removes at most 500
oldest rows older than 24 hours through the `last_request` index; repeated ticks
drain a backlog without an unbounded delete, and cleanup failures emit no row or
key data.

Because this focused demo does not include a reauthentication screen, it explicitly sets Better Auth's `session.freshAge` to `0`; session-management actions therefore remain available for the lifetime of a valid login. A production account-management flow should normally keep a freshness window and send stale sessions through reauthentication instead.

### Closed runtime configuration

Every request parses scalar Worker bindings once, before request-scoped framework services are created. Invalid configuration returns a generic 500 response and logs only the failed field name and a safe reason; rejected secrets or origins are never retained in diagnostics.

| Binding | Requirement |
| --- | --- |
| `ENVIRONMENT` | Required; exactly `development` or `production`. |
| `APP_ORIGIN` | Required canonical HTTP(S) origin with no credentials, path, query, or fragment. External production origins must use HTTPS; HTTP is accepted only for exact loopback origins used by local Workerd checks. Include a non-default port. |
| `BETTER_AUTH_SECRET` | Required high-entropy secret of at least 32 characters. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Optional strict comma-separated list of additional HTTP(S) origins; blank or trailing entries are rejected. Production entries must use HTTPS unless the canonical application origin is itself loopback. |
| `DEV_VITE_ORIGIN` | Optional exact HTTP(S) origin of the Vite dev server; defaults to `http://localhost:5173` and is supplied automatically by `bun run dev`. Only read in development. |

The application origin is the Better Auth base URL and a trusted origin. Add preview or alternate origins through `BETTER_AUTH_TRUSTED_ORIGINS`; do not replace the canonical origin with a wildcard.

### An interface that explains itself

Pages use Tailwind utilities on the default palette and follow the system's
light or dark mode. The account menu is a Base UI `Menu`, and destructive
actions confirm in a Base UI `AlertDialog`, so the primitives own focus
trapping, Escape handling, and focus return. The dashboard reads the account's
projects and sessions concurrently in one Effect and renders a schema-derived
overview. Every page ends with an "Under the hood" panel that names its route
and the framework guarantees it demonstrates.

## Tech stack

- [Hono](https://hono.dev) on Cloudflare Workers
- [@popcomputer/web](https://github.com/PatrickOgilvie/popcomputer-web) with Effect v4
- [Better Auth](https://www.better-auth.com)
- Cloudflare D1 with [Drizzle ORM](https://orm.drizzle.team)
- [React](https://react.dev) and [Inertia.js](https://inertiajs.com)
- [Tailwind CSS](https://tailwindcss.com) utilities, [Base UI](https://base-ui.com) for the account menu and confirmation dialogs, and [Lucide](https://lucide.dev) icons
- Vite, served locally through [portless](https://github.com/vercel-labs/portless)
- Bun for dependency management, scripts, and tests

## Local development

1. Install dependencies:

   ```bash
   bun install
   ```

2. Copy the local secret file:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Generate a high-entropy Better Auth secret:

   ```bash
   openssl rand -base64 32
   ```

   Replace the example `BETTER_AUTH_SECRET` in `.dev.vars` with the generated
   value. The `bun run secret:generate` script is for Cloudflare deployments;
   it uploads a generated secret rather than updating the local file.

3. Apply all local D1 migrations:

   ```bash
   bun run db:migrate:local
   ```

4. Start Vite and Wrangler together:

   ```bash
   bun run dev
   ```

The app is served at a stable, named URL through
[portless](https://github.com/vercel-labs/portless), installed as a dev
dependency, so it never competes with other projects for a port:

| Server | URL |
| --- | --- |
| Worker (open this) | `https://popcomputer-web-demo.localhost` |
| Vite assets and HMR | `https://vite.popcomputer-web-demo.localhost` |

`bun run dev` builds the production manifest Wrangler needs, then runs
`scripts/dev.ts` through `portless run`. Portless assigns the Worker a free
loopback port and its public URL. The script resolves the sibling Vite route
with `portless get`, starts Vite under that route, and starts Wrangler with
`--local-upstream` set to the public host. The Worker therefore sees the same
origin as the browser, even when portless terminates HTTPS, so same-origin
checks and Better Auth's trusted origins agree. Vite accepts cross-origin module
requests only from that Worker origin.

The first run starts the portless proxy on port 443. That needs your password
once (to bind the port and trust portless's local certificate authority), so
run it from an interactive terminal. Portless documents Node.js 24 or newer.
Useful commands:

```bash
bunx portless list     # show active routes
bunx portless doctor   # check proxy, DNS, and certificate trust
```

In a linked git worktree, portless prefixes both hostnames with the branch name
(for example `fix-ui.popcomputer-web-demo.localhost`), so worktrees never
collide either. To skip portless entirely, run `PORTLESS=0 bun run dev`. The
Worker then uses <http://localhost:8787> and Vite uses port 5173, and startup
fails if either port is already taken.

For walking the UI locally, `scripts/fixtures/demo-account.ts` holds two
throwaway accounts. Register them through the app; they exist only in your
local D1 database.

## Database migrations

The checked-in migrations are applied in order:

- `migrations/0000_initial.sql` creates Better Auth users, sessions, accounts, and verification tables.
- `migrations/0001_projects.sql` creates the projects table, database constraints, and lookup indexes.
- `migrations/0002_rate_limits.sql` creates Better Auth's durable, atomic credential-attempt counters.
- `migrations/0003_project_revisions.sql` adds safe-integer monotonic project revisions while leaving legacy second timestamps unchanged for migration-before-code compatibility.
- `migrations/0004_retire_project_ids.sql` adds scrubbed project retirement markers and guards invalid retirement, reactivation, and direct deletion while preserving account cascades.
- `migrations/0005_index_rate_limit_cleanup.sql` indexes expired authentication counters for bounded cleanup work.
- `migrations/0006_bound_account_projects.sql` bounds each account's lifetime project collection and indexes active owner reads.
- `migrations/0007_bound_sessions.sql` trims legacy session rows and enforces a five-row per-user session cap.

Use `bun run db:migrate:local` for local D1 and `bun run db:migrate` for the configured remote database. Add a new numbered migration when changing persisted schema; do not edit a migration that has already been applied to a shared database.

## Framework CLI and checks

The package scripts invoke the CLI from the exact installed `@popcomputer/web` release:

```bash
bun run routes       # Print the application-owned route registry
bun run check        # Check route names, schemas, bindings, and configuration
bun run openapi      # Regenerate openapi.json for the protected JSON slice
bun run openapi:check # Fail if the checked-in OpenAPI artifact is stale
bun run typecheck    # Run TypeScript without emitting files
bun test             # Run the Bun test suite
bun run test:worker  # Exercise a temporary migrated D1 database in Workerd
bun run build        # Build and verify production client assets
bun run verify:assets # Recheck the existing manifest and every referenced file
bun run deploy:dry   # Bundle the Worker and assets without publishing
bun run verify       # Run the complete unit, framework, runtime, and bundle suite
```

Production rendering has no missing-entry fallback. Every build verifies that
`dist/manifest.json` contains the `src/main.tsx` entry, its CSS, a valid import
graph, safe relative asset paths, and an existing file for every referenced
JavaScript or stylesheet. Reachable chunks must emit `.js` and stylesheet
references must emit `.css`; an existing file of the wrong type is rejected. A
missing, malformed, or stale manifest therefore
fails `build` and the complete `verify` workflow before deployment.

`openapi.json` is deliberately scoped to `/api`. Its documented 200 JSON payload is runtime-validated and wire-accurate. `bun run openapi:check` generates a temporary document and compares it semantically, so verification detects drift without rewriting the reviewed artifact. The current rc generator still provides only partial authentication and error documentation, so the file is not a complete contract for every possible response. `bun run routes` and `bun run check` continue to inspect the full Inertia application; rendered HTML, Inertia page objects, redirects, and cookies are intentionally outside the OpenAPI slice.

The framework currently warns when the owner-scoped project routes use `:project`
without declarative model binding, and when read-only showcase/API resources have
no create route. Those diagnostics are intentional: private project lookup stays
inside the authenticated application service. `bun run check` compares the CLI's
JSON report with the exact reviewed set, including multiplicity, and fails if any
diagnostic is added, removed, or changes severity.

## Project structure

```text
.
├── migrations/
│   ├── 0000_initial.sql          # Better Auth tables
│   ├── 0001_projects.sql         # Projects table and constraints
│   ├── 0002_rate_limits.sql      # Durable authentication rate limits
│   ├── 0003_project_revisions.sql # Safe-integer optimistic revisions
│   ├── 0004_retire_project_ids.sql # Durable, scrubbed project retirement
│   ├── 0005_index_rate_limit_cleanup.sql # Expired rate-limit cleanup index
│   ├── 0006_bound_account_projects.sql # Project lifetime quota and read index
│   └── 0007_bound_sessions.sql   # Session-row cap and stable owner index
├── openapi.json                  # Generated protected JSON API contract
├── scripts/
│   ├── dev.ts                    # Portless Worker/Vite orchestration
│   ├── dev-environment.ts        # Route names, local origins, and Vite CORS policy
│   ├── fixtures/demo-account.ts  # Local-only accounts for walking the UI
│   ├── check-framework.ts        # Exact framework-warning contract
│   ├── check-openapi.ts          # Non-mutating OpenAPI drift check
│   ├── migrations.test.ts        # Deploy-order and database invariant proofs
│   ├── smoke-worker.sh           # Workerd integration and replay checks
│   └── verify-build-manifest.ts  # Production asset boundary verification
├── src/
│   ├── actions/
│   │   ├── auth.ts               # Login, registration, and logout
│   │   ├── dashboard.ts          # Project and device overview
│   │   ├── projects.ts           # Thin HTTP adapter for project use cases
│   │   └── sessions.ts           # Thin HTTP adapter for session use cases
│   ├── adapters/
│   │   ├── better-auth-sessions.ts # Better Auth session-provider adapter
│   │   ├── d1-project-store.ts   # Owner-scoped D1 project store
│   │   ├── d1-rate-limit-cleanup.ts # Bounded scheduled counter cleanup
│   │   └── d1-rate-limit-storage.ts # Atomic key-scoped counter decisions
│   ├── application/
│   │   ├── projects.ts           # Project workflows, ports, and failures
│   │   └── session-lifecycle.ts  # Session policy, ports, and failures
│   ├── components/               # App shell, Base UI menu and dialog, form controls
│   ├── db/
│   │   ├── db.ts                 # Drizzle D1 client
│   │   └── schema.ts             # Better Auth and project tables
│   ├── domain/
│   │   ├── auth-credentials.ts   # Opaque and redacted credential schemas
│   │   ├── identity.ts           # Branded identity schemas
│   │   ├── project.ts            # Effect Schema project model and commands
│   │   └── session.ts            # Parsed session and actor models
│   ├── http/
│   │   ├── better-auth-form.ts   # Strict Better Auth form adapter
│   │   ├── no-store-response.ts  # Global dynamic-response cache prohibition
│   │   ├── project-http.ts       # Owner actor and safe project-to-HTTP failure mapping
│   │   ├── require-authenticated-request.ts # Pre-parse auth middleware
│   │   ├── bounded-request-body.ts # Authorization-first bounded parser
│   │   ├── session-http.ts       # Safe session-to-HTTP failure mapping
│   │   └── strict-form-route.ts  # Prepare, strict parse, invalid/valid flow
│   ├── lib/
│   │   └── auth.ts               # Request-scoped Better Auth factory
│   ├── pages/
│   │   ├── Auth/                 # Login and registration pages
│   │   ├── Errors/               # Shared error page
│   │   ├── Projects/             # CRUD and public showcase pages
│   │   ├── Sessions/             # Active-session management page
│   │   └── Dashboard.tsx
│   ├── presentation/
│   │   ├── dashboard.ts          # Browser-safe account overview
│   │   ├── project.ts            # Browser-safe project projections
│   │   ├── session.ts            # Browser-safe session projections
│   │   └── timestamp.ts          # Shared strict wire timestamp schema
│   ├── runtime/
│   │   ├── request-cancellation.ts # Optional request-scoped cancellation
│   │   └── runtime-config.ts     # Closed, redacted binding parser
│   ├── index.ts                  # Hono/setupWeb composition root
│   ├── main.tsx                  # React/Inertia client entry
│   ├── routes.ts                 # Route registry and policies
│   ├── styles.css                # Tailwind import and global layering rules
│   ├── types.ts                  # App bindings and module augmentation
│   └── worker.ts                 # Fetch and scheduled-cleanup lifecycle
├── package.json
└── wrangler.toml                 # Worker, assets, and D1 config
```

## Deployment

### Option 1: Deploy Button (Recommended)

Click the deploy button at the top of this README. Cloudflare will automatically:

- Provision a D1 database
- prompt for a high-entropy `BETTER_AUTH_SECRET`
- prompt for `APP_ORIGIN`; set it to the exact public origin you will use
- keep `ENVIRONMENT` set to the closed `production` mode
- Run migrations and deploy the Worker

The checked-in `APP_ORIGIN = "configure-me"` value is an intentionally invalid
sentinel, not a usable default. It prevents a deployment from silently using an
incorrect Better Auth origin if the value is skipped.

### Option 2: Manual Deployment

For first-time manual deployment, run setup to create the D1 database and set secrets:

```bash
bun run setup
```

Setup updates the `DB` binding in `wrangler.toml` with the new database ID automatically.

Before deploying, replace the `APP_ORIGIN` sentinel in `wrangler.toml` with the
canonical public Worker or custom-domain origin:

```toml
[vars]
ENVIRONMENT = "production"
APP_ORIGIN = "https://demo.example.com"
```

If the application accepts requests from additional preview or alternate
origins, add a strict comma-separated `BETTER_AUTH_TRUSTED_ORIGINS` variable.
Keep the authentication secret in Cloudflare's secret storage, not in
`wrangler.toml`.

Then deploy:

```bash
bun run deploy
```

This builds the frontend, applies remote migrations, and deploys the Worker. For subsequent deploys, run `bun run deploy` again.

After changing an origin, update `APP_ORIGIN` and trusted origins together and
redeploy. A missing or malformed required value intentionally leaves the Worker
serving a generic configuration error until it is corrected.

## License

[MIT](LICENSE)
