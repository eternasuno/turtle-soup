# Project guide

## Purpose

Pure static turtle-soup game using SolidJS 1 + @effect/atom-solid, TypeScript, Vite, Tailwind CSS and DaisyUI, in a pnpm / Turborepo workspace. No backend, database, SSR, authentication or router.

## Boundaries

- `apps/web`: browser UI, atom-solid session snapshots, owner-scoped AtomRegistry/ManagedRuntime, static puzzle JSON and localStorage settings.
- `packages/core`: shared types, puzzle selection, solution rules and Decision request payloads / response validation. Keep it independent of Solid, DOM and localStorage; browser-compatible fetch is allowed.
- `packages/local-model`: Laya fp16 loading, cache inspection/deletion and local inference; expose gameplay through official Effect DecisionModel via LayaDecisionModelLayer and cache capabilities through LocalModelResources without coupling core to browser caches.
- The browser calls the user-configured Decision endpoint directly or runs the selected local model. Never hardcode keys or introduce a proxy.
- Preserve Tailwind CSS and DaisyUI. Desktop uses a viewport-bounded two-column layout: puzzle left, conversation right. Scroll content inside panels, not the whole page. Narrow screens use compact stacked panels.
- Automatically show a result dialog after solving. Closing it must preserve the ended game; starting the next puzzle resets the result UI.

## Project skills

Read the relevant skill first:

- [`project-architecture`](.agents/skills/project-architecture/SKILL.md): UI, signals, package boundaries, request/dialog lifetimes or static deployment.
- [`project-testing`](.agents/skills/project-testing/SKILL.md): tests, mocks, Solid scheduling or behavior validation.

## Workflow

- Treat `README.md` as the source of truth for setup, commands, Decision API protocol, cache workflow, puzzle schema and deployment.
- Keep scope to the MVP: core owns PuzzleDefinition; session exposes PuzzleView and an ended-only result, never judgmentPoints. Use official DecisionModel for API/local gameplay; API uses official @effect/ai-typesafe with the complete TypeSafe protocol; preserve full endpoint settings via HTTP request URL transformation.
- Preserve legacy draft settings/storage compatibility; resolve a provider-discriminated runtime configuration with Redacted API key. Apply settings only after save succeeds. Keep save/test/prepare use cases and injected resource/test interfaces; do not split inspect/download/remove capabilities into arbitrary use cases.
- API configuration tests use the unsaved draft and never apply settings automatically; cancel on edit, provider change, close and cleanup. Compose official TypeSafe client/model Layers rather than recreating their services. Preserve request-scoped response cleanup, 30-second timeout, omitted credentials and rejected redirects; disable HttpClient tracing header propagation for cross-origin API requests.
- Keep dependencies minimal; dispose owner registries, scopes and runtimes and cancel stale work on replacement/cleanup.
- Run `pnpm check`, `pnpm test`, and `pnpm build` before finishing. For UI changes also check desktop/mobile overflow and dialog behavior when browser tooling is available; disclose when visual or live API verification was not run.
