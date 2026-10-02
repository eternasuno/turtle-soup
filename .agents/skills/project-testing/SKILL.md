---
name: project-testing
description: Follow the project's behavior and test-directory boundaries when writing or adjusting tests, test doubles, Effect Layer assembly, or in-memory database schema initialization.
---

# Project Testing

- Tests should verify only observable behavior owned by the project, such as project configuration, error conversion, service projections, route composition, and custom codecs; do not test third-party library behavior itself.
- Mirror the responsibilities of `src` in test directories and filenames; place middleware, routes, runtime, and similar tests in their corresponding locations under each app's `test` directory.
- Prefer real Layers; use `Layer.mock` when a substitute is needed. When behavior is only simple third-party library assembly with no project-specific behavior, do not create tests merely to increase coverage.
- When adding or changing behavior, define the project behavior assertion first, then implement it; keep tests aligned with boundaries, identity sources, and resource lifecycles.
- When backend tests initialize `mem://`, call the SurrealDB adapter's `createSchema` directly; do not rely on production migration side effects in tests.
- Frontend test scripts should not use `--passWithNoTests`; a missing web test suite should fail visibly rather than silently pass.
- Test browser-independent frontend state and validation logic in the existing Node/Vitest environment. Add a DOM environment only when the behavior under test depends on rendered DOM interactions.
