---
name: project-architecture
description: Follow static SPA and core-package boundaries, SolidJS 1 / atom-solid subscriptions, viewport layout and browser resource lifetimes when changing the turtle-soup UI or Jev integration.
---

# Project Architecture

## Ownership

- Inspect the affected source and configuration before changing behavior.
- `packages/core` owns domain schemas, rules, session state (`session.ts`), settings use cases and the SettingsStorage service contract (`settings.ts`), official DecisionModel provider contracts, internal Jev transport, model-management interfaces and question/solution use cases. `apps/web` owns rendering, the runtime/Solid/DOM adapter, static puzzle JSON and the localStorage-backed `SettingsStorageLive`.
- Core has no Solid, DOM or localStorage dependency. Its submission use cases return only player-visible content and game status; UI must not build payloads, map model answers to labels or receive hidden facts from those use cases.
- Remain a pure static SPA: no SSR, server functions, backend, proxy, database, authentication or router.
- Browser calls the full user-configured endpoint with their key. Validate untrusted answers, display fixed labels, and reveal neither truth nor judgmentPoints before ending the game. Partial solutions never identify missing facts.

## Effect boundaries

- Prefer the installed Effect APIs for effectful workflows and data processing, not Promise implementations wrapped merely for appearance. Keep one canonical Effect API; execute it at the web boundary. Keep pure scoring synchronous and dependencies acyclic.
- Define domain types from Schema rather than maintaining duplicate interfaces. Use Option for domain absence and session errors, the role-discriminated Message union (only user messages have mode), and exhaustive Match for domain mode/result branches. Keep tagged failures distinct from optional error display state.
- `DecisionSettings` is the legacy-compatible draft/storage shape, not runtime credentials. `resolveDecisionConfiguration` returns a provider-discriminated `DecisionConfiguration`: API url/model/Redacted key or local modelId/backend. Preserve missing-field defaults and blank draft loading; Redacted does not encrypt storage. `saveSettings` validates/normalizes before writing; apply only after successful storage.
- Game use cases depend on official `effect/ai` DecisionModel and Decision definitions. API uses JevDecisionModelLayer/Live; local uses LayaDecisionModelLayer. DecisionClient.request(payload) is internal Jev HTTP transport. Validate configuration at Layer construction and responses with HttpClient/Schema.
- Jev choice answers lacking probabilities receive a compatibility one-hot distribution, not measured probabilities. Do not reinterpret it as confidence or alter label-based all-points scoring. apiModel is configurable; preserve the default for old settings.
- `session.ts` owns SubscriptionRef state, scoped Fibers and Ref-backed identity/duplicate guards. Keep full PuzzleDefinition internal; expose only PuzzleView and Option<GameResult> (truth/reason after solve/reveal), never judgmentPoints in snapshots. Point id/description must be nonblank and point IDs unique within a puzzle; descriptions need not be unique.
- Web owns one AtomRegistry per game owner and reads snapshots through atom-solid RegistryContext/useAtomValue. Keep one ManagedRuntime per configuration; replacement cancels requests and disposes the old runtime without resetting the session. Cleanup cancels work, disposes registry, closes session Scope and disposes runtime. Configuration tests use a separate temporary Layer; scoped local-model acquisition must release resources.
- Keep a few management use cases: saveSettings, testDecisionConfiguration via DecisionConfigurationTester, and prepareLocalModel via LocalModelResources (inspect/download/reinspect). inspect/download/remove are capabilities; do not mechanically turn every button into a use case. Browser adapters implement these interfaces outside core.
- Preserve HTTP(S)-only endpoints without userinfo, omitted credentials, rejected redirects, 30-second timeout, requested answer IDs/allowed choices and finite confidence in [0, 1]. Static schemas do not replace dynamic request-dependent validation.
- Use tagged errors; keep interruption/defects distinct and guard late completion/finalizers by identity. Snapshot mutable inputs across async work. Schema readonly arrays do not freeze aliases.
- Maintain shared versions in the workspace catalog; verify installed exports and peer requirements. Solid 1 and @effect/atom-solid are installed; do not restore obsolete Solid 2 scheduling workarounds.

## UI and Solid 1

- Preserve Tailwind CSS through the Vite plugin and DaisyUI through CSS. Prefer their utilities/components; keep `index.css` limited to framework configuration, theme and essential global styles instead of custom UI classes.
- Prefer HTML/CSS for local presentation state: radio `checked`, Tailwind `checked:` / `has:` variants, and native form validation. Use atom-solid for core snapshots and signals for DOM-local asynchronous feedback and shared presentation state; do not duplicate input values in signals unless reactive consumers need them.
- Use native `<dialog>` with `showModal()`, `method="dialog"` close forms and the native close event; do not emulate modals with checkbox state. Missing API URL or key in API mode opens settings on initial load.
- Desktop: viewport-bounded two columns, puzzle left and chat right; use `min-height: 0` and internal overflow so history does not lengthen the page. Narrow screens: compact stacked panels with independently scrollable content. Keep actions reachable.
- Solving opens a native result dialog automatically. Closing preserves the solved game and visible truth; next puzzle resets dialog dismissal state. Give-up still reveals the truth and disables sending.
- Keep immediate duplicate/stale-response guards in core and the adapter's runtime-acquisition identity; rendering state alone is not a request lock.
- Conditionally mounted native dialogs currently open in guarded queueMicrotask callbacks and close on owner cleanup. Preserve the disposed guard so queued work cannot open an unmounted dialog; this is an actual DOM lifetime pattern, not a claim that Solid 1 lacks onMount.
- Route give-up, reset and cancellation through core session commands; close its Scope on cleanup. Preserve identity checks for outdated responses and finalizers so they cannot change a new game. Dialog-local connection tests still abort on edit/close/cleanup; cover cancel / close / reset.

## Local model and cache

- `packages/local-model` owns Worker-based Transformers.js loading, inference, testing/download and model-specific Cache Storage operations. Keep browser cache APIs out of core. Preserve the three catalog IDs: Laya fp16 on both backends, Verdict WASM q8 / WebGPU fp16 (download both), and d1 text-only q8 ONNX plus external data on both. Reject oversized inputs without truncation: Verdict query/passage each 512 tokens; d1 full prompt 16384 tokens. d1 uses LFM Open License v1.0 with a commercial revenue threshold, not Apache-2.0; see README license link.
- Inspect actual cache completeness, not a localStorage downloaded flag. Cache inspection failure is unknown, not missing: show an error and retry. Download prepares assets; Use tests the selected backend and selects only after success; Save applies configuration separately. Reinspect cache on model change. Reopening with complete cache and matching saved model/backend shows 使用中; changing either requires testing again. Keep button busy labels, not a misleading percentage progress bar or bottom test button.
- Transformers.js 4.3.1 rejects `local_files_only=true` with `env.allowLocalModels=false`. Cache-only inspection/loading must enable local lookup and gameplay must precheck completeness. Downloads must disable local lookup: static SPA fallback may return index HTML for `/models/...`, causing JSON.parse failures. Review global env changes when altering concurrent loading.
- Delete only this model’s cache entries, including partial files, and verify deletion. Do not clear unrelated models or saved settings. Cache deletion does not unload an existing in-memory runtime; later model loading requires a new download. Keep downloads/cache isolated by model. Cancellation removes queued work and ignores active inference results; initialization cancellation, configuration replacement and disposal terminate the corresponding Worker. Closing settings cancels work and suppresses late feedback.

## Static deployment

- GitHub Pages deploys the web build through the existing workflow on `main`. Preserve relative Vite asset paths for repository subpaths; never put a user Jev key in Actions secrets or built assets.
- Before committing new static data or tests, check that `.gitignore` does not exclude them. A local successful build cannot detect files missing from the remote checkout.

## Completion

Check failure retry, no premature truth disclosure, next-puzzle reset, dialog dismissal, panel overflow and keyboard accessibility. For dependency/architecture changes, compare build output with a measured baseline and report size cost rather than assuming Effect reduces the bundle. Read `README.md` for setup, Jev protocol and deployment; do not duplicate endpoint defaults here.
