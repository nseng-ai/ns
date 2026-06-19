# TypeScript Fast Test Boundaries

## Thesis

The TypeScript test suite should make the fast local/default path mostly fake-driven and deterministic while preserving real-adapter coverage in clearly separated integration tests. Tests that exercise real Git, sqlite, Node process startup, real sleeps, wall-clock expiry, or other slow runtime behavior should be easy to run intentionally, but should not slow down the default local `vitest` workflow. A small TypeScript-native clock seam should make wall-clock-dependent logic testable by advancing a manual clock rather than sleeping.

## Scope

- Establish a clear TypeScript test layout for separating unit/fake-driven tests from integration tests.
- Move or reclassify slow real-adapter tests that currently run in the default Vitest suite, especially:
  - `packages/brmem/test/gateways/real-git-gateway.test.ts` real Git subprocess coverage.
  - `packages/pi-extensions/test/node-runtime-imports.test.ts` and package `node-runtime-cli.test.ts` smoke tests that spawn cold Node processes.
  - `packages/slot/test/gateways/real-gt-gateway.test.ts` and worktree-status sqlite fixture coverage.
- Refactor gateway tests that remain under normal gateway/unit paths to mock or inject command/sqlite/process seams instead of spawning real commands.
- Add a minimal shared `@asdl/core/clock` seam for testable wall-clock logic:
  - `Clock` with `nowMs(): number` and `systemClock` in an explicit `@asdl/core/clock` subpath export.
  - `createManualClock(startMs)` in `@asdl/core/testing`, exposing a production-typed `clock` plus test-only `setMs` and `advanceMs` controls.
- Use the clock seam for touched time-based TypeScript logic so tests can simulate time passing without real sleeps or Vitest fake timers.
- Add or adjust Vitest scripts/configuration so integration tests have a separate local command and a separate CI step, and are excluded from the default local test command.
- Preserve meaningful end-to-end confidence by keeping representative real Git/sqlite/Node smoke coverage in the integration suite.

## Non-Goals

- Do not migrate every existing `Date.now()` or `new Date()` call in the TypeScript tree.
- Do not add a broad lint/guard rule or mutable global clock override for the initial clock seam.
- Do not add scheduler, interval, debounce, cancellable sleep, or monotonic-clock APIs until concrete call sites justify them.
- Do not remove real-adapter coverage entirely.
- Do not weaken behavior coverage just to make the suite faster; move slow coverage to the right layer and replace default-path coverage with fake-driven tests where needed.
- Do not migrate unrelated Python tests or non-TypeScript test layout as part of this Objective.

## Completion Criteria

- Default TypeScript test execution excludes the identified slow integration-style tests and remains suitable for frequent local use.
- A documented integration-test command exists for the TypeScript workspace.
- CI has a separate step for the TypeScript integration suite, distinct from the default test step.
- `brmem` gateway tests in the default suite use mocked/injected Git command behavior rather than creating real Git repositories or spawning Git.
- Real Git, sqlite, and Node runtime smoke tests still exist in an integration folder or naming convention and can be run intentionally.
- `@asdl/core/clock` exposes the minimal production clock contract and `systemClock` through an explicit subpath export.
- `@asdl/core/testing` exposes `createManualClock(startMs)` so time-based unit tests can advance deterministic time without sleeping.
- Touched time-based operation/core logic accepts a required `clock: Clock` dependency and uses `new Date(clock.nowMs())` only for boundary timestamp conversion.
- Previously parked timeout-sensitive default-path tests, including the `packages/asdl-core/test/exec.test.ts` issue where applicable, are either made fast through clock injection or explicitly documented as still out of scope with a remaining rationale.

## Assumptions and Risks

Assumptions:

- Vitest configuration can express a default suite and an integration suite without fighting the existing pnpm workspace layout.
- Existing real-adapter tests have enough gateway seams to convert default-path coverage to fake-driven tests without large production rewrites.
- A minimal wall-clock seam is enough for the current timeout/expiry-style tests; elapsed/performance timing does not yet require a separate monotonic abstraction.
- CI can run an additional TypeScript integration step without unacceptable maintenance overhead.

Risks:

- Moving tests may accidentally reduce coverage if integration equivalents are not preserved or if default-path fake tests do not assert the same contracts.
- Path/name conventions may be applied inconsistently across packages unless documented clearly.
- Some current tests mix unit assertions with real subprocess setup; splitting them may require careful reshaping rather than simple file moves.
- The clock seam could become a dumping ground if timer, sleep, scheduler, or monotonic concerns are added before concrete call sites require them.
- Optional clock defaults inside core logic would hide real-time dependencies and allow tests to accidentally use wall-clock time.

## Open Questions

- What exact folder/name convention should be adopted for TypeScript integration tests: `test/integration/`, `test/gateways/integration/`, `*.integration.test.ts`, or another convention?
- Should CI run integration tests on every PR or only in selected workflows?
- Which existing timeout-sensitive tests beyond `packages/asdl-core/test/exec.test.ts`, if any, should adopt the clock seam in this Objective rather than wait for later touched-feature work?
