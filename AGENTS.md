# Project guide

## Purpose

Pure static turtle-soup game using SolidJS 2, TypeScript, Vite, Tailwind CSS and DaisyUI, in a pnpm / Turborepo workspace. No backend, database, SSR, authentication or router.

## Boundaries

- `apps/web`: browser UI, game signals, static puzzle JSON and localStorage settings.
- `packages/core`: shared types, puzzle selection, solution rules and all Jev request payloads / response validation. Keep it independent of Solid, DOM and localStorage; browser-compatible fetch is allowed.
- The browser calls the user-configured Jev endpoint directly. Never hardcode keys or introduce a proxy.
- Preserve Tailwind CSS and DaisyUI. Desktop uses a viewport-bounded two-column layout: puzzle left, conversation right. Scroll content inside panels, not the whole page. Narrow screens use compact stacked panels.
- Automatically show a result dialog after solving. Closing it must preserve the ended game; starting the next puzzle resets the result UI.

## Project skills

Read the relevant skill first:

- [`project-architecture`](.agents/skills/project-architecture/SKILL.md): UI, signals, package boundaries, request/dialog lifetimes or static deployment.
- [`project-testing`](.agents/skills/project-testing/SKILL.md): tests, mocks, Solid scheduling or behavior validation.

## Workflow

- Treat `README.md` as the source of truth for setup, commands, Jev protocol, puzzle schema and deployment.
- Keep scope to the MVP; use signals, direct functions and minimal dependencies.
- Run `pnpm check`, `pnpm test`, and `pnpm build` before finishing. For UI changes also check desktop/mobile overflow and dialog behavior when browser tooling is available; disclose when visual or live API verification was not run.
