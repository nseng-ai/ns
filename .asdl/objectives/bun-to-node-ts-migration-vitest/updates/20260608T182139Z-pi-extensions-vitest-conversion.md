# Pi Extensions Vitest Conversion

## Summary

`ts/packages/pi-extensions` now uses Vitest for its package-local test script and test API imports. The package-local `test` script runs Vitest from the `ts/` workspace root with the shared `vitest.config.ts` and a `packages/pi-extensions/test` path filter.

The behavior-sensitive `ts/packages/pi-extensions/test/changes.test.ts` module mock was converted from Bun's `mock.module("@earendil-works/pi-ai", ...)` to a Vitest `vi.mock(...)` registration. The test keeps top-level dynamic imports of `../src/changes.ts` and `../src/changes-model-summary.ts` after the mock registration, and the mock delegates `completeSimple()` through a `vi.hoisted` mutable state object so each test can set its own `nextCompletion` behavior.

The Bun-specific `toBeFunction()` matcher assertions in `ts/packages/pi-extensions/test/objective.test.ts` were replaced with standard `typeof ... === "function"` assertions while retaining the existing explicit guards.

Validation evidence:

- `pnpm --dir ts --filter @asdl/pi-extensions run test` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test` passed across the workspace's Vitest-backed package scripts.
- `rg -n "from ['\"]bun:test['\"]" ts/packages --glob '*.ts'` returned no matches.

Local validation still ran on Node `v24.2.0`, below the workspace baseline `>=24.12.0`, so pnpm emitted the expected unsupported-engine warning. `pi-extensions` tests also emitted Node type-stripping experimental warnings under the local runtime; the tests otherwise passed.

## Objective Impact

This completes the active `bun:test` import and package-local script conversion across all five TypeScript packages in scope. It also completes the known Bun-specific mocking and matcher conversion work for `pi-extensions` with targeted validation of the package and the full workspace test command.

The Objective can now move to cleanup: removing Bun test-runner-only type/config/lockfile support and updating CI/agent guidance that was only needed for transitional Bun-backed test scripts.

## Follow-Ups

- Remove obsolete Bun test-runner support, including `@types/bun`, the `bun` tsconfig type entry, and the transitional CI Bun install step, if no non-test runtime need remains.
- Update active agent/command guidance so current TypeScript package tests are described as Vitest-backed.
- Record final workspace validation and any intentionally retained out-of-scope Bun references.
