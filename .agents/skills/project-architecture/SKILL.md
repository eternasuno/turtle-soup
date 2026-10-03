---
name: project-architecture
description: Follow static SPA and core-package boundaries, SolidJS 2 signal scheduling, viewport layout and browser resource lifetimes when changing the turtle-soup UI or Jev integration.
---

# Project Architecture

## Ownership

- Inspect the affected source and configuration before changing behavior.
- `packages/core` owns domain schemas, rules, session state (`session.ts`), settings use cases and the SettingsStorage service contract (`settings.ts`), Jev transport and question/solution use cases. `apps/web` owns rendering, the runtime/Solid/DOM adapter, static puzzle JSON and the localStorage-backed `SettingsStorageLive`.
- Core has no Solid, DOM or localStorage dependency. Its submission use cases return only player-visible content and game status; UI must not build payloads, map model answers to labels or receive hidden facts from those use cases.
- Remain a pure static SPA: no SSR, server functions, backend, proxy, database, authentication or router.
- Browser calls the full user-configured endpoint with their key. Validate untrusted answers, display fixed labels, and reveal neither truth nor keyFacts before ending the game. Partial solutions never identify missing facts.

## Effect boundaries

- Prefer the installed Effect APIs for effectful workflows and data processing, not Promise implementations wrapped merely for appearance. Keep one canonical Effect API; execute it at the web boundary. Keep pure scoring synchronous and dependencies acyclic.
- Define domain types from Schema rather than maintaining duplicate interfaces. Use Option for domain absence and session errors, the role-discriminated Message union (only user messages have mode), and exhaustive Match for domain mode/result branches. Keep tagged failures distinct from optional error display state.
- `settings.ts` owns Schema JSON encoding/decoding through SettingsStorage. Loaded settings may be blank drafts; `saveSettings` validates and normalizes URL/key before writing, returning normalized settings only after successful storage. UI must not bypass this use case or update runtime configuration after a failed save.
- `JevClient` is the injectable API capability with `request(payload)`. `JevClientLayer(settings)` requires HttpClient; `JevClientLive(settings)` supplies FetchHttpClient. Normalize/validate configuration once when building the Layer, not on each request. Build HTTP requests and decode responses through Effect HttpClient/Schema, not parallel raw-fetch/manual-parser paths.
- `session.ts` owns state in SubscriptionRef and request lifetimes in scoped Fibers, with Ref-backed identity/duplicate guards. Web subscribes snapshots into Solid signals and executes commands; do not reproduce game rules or cancellation state in UI signals.
- Keep one persistent ManagedRuntime per game configuration. Configuration replacement cancels the active request and disposes the old runtime without resetting the session; owner cleanup interrupts the subscription, closes the session Scope and disposes the runtime. Connection testing uses a separate temporary configured Layer.
- Preserve HTTP(S)-only endpoints without userinfo, omitted credentials, rejected redirects, 30-second timeout, requested answer IDs/allowed choices and finite confidence in [0, 1]. Static schemas do not replace dynamic request-dependent validation.
- Use tagged errors for expected failures; keep interruption and defects distinct. Do not swallow all rejected runtime promises. Guard completion/finalizers by request identity so an interrupted old task cannot change a new game.
- Snapshot mutable inputs used before and after asynchronous work. Schema-inferred readonly arrays do not make external aliases immutable at runtime.
- Maintain shared package versions in the workspace catalog. Verify installed exports and peer requirements before selecting version-sensitive APIs; documentation may describe a different Effect release.
- The user chose to retain Solid 2 and defer `@effect/atom-solid`: version 4.0.0 requires Solid 1 and uses APIs removed in Solid 2. Recheck compatibility before proposing integration; do not bypass peers, introduce a shim or downgrade Solid silently.

## UI and Solid 2

- Preserve Tailwind CSS through the Vite plugin and DaisyUI through CSS. Prefer their utilities/components; keep `index.css` limited to framework configuration, theme and essential global styles instead of custom UI classes.
- Prefer HTML/CSS for local presentation state: radio `checked`, Tailwind `checked:` / `has:` variants, and native form validation. Keep signals for rendering core snapshots, DOM-local asynchronous feedback and shared presentation state; do not duplicate input values in signals unless reactive consumers need them.
- Use native `<dialog>` with `showModal()`, `method="dialog"` close forms and the native close event; do not emulate modals with checkbox state. Missing saved Jev URL or key opens settings on initial load.
- Desktop: viewport-bounded two columns, puzzle left and chat right; use `min-height: 0` and internal overflow so history does not lengthen the page. Narrow screens: compact stacked panels with independently scrollable content. Keep actions reachable.
- Solving opens a native result dialog automatically. Closing preserves the solved game and visible truth; next puzzle resets dialog dismissal state. Give-up still reveals the truth and disables sending.
- Solid 2 writes are scheduled. Keep the immediate duplicate/stale-response guard in the core session's Ref-backed request identity; do not rely on a rendering/loading signal written in the same event.
- The installed Solid 2 version has no `onMount`. Open conditionally mounted native dialogs in a guarded microtask, and close them on owner cleanup. Prevent a queued callback from opening an already-unmounted dialog.
- Route give-up, reset and cancellation through core session commands; close its Scope on cleanup. Preserve identity checks for outdated responses and finalizers so they cannot change a new game. Dialog-local connection tests still abort on edit/close/cleanup; cover cancel / close / reset.

## Static deployment

- GitHub Pages deploys the web build through the existing workflow on `main`. Preserve relative Vite asset paths for repository subpaths; never put a user Jev key in Actions secrets or built assets.
- Before committing new static data or tests, check that `.gitignore` does not exclude them. A local successful build cannot detect files missing from the remote checkout.

## Completion

Check failure retry, no premature truth disclosure, next-puzzle reset, dialog dismissal, panel overflow and keyboard accessibility. For dependency/architecture changes, compare build output with a measured baseline and report size cost rather than assuming Effect reduces the bundle. Read `README.md` for setup, Jev protocol and deployment; do not duplicate endpoint defaults here.
