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
- For model-card changes, verify download → Use/test → Save → reopen (in-use indicator), model/backend matching, model-change reinspection, cache failure/retry, deletion → download, cache isolation and close during work.
- Progress tests cover Worker → resources → prepare, unknown totals, file changes, initialization/check stages, throttling and stale-task suppression. In browsers check stable button/helper geometry, narrow-screen long filenames and unknown → known → unknown transitions.

## Local-model regressions and reporting

- Cover complete/partial/missing caches, initial inspection with local lookup disabled, downloads after deletion with local lookup disabled, cache-only rejection without fetches, targeted verified deletion, Laya-only IDs and fp16 on both backends.
- Cover download without model/session/Worker initialization, and model loading without the per-byte weight progress callback. Cover Worker load/test/inference, queued cancellation, ignored active results, disposal and termination on initialization cancellation/configuration replacement.
- For mobile page reloads, distinguish script/network failures, cache-write errors and process termination. Correlate OS termination logs with the reproduction time before claiming memory exhaustion; UI loading labels or missing completion events do not prove the exact internal stage. Never equate disk quota with runtime memory or prescribe cache deletion as a memory fix.
- If application ownership is in doubt, reproduce with one Worker directly calling the installed Transformers.js for the same cached model, dtype and backend, without game/settings code or inference. Failure there supports excluding business logic as a necessary trigger, not proving an upstream bug. Verify loading separately from inference and report device/environment scope without generalizing one observed memory limit. Keep temporary repro pages and persistent tracing out of the final app once diagnosis is complete.
- Compatibility evidence: user-reported iOS Safari OS logs confirmed a WebContent process memory termination. A later isolated direct Transformers.js single-Worker Laya fp16 load reloaded with both WASM and WebGPU, but those later reloads were not separately correlated with new OS logs. This supports an environment/model/runtime limitation without proving an upstream defect or a universal mobile limit. Historical desktop success on the old implementation is not current cross-browser validation.
- Run the checks required by AGENTS.md and report mocks, browser interaction, real-model and live API verification separately. Historical old-Laya compatibility does not validate the current Worker implementation.
