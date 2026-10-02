# Project guide

## Purpose

Self-hosted starter with a pure SolidJS 2 SPA and a separate Effect HttpServer API using Better Auth and embedded SurrealDB/SurrealKV. It is a pnpm workspace managed with Turborepo.

## Project skills

Read the relevant skill first when the task involves:

- [`project-architecture`](.agents/skills/project-architecture/SKILL.md) — SolidJS routes or components, browser/API boundaries, frontend session subscriptions, or deployment topology.
- [`project-effect-api`](.agents/skills/project-effect-api/SKILL.md) — Better Auth paths, session identity, protected APIs, Effect services, or Layer composition.
- [`project-database`](.agents/skills/project-database/SKILL.md) — SurrealDB/SurrealKV runtime connections, Better Auth schema migrations, or database deployment configuration.
- [`project-testing`](.agents/skills/project-testing/SKILL.md) — tests, test doubles, Effect Layer assembly, or in-memory database schema initialization.

## Workflow

- Treat `README.md` as the source of truth for setup, commands, environment variables, routes, and deployment details.
- Before finishing changes, run `pnpm check`, `pnpm test`, and `pnpm build`.
