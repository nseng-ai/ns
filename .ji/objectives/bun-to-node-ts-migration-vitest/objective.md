# Bun-to-Node TypeScript Migration: Vitest

## Thesis

The Bun-to-Node TypeScript migration needs a focused test-runner slice that replaces package-local `bun:test` usage and `bun test --sequential` scripts with Vitest while preserving the behavior of the existing TypeScript test suites.

This child Objective owns the migration from Bun's test API to Vitest for the pnpm-managed TypeScript workspace. It should make `pnpm --dir ts run test` stop depending on Bun as the test runtime, while keeping package tests understandable, deterministic, and compatible with the Node v24.12+ tooling contract.

## Scope

This Objective covers the Vitest migration for the TypeScript workspace under `ts/`:

- add Vitest test-runner dependencies and configuration where they belong in the pnpm `ts/` workspace;
- replace package-local `"test": "bun test --sequential"` scripts with Vitest-backed scripts for `asdl-dev`, `ccc`, `pi-extension-runtime`, `pi-extensions`, `planned-branch`, and the post-restack `ts-plans` package;
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
- The workspace can use one root `ts/vitest.config.ts` with `vitest` in the root `ts/` dev dependencies; package-local Vitest configs proved unnecessary for this migration.
- Vitest can execute the existing TypeScript tests without requiring built JavaScript artifacts or changing production module boundaries.
- The migration keeps explicit `vitest` imports rather than global test APIs.
- The Vitest configuration preserves the previous `bun test --sequential` posture with `fileParallelism: false`; concurrency relaxation remains a separate evidence-driven decision.
- Most `bun:test` imports mapped mechanically to Vitest imports; the known lifecycle, matcher, and mocking differences were handled with targeted evidence.
- `pnpm --dir ts run test` now runs the shared Vitest config directly and no longer depends on package-local Bun test scripts.

Risks:

- The `@earendil-works/pi-ai` module-mocking risk was de-risked with a `vi.mock` plus `vi.hoisted` state conversion in `ts/packages/pi-extensions/test/changes.test.ts` and targeted package/workspace validation.
- Known Bun/Vitest matcher and lifecycle differences were addressed without enabling globals or changing production module boundaries; serial file execution remains deliberately retained.
- Removing `@types/bun` did not reveal an active TypeScript test-runner need for Bun types; non-test runtime/shebang compatibility remains out of scope for this Objective.
- Local validation ran on Node `v24.2.0`, below the documented `>=24.12.0` baseline, so pnpm emitted expected unsupported-engine warnings while the commands otherwise passed.

## Open Questions

- Resolved: the least invasive Vitest replacement for `mock.module("@earendil-works/pi-ai", ...)` is a `vi.mock` registration backed by `vi.hoisted` mutable state, preserving the existing dynamic-import ordering.
- Resolved: no active test-runner need for Bun types remained after conversion, so `@types/bun` and the `bun` tsconfig type entry were removed from the active TypeScript workspace.

## Closure

Completed. The `ts/` workspace now runs active TypeScript tests through Vitest, package-local scripts are Vitest-backed, no active `ts/packages/**` test file imports from `bun:test`, and the known Bun `mock.module` case has a Vitest equivalent. Bun test-runner-only type/config/lockfile and CI setup support were removed, while out-of-scope runtime/template Bun references remain for separate migration or reconciliation work.

Evidence: Semantic Updates through `20260608T184809Z-post-restack-additional-vitest-imports.md`; `pnpm --dir ts run check`, `pnpm --dir ts run test`, `just ts-check`, `just ts-test`, and `just dprint-check` passed locally with the expected Node baseline warning under local Node `v24.2.0`.
