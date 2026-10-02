# Solid Effect Starter

A self-hosted pnpm/Turborepo starter with a pure SolidJS 2 client application and a separate Effect HTTP API backed by Better Auth and embedded SurrealDB/SurrealKV. The UI uses Tailwind CSS v4 and DaisyUI v5.

## Prerequisites

- Node.js **22.19 or newer**
- pnpm **12.3.4**

Install dependencies and create the local configuration files:

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Replace `BETTER_AUTH_SECRET` in `apps/api/.env` with a long random value, for example from `openssl rand -base64 32`.

## Development

```sh
pnpm dev
```

By default:

- Web SPA: `http://localhost:3000`
- Effect API: `http://localhost:3001`

Both applications run as independent Turborepo tasks. Vite proxies `/api` to the Effect server during development and preview, so browser authentication remains same-origin without API CORS middleware.

## Commands

```sh
pnpm dev        # run the web and API development servers
pnpm build      # build both applications
pnpm start      # run the built API server
pnpm test       # run all Vitest suites
pnpm check      # run Biome checks
pnpm check:fix  # run Biome checks and apply fixes
```

## Project guidance

Maintainers should read [`AGENTS.md`](AGENTS.md) first, then read the relevant project skill for the task:

- [`project-architecture`](.agents/skills/project-architecture/SKILL.md) — architecture, browser/API boundaries, session subscriptions, or deployment topology.
- [`project-effect-api`](.agents/skills/project-effect-api/SKILL.md) — Better Auth, sessions, protected APIs, Effect services, or Layer composition.
- [`project-database`](.agents/skills/project-database/SKILL.md) — SurrealDB/SurrealKV, schema migrations, or database deployment configuration.
- [`project-testing`](.agents/skills/project-testing/SKILL.md) — tests, test doubles, Effect Layers, or in-memory database schema setup.

## Architecture

```text
Browser
  -> apps/web: static SolidJS SPA
  -> credentialed HTTP requests
  -> apps/api: Effect HttpServer
       -> Better Auth
       -> SurrealDB / SurrealKV
```

- `apps/web` contains browser-only routes, components, and the Better Auth client. Vite builds static assets with `ssr: false`; there are no server functions or server runtime modules.
- `apps/api/src/routes` owns HTTP routing. Better Auth handles `/api/auth/*`.
- `apps/api/src/runtime` holds the Effect layers for Better Auth and SurrealDB; `apps/api/src/app.ts` composes them into the HTTP `AppLive`, and `apps/api/src/server.ts` is the process entry that launches it. The server entry owns layer acquisition and graceful shutdown via `NodeRuntime`.
- `apps/api/test` tests the database, the authentication protocol, and HTTP handlers against `mem://`.

### Security boundaries

The backend derives identity only from the Better Auth session cookie on the incoming request. It never accepts a client-supplied user ID as identity. Database clients, embedded engines, secrets, and Better Auth server configuration stay in `apps/api` and cannot enter the browser bundle.

Better Auth owns `/api/auth/*`; application endpoints should not reimplement its protocol. Protected endpoints should use `currentUserMiddleware` and derive identity from `CurrentUser` in `apps/api/src/middleware/session.ts`.

### Embedded SurrealDB

`apps/api/src/runtime/db/index.ts` connects to the configured database and selects its namespace and database. Runtime startup does not generate or apply schema.

Better Auth's `auth migrate` command only supports its built-in Kysely adapter, so for the SurrealDB adapter the CLI can only emit DDL. Apply the schema with the package script:

```sh
pnpm --filter api db:migrate
```

The script derives the DDL from the adapter and applies it to the configured database. Apply schema during deployment rather than at startup, so changes are applied once instead of racing across restarted instances. Tests initialize the adapter schema directly against `mem://`.

## Environment variables

Web variables belong in `apps/web/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WEB_PORT` | `3000` | Web development/preview port |

API variables belong in `apps/api/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_PORT` | `3001` | Effect HTTP server port |
| `SURREAL_ENDPOINT` | `mem://` | Database endpoint; defaults to ephemeral `mem://`; use an absolute SurrealKV path or managed endpoint in production. |
| `SURREAL_NAMESPACE` | `app` | SurrealDB namespace |
| `SURREAL_DATABASE` | `app` | SurrealDB database |
| `BETTER_AUTH_SECRET` | — | Better Auth signing secret |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Canonical public site origin used for auth URLs |

Deploy the frontend and `/api` on the same public origin. In development and preview, Vite provides the `/api` proxy.

## Routes

### Web

- `/register` — email/password registration
- `/login` — email/password login
- `/` — protected account page; redirects to `/login` when no session exists

### API

- `/api/auth/*` — Better Auth protocol

## Production

Build both applications:

```sh
pnpm build
```

`apps/web/dist` is a static SPA. Serve it with a real static host configured to fall back unknown page routes to `index.html`; it must not be used as a production web server. `apps/api/dist/server.js` is the Node backend, started by `pnpm start` (or `pnpm --filter api start`); production supervisors may instead run and scale the two processes separately.

Use an absolute `SURREAL_ENDPOINT` or managed SurrealDB endpoint in production, route `/api` to the Effect server, and set `BETTER_AUTH_URL` to the public site origin.
