---
name: project-architecture
description: Follow static SPA and core-package boundaries, SolidJS 2 signal scheduling, viewport layout and browser resource lifetimes when changing the turtle-soup UI or Jev integration.
---

# Project Architecture

## Ownership

- Inspect the affected source and configuration before changing behavior.
- `apps/web` owns UI, game signals, static puzzle JSON and localStorage. `packages/core` owns types, selection rules, result calculation and all Jev payloads, requests and response validation.
- Core has no Solid, DOM or storage dependency. UI must not build Jev payloads or compute model-driven overall scores itself.
- Remain a pure static SPA: no SSR, server functions, backend, proxy, database, authentication, router or external state library.
- Browser calls the full user-configured endpoint with their key. Validate untrusted answers, display fixed labels, and reveal neither truth nor keyFacts before ending the game. Partial solutions never identify missing facts.

## UI and Solid 2

- Preserve Tailwind CSS through the Vite plugin and DaisyUI through CSS. Prefer their utilities/components; keep `index.css` limited to framework configuration, theme and essential global styles instead of custom UI classes.
- Prefer HTML/CSS for local presentation state: radio `checked`, Tailwind `checked:` / `has:` variants, and native form validation. Keep signals for game rules, asynchronous requests and shared state; do not duplicate input values in signals unless reactive consumers need them.
- Use native `<dialog>` with `showModal()`, `method="dialog"` close forms and the native close event; do not emulate modals with checkbox state. Missing saved Jev URL or key opens settings on initial load.
- Desktop: viewport-bounded two columns, puzzle left and chat right; use `min-height: 0` and internal overflow so history does not lengthen the page. Narrow screens: compact stacked panels with independently scrollable content. Keep actions reachable.
- Solving opens a native result dialog automatically. Closing preserves the solved game and visible truth; next puzzle resets dialog dismissal state. Give-up still reveals the truth and disables sending.
- Solid 2 writes are scheduled. Use request identity as an immediate duplicate/stale-response guard; do not rely only on a loading signal written in the same event.
- The installed Solid 2 version has no `onMount`. Open conditionally mounted native dialogs in a guarded microtask, and close them on owner cleanup. Prevent a queued callback from opening an already-unmounted dialog.
- Abort requests on give-up, reset and cleanup. Ignore outdated responses and finally blocks so they cannot change a new game. Dialog tests must also cover cancel / close / reset.

## Static deployment

- GitHub Pages deploys the web build through the existing workflow on `main`. Preserve relative Vite asset paths for repository subpaths; never put a user Jev key in Actions secrets or built assets.
- Before committing new static data or tests, check that `.gitignore` does not exclude them. A local successful build cannot detect files missing from the remote checkout.

## Completion

Check failure retry, no premature truth disclosure, next-puzzle reset, dialog dismissal, panel overflow and keyboard accessibility. Read `README.md` for installation, exact Jev protocol and static deployment; do not duplicate endpoint defaults here.
