# TypeScript Integration Test Organization

## Thesis

The TypeScript test suite should make the fast local/default path mostly fake-driven and deterministic while preserving real-adapter coverage in clearly separated integration tests. Tests that exercise real Git, sqlite, Node process startup, or other slow subprocess behavior should be easy to run intentionally, but should not slow down the default local `vitest` workflow.

## Scope

- Establish a clear TypeScript test layout for separating unit/fake-driven tests from integration tests.
- Move or reclassify slow real-adapter tests that currently run in the default Vitest suite, especially:
  - `packages/brmem/test/gateways/real-git-gateway.test.ts` real Git subprocess coverage.
  - `packages/pi-extensions/test/node-runtime-imports.test.ts` and package `node-runtime-cli.test.ts` smoke tests that spawn cold Node processes.
  - `packages/slot/test/gateways/real-gt-gateway.test.ts` and worktree-status sqlite fixture coverage.
- Refactor gateway tests that remain under normal gateway/unit paths to mock or inject command/sqlite/process seams instead of spawning real commands.
- Add or adjust Vitest scripts/configuration so integration tests have a separate local command and a separate CI step, and are excluded from the default local test command.
- Preserve meaningful end-to-end confidence by keeping representative real Git/sqlite/Node smoke coverage in the integration suite.

## Non-Goals

- Do not solve `packages/asdl-core/test/exec.test.ts` timeout slowness in this Objective; that is parked until the separate time-injection abstraction exists.
- Do not remove real-adapter coverage entirely.
- Do not weaken behavior coverage just to make the suite faster; move slow coverage to the right layer and replace default-path coverage with fake-driven tests where needed.
- Do not migrate unrelated Python tests or non-TypeScript test layout as part of this Objective.

## Completion Criteria

- Default TypeScript test execution excludes the identified slow integration-style tests and remains suitable for frequent local use.
- A documented integration-test command exists for the TypeScript workspace.
- CI has a separate step for the TypeScript integration suite, distinct from the default test step.
- `brmem` gateway tests in the default suite use mocked/injected Git command behavior rather than creating real Git repositories or spawning Git.
- Real Git, sqlite, and Node runtime smoke tests still exist in an integration folder or naming convention and can be run intentionally.
- The parked `exec.test.ts` timeout issue is explicitly left unchanged or documented as parked.

## Assumptions and Risks

Assumptions:

- Vitest configuration can express a default suite and an integration suite without fighting the existing pnpm workspace layout.
- Existing real-adapter tests have enough gateway seams to convert default-path coverage to fake-driven tests without large production rewrites.
- CI can run an additional TypeScript integration step without unacceptable maintenance overhead.

Risks:

- Moving tests may accidentally reduce coverage if integration equivalents are not preserved or if default-path fake tests do not assert the same contracts.
- Path/name conventions may be applied inconsistently across packages unless documented clearly.
- Some current tests mix unit assertions with real subprocess setup; splitting them may require careful reshaping rather than simple file moves.

## Open Questions

- What exact folder/name convention should be adopted for TypeScript integration tests: `test/integration/`, `test/gateways/integration/`, `*.integration.test.ts`, or another convention?
- Should CI run integration tests on every PR or only in selected workflows?
