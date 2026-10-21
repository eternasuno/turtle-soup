---
name: project-architecture
description: Follow static SPA and core-package boundaries, SolidJS 1 / atom-solid subscriptions, viewport layout and browser resource lifetimes when changing the turtle-soup UI or Jev integration.
---

# Project Architecture

## Domain and Effect

- Core owns schemas, scoring, session state, settings and Decision use cases; web renders their player-visible results, not payloads or model-label mappings.
- Derive domain types from Schema. Use Option for absence/session errors, role-discriminated messages (only user messages have mode), exhaustive Match for domain branches and tagged failures distinct from interruption/defects.
- Keep one canonical Effect workflow, executed at the web boundary; pure scoring stays synchronous. Use installed APIs and workspace catalog versions, not parallel Promise implementations or speculative services.
- `session.ts` owns SubscriptionRef state, scoped Fibers and immediate duplicate/identity guards. Keep PuzzleDefinition internal; expose PuzzleView and ended-only Option<GameResult>, never judgmentPoints. Partial solutions must not reveal missing facts.
- Judgment-point IDs/descriptions must be nonblank; IDs, not descriptions, must be unique per puzzle. Snapshot mutable inputs before async work; readonly types do not freeze aliases.

## Providers and settings

- Gameplay uses official `effect/ai` Decision/DecisionModel: API DecisionModelLayer/Live or local LayaDecisionModelLayer. Compose official TypeSafeClient/TypeSafeDecisionModel Layers; do not recreate their protocol/services.
- API uses the complete TypeSafe System One protocol (not Chat Completions): JSON-object state, top-level model and choice confidence/probabilities. Preserve configurable apiModel and the full endpoint via request URL transformation. Keep local one-hot conversion separate; it is not measured confidence and must not change all-points label scoring.
- Validate configuration at Layer construction and untrusted responses at the boundary. Retain request-dependent ID/choice checks and finite confidence in [0, 1]; do not repeat guarantees already enforced upstream.
- API policy: HTTP(S) endpoints without userinfo, omitted credentials, rejected redirects, 30-second timeout and scoped cleanup covering body decoding. Disable HttpClient.TracerPropagationEnabled for API calls to avoid cross-origin b3/traceparent headers; retain local tracing.
- DecisionSettings is a legacy-compatible draft/storage shape with blank values and missing-field defaults. Resolve provider-discriminated DecisionConfiguration with a Redacted API key; Redacted does not encrypt storage. Validate/normalize before saving and apply only after successful storage.
- Keep saveSettings, testDecisionConfiguration via DecisionConfigurationTester, and prepareLocalModel via LocalModelResources (inspect → download if needed → reinspect). Resource inspect/download/remove remain capabilities, not separate use cases; browser adapters stay outside core.
- Connection tests use unsaved drafts and a temporary Layer, never save/apply or replace the game runtime. Edit/provider change/close/cleanup cancels tests and suppresses stale feedback.

## UI and lifetimes

- One AtomRegistry per game owner; read snapshots through RegistryContext/useAtomValue. Reuse one ManagedRuntime per configuration; replacement cancels/disposes the old runtime without resetting the session. Owner cleanup cancels work, disposes registry/runtime and closes the session Scope. Scoped model acquisition must release resources.
- Route give-up/reset/cancel through core commands. Keep adapter runtime-acquisition identity and stale response/finalizer guards; rendered loading state is not a request lock.
- Preserve Tailwind/DaisyUI. Prefer native HTML/CSS state and validation; use signals only for reactive UI state and atom-solid for session snapshots. Keep global CSS to framework setup, theme and essential styles.
- Desktop: viewport-bounded puzzle/chat columns with internal scrolling and `min-height: 0`. Narrow screens: compact stacked panels; keep actions reachable.
- Use native dialogs and close events. Missing API URL/key opens settings initially. Solving opens results; closing preserves the ended game/truth, next puzzle resets dismissal, and give-up reveals truth and disables sending.
- Queued dialog opening must guard owner disposal; close dialogs on cleanup. Preserve keyboard/focus behavior, not checkbox-based modal emulation.

## Local model and cache

- Support Laya fp16 on WASM/WebGPU through Workers. Read legacy settings as drafts but reject unsupported runtime models without fallback; never auto-delete old caches.
- Inspect actual cache completeness. Inspection failure is an error/retry state, not missing. Download prepares assets; Use tests the selected backend and selects only on success; Save applies separately. Reinspect on model change. Show the in-use indicator only with complete cache and matching saved model/backend; changing either requires testing again.
- Downloads must stream assets into Cache Storage without creating a model, inference session or inference Worker. Keep download progress separate from runtime initialization. Do not pass a per-byte progress callback to `AutoModel.from_pretrained`: the installed Transformers.js callback path manually buffers weights and may repeatedly copy growing buffers when sizes are unknown. This avoids that path, not all runtime copies or browser buffering.
- Mobile browsers can terminate a page during model loading or inference under process memory limits; Workers and WebGPU do not guarantee lower peaks or exemption. Asset size and free disk space are not runtime memory budgets. Avoid overlapping model instances and unnecessary full-weight copies; do not promise mobile compatibility or a universal memory ceiling. Offer API mode when local loading cannot fit.
- Progress is per file, not an estimated overall percentage. Use a fixed-size filled action button and fixed two-line filename/bytes helper; unknown sizes, initialization and cache verification show a spinner/stage. Truncate filenames with a full title; do not add a separate bottom test button.
- Cache-only lookup must enable `env.allowLocalModels` and gameplay must precheck completeness. Downloads disable local lookup to avoid SPA HTML fallback under `/models/...`. Serialize/review shared env changes during concurrent loading.
- Delete only the selected model's entries, including partial files, and verify deletion. Preserve other caches/settings. Deletion does not unload an existing runtime; later loading needs another download.
- Cancellation removes queued work and ignores active inference results; initialization cancellation, configuration replacement and disposal terminate the Worker. Closing settings cancels work and suppresses late feedback.

## Puzzle authoring

- Keep puzzle data in `apps/web/src/data/puzzles.json` and attribution in `puzzle-sources.json`. Each puzzle has a unique `id`, `title`, `surface`, `truth` and nonempty `judgmentPoints` array of `{ id, description }`. Each point must be explicitly supported by the truth and represent a material fact; all points must match to solve.
- Preserve source authors, question and accepted-answer links, original licenses and adaptation notices. Puzzle adaptations use CC BY-SA 4.0 separately from MIT application code; retain attribution and ShareAlike obligations. Static assets contain the answers, so do not promise anti-cheat protection.

## Deployment and verification

- Preserve relative Vite asset paths for GitHub Pages subpaths; never include user keys in Actions or built assets. Check new data/tests are not ignored before committing.
- Verify retry, hidden facts, reset/dialog dismissal, overflow and keyboard access on affected paths. Measure against a baseline before claiming bundle-size improvements; do not infer them from architecture or library choice.
