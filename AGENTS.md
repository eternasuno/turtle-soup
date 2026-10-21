# Project guide

Pure static turtle-soup SPA: SolidJS 1, @effect/atom-solid, TypeScript, Vite, Tailwind CSS and DaisyUI in a pnpm / Turborepo workspace. No backend, proxy, database, SSR, authentication or router.

## Boundaries

- `apps/web`: UI, owner-scoped AtomRegistry/ManagedRuntime, static puzzles and localStorage adapters.
- `packages/core`: domain schemas, rules, sessions, settings/use cases and official Effect Decision integration. No Solid, DOM or localStorage dependencies.
- `packages/local-model`: Laya fp16 Worker loading/inference and model-specific caches; implements DecisionModel and LocalModelResources.
- Call the user-configured API directly or use the selected local model. Never hardcode keys. Keep dependencies minimal.
- Expose only player-visible session data; reveal truth only after solve/reveal, never expose judgmentPoints.

## Read before changing

- [project-architecture](.agents/skills/project-architecture/SKILL.md): package boundaries, providers, settings, UI and resource lifetimes.
- [project-testing](.agents/skills/project-testing/SKILL.md): tests, mocks and behavior verification.
- This guide and the project skills contain agent-facing instructions and technical contracts. Record guidance agents need here or in the relevant skill.
- Keep README, AGENTS and project skills in English. Preserve required legal notices and keep user-facing puzzle content separate from developer documentation.

## Completion

Run `pnpm check`, `pnpm test` and `pnpm build` for code changes. For UI changes, verify desktop/mobile overflow and dialog behavior when browser tooling is available. Report skipped checks and distinguish mocked tests from browser, real-model and live API verification.
