# Bun-to-Node TypeScript Migration: Vitest

## Thesis

The Bun-to-Node TypeScript migration needs a focused test-runner slice that replaces package-local `bun:test` usage and `bun test --sequential` scripts with Vitest while preserving the behavior of the existing TypeScript test suites.

This child Objective owns the migration from Bun's test API to Vitest for the pnpm-managed TypeScript workspace. It should make `pnpm --dir ts run test` stop depending on Bun as the test runtime, while keeping package tests understandable, deterministic, and compatible with the Node v24.12+ tooling contract.

## Scope

This Objective covers the Vitest migration for the TypeScript workspace under `ts/`:

- add Vitest test-runner dependencies and configuration where they belong in the pnpm `ts/` workspace;
- replace package-local `"test": "bun test --sequential"` scripts with Vitest-backed scripts for `asdl-dev`, `ccc`, `pi-extension-runtime`, `pi-extensions`, and `planned-branch`;
- convert `bun:test` imports across TypeScript tests to Vitest equivalents while preserving `describe`, `test`, `expect`, lifecycle hooks, and async behavior;
- convert the known Bun module-mocking case in `ts/packages/pi-extensions/test/changes.test.ts` from `mock.module` to an appropriate Vitest mocking shape;
- remove Bun test-runner type dependencies from the active TypeScript workspace when no longer needed;
- update active command documentation or CI assumptions that describe TypeScript tests as Bun-backed;
- record any matcher, lifecycle, module mocking, concurrency, or Node-runtime differences discovered during conversion.

## Non-Goals

- Do not redo the pnpm workspace/package-manager migration; that sibling Objective is already closed.
- Do not decide the Node runtime compatibility story for TypeScript CLIs, Pi extension entrypoints, shebangs, or the Graphite metadata reader except when tests must expose a Vitest-specific compatibility issue.
- Do not reconcile every historical Bun reference in docs, templates, or examples; broad Bun-reference cleanup belongs to the Bun-reference reconciliation child Objective.
- Do not migrate Python tests or Python tooling.
- Do not introduce a build-to-JavaScript workflow merely to run tests unless Vitest/Node evidence proves native TypeScript execution insufficient.
- Do not keep compatibility with Bun's test runner as a first-class requirement after the Vitest migration is complete.

## Completion Criteria

This Objective is complete when:

- `ts/` has the Vitest dependency/configuration needed to run the workspace's TypeScript tests through pnpm and Node-compatible tooling;
- every active package-local TypeScript test script that currently invokes `bun test --sequential` has been migrated to Vitest;
- tests no longer import from `bun:test`, and the known `mock.module` usage has an explicit Vitest equivalent;
- `@types/bun` or other Bun test-runner-only type support is removed from the active TypeScript workspace unless a non-test runtime need is recorded;
- representative package-level and workspace-level test commands pass under the documented Node v24.12+ baseline, with any local lower-Node warnings or skips explained;
- active documentation, CI, and `justfile` references that describe TypeScript tests use Vitest/pnpm terminology rather than Bun test-runner terminology;
- Semantic Updates record the migration evidence and any behavior differences relevant to downstream Node runtime or Bun-reference reconciliation work.

## Assumptions and Risks

Assumptions:

- Node v24.12+ remains the TypeScript tooling baseline inherited from the tooling contract.
- The pnpm workspace contract is already in place: `ts/` is a pnpm workspace for `packages/*`, and root orchestration delegates into it.
- The workspace can use one root `ts/vitest.config.ts` with `vitest` in the root `ts/` dev dependencies; package-local Vitest configs are unnecessary unless later package-specific setup evidence appears.
- Vitest can execute the existing TypeScript tests without requiring built JavaScript artifacts or changing production module boundaries.
- The migration should keep explicit `vitest` imports rather than global test APIs.
- The initial Vitest configuration should preserve the previous `bun test --sequential` posture with `fileParallelism: false`; later concurrency relaxation needs package-specific evidence.
- Most `bun:test` imports map mechanically to Vitest imports, but lifecycle-hook and mocking behavior still need targeted review.
- The current `pnpm --dir ts run test` command is intentionally transitional because package-local test scripts still invoke Bun; this Objective should remove that transitional Bun runtime dependency.

Risks:

- Vitest mocking semantics may not exactly match Bun's `mock.module`; the `@earendil-works/pi-ai` module-mocking test in `pi-extensions` needs careful conversion and evidence.
- Bun and Vitest may differ in module cache reset, fake timers, environment globals, snapshot/matcher details, or async cleanup timing; preserve behavior with targeted tests rather than blind import replacement.
- Tests that pass sequentially under Bun may expose ordering or shared-state assumptions under Vitest; keep serial execution where needed and record any deliberate concurrency policy.
- Removing `@types/bun` may reveal accidental use of Bun-specific runtime types outside tests; classify those findings for Node runtime compatibility rather than silently adding new Bun dependencies.
- Local validation may run on a Node version below the documented `>=24.12.0` baseline; distinguish baseline failures from local environment warnings.

## Open Questions

- What is the least invasive Vitest replacement for the existing `mock.module("@earendil-works/pi-ai", ...)` case?
- After conversion, does any active non-test TypeScript code still require Bun types, or can `@types/bun` be removed entirely from the workspace?
