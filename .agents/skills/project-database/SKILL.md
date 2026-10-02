---
name: project-database
description: Follow the startup and migration boundaries when working on this repository's SurrealDB/SurrealKV runtime connections, Better Auth schema migrations, or database deployment configuration.
---

# Project Database

- At API startup, connect only to the configured SurrealDB/SurrealKV and select the namespace/database; do not generate or apply schema at runtime.
- Migrate the Better Auth schema through the project's existing `db:migrate` entry point: export DDL from the adapter and apply it directly to the target database.
- Apply the migration once during deployment, then start the service; do not put migrations into runtime startup, which can cause contention when multiple instances restart.

When database environment variables, deployment topology, or startup procedure needs confirmation, first read the relevant section of `README.md`; do not duplicate environment defaults or deployment lists in this skill.
