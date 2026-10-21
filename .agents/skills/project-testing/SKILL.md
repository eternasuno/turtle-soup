---
name: project-testing
description: Verify core Effect sessions, settings and Jev contracts plus the Solid 1 / atom-solid runtime/DOM adapter through Vitest, injected services and targeted UI lifecycle checks.
---

# Project Testing

## Boundaries and method

- Mirror source ownership under each workspace's `test`: core domain/session/settings/transport; web runtime/Solid/localStorage/DOM/puzzle data; local-model loading/Workers/caches.
- Use `@effect/vitest` / `it.effect` for Effect computations and ordinary Vitest for UI integration. Inject official DecisionModel Layers and existing storage/resource/test capabilities rather than mocking core modules or adding services solely for tests.
- Use controlled HttpClient/Fetch, Transformers.js, Cache Storage and Worker fakes; reset mocks/globals. Never use real credentials or `--passWithNoTests`.
- Assert observable contracts, not framework scheduling or source strings. Verify request construction once per operation, parameterize distinct outcomes, and merge tests only when boundary and regression coverage match.
- Use TestClock/Fiber/Deferred for Effect timeout/interruption; wait for work to start and assert abort plus typed failure versus interruption. Avoid arbitrary sleeps.

## Core and API regressions

- Cover fixed labels, all/partial/no fact matches, invalid/missing answers, HTTP/network failures, timeout and cancellation. Validate nonblank point IDs/descriptions, unique IDs (not descriptions), mutable fact snapshots, Option absence and message roles.
- Exercise official provider Layers with complete response fixtures: configurable apiModel, full URL without appended paths, JSON-object state, requested IDs/choices, required model/confidence/probabilities and invalid bounds/distributions. Extra answers are ignored by the official provider, not rejected.
- Under an active span, inspect fetch headers: Bearer remains, b3/traceparent do not. Assert credentials/redirect policy and the 30-second timeout through response decoding.
- Session tests cover retry preserving input, no hidden snapshot fields, result only after solve/reveal, duplicate submit, reveal/reset cancellation and scoped cleanup. Complete old A with success/failure while new B is pending: B must remain loading without A's messages/errors. Verify full next-game reset.
- Settings tests cover legacy storage-key fallback, missing-field defaults, blank drafts, configurable apiModel, malformed/unavailable storage and provider-discriminated runtime configuration with Redacted keys. Save validates/normalizes before writing; invalid settings never write and failed writes never apply.
- Test save/test/prepare through injected capabilities, including complete-cache skip and inspect → download → reinspect. Preserve distinct progress forwarding and cache-verification stage coverage.

## Web and rendered behavior

- Node adapter tests must resolve the client Solid build via the Vitest alias. Use createRoot and dispose owners; wait for observable completion. Verify AtomRegistry/subscription cleanup, runtime reuse/replacement without session reset, scoped model release and immediate duplicate-submit blocking.
- Configuration tests use the unsaved draft without applying it, block repeated clicks, and cancel/suppress stale feedback on edit/provider change/close/cleanup. Core tester mocks do not prove dialog behavior.
- Native dialog opening, Escape/close, focus, result reopening, desktop/mobile overflow and keyboard access require rendered verification; Node mocks do not validate layout or native setters.
- For model-card changes, verify download → Use/test → Save → reopen (使用中), model/backend matching, model-change reinspection, cache failure/retry, deletion → download, cache isolation and close during work.
- Progress tests cover Worker → resources → prepare, unknown totals, file changes, initialization/check stages, throttling and stale-task suppression. In browsers check stable button/helper geometry, narrow-screen long filenames and unknown → known → unknown transitions.

## Local-model regressions and reporting

- Cover complete/partial/missing caches, initial inspection with local lookup disabled, downloads after deletion with local lookup disabled, cache-only rejection without fetches, targeted verified deletion, Laya-only IDs and fp16 on both backends.
- Cover Worker load/test/download/inference, queued cancellation, ignored active results, disposal and termination on initialization cancellation/configuration replacement.
- Run the checks required by AGENTS.md and report mocks, browser interaction, real-model and live API verification separately. Historical old-Laya compatibility does not validate the current Worker implementation.
