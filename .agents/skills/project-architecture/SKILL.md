---
name: project-architecture
description: Follow the client architecture and resource-lifecycle constraints when working on this repository's SolidJS pages, browser/API boundary, frontend session subscriptions, or deployment topology.
---

# Project Architecture

- Inspect the relevant source and configuration before making changes. Prefer existing responsibilities and capabilities, and make only the minimum change required by the task.
- The project is a pure client-side SolidJS 2 SPA with a separate Effect HttpServer API; the browser accesses the API through credentialed HTTP requests.
- Keep `apps/web` limited to browser routes, components, the Better Auth client, and the API client; preserve client rendering.
- Do not introduce `apps/api`, Effect server modules, database clients, embedded engines, secrets, or Better Auth server configuration into web; do not add SSR or server functions.
- API HTTP routes belong in `apps/api/src/routes`, runtime Layers and database capabilities in `apps/api/src/runtime`, and request middleware in `apps/api/src/middleware`; place server capabilities according to these responsibilities and do not move them into web.
## Solid Session Subscription

`authClient.useSession.subscribe` invokes its callback synchronously. When subscribing inside a Solid owned scope:

1. Use `queueMicrotask` to defer the subscription itself so the synchronous initial callback occurs outside the owned scope.
2. Check the cleanup state first inside the microtask; do not subscribe if cleanup has already occurred.
3. Have `onCleanup` mark the cleanup state before cancelling an established subscription.

Keep the unsubscribe operation to prevent state writes after unmount and resource leaks.

## Deployment Topology

When deployment topology, startup procedure, or the web/API runtime relationship needs confirmation, first read the relevant section of `README.md`; do not duplicate changing lists or defaults in this skill.
