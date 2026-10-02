---
name: project-testing
description: Verify game and Jev behavior through Vitest, browser-independent Solid 2 signals, fetch/storage mocks and targeted UI lifecycle checks.
---

# Project Testing

- Mirror source responsibilities under each workspace's `test` directory. Core tests own selection, atomic fact scoring, Jev payloads and external response validation; web tests own signals, storage and puzzle data.
- Assert project behavior, not third-party internals. Use simple fetch / localStorage mocks, reset them after each test and avoid live external calls or real credentials in the test suite.
- Cover fixed question labels, all/partial/no fact matches, invalid or missing answers, HTTP/network errors, timeout, caller cancellation and settings validation.
- Cover retries preserving input, no leaked keyFacts, duplicate submission, stale responses after reveal/reset, cleanup abort and complete next-game reset.
- Node state tests resolve the client `solid-js` build via the web Vitest alias. Use `createRoot`, dispose its owner, and call `flush()` after writes or async completion before reading scheduled Solid 2 state. Do not confuse server no-op signals with browser behavior.
- Keep Node tests for browser-independent behavior. Add DOM/browser tooling only for actual rendered interactions; native dialog opening, Escape/close, focus, repeated-game reopening and viewport overflow need rendered verification, not source-string assertions.
- Never use `--passWithNoTests`. Run `pnpm check`, `pnpm test`, `pnpm build`; report separately which checks used mocked responses and whether a real Jev call or browser interaction was verified.
