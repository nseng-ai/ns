# Runner-Subagents Export Narrowing Landed

## Summary

The runner-subagents interface-narrowing row is complete. `@internal/pi-tools` now exports only the meaningful runner-subagents package surfaces:

- `@internal/pi-tools/runner-subagents` for the runtime/root API.
- `@internal/pi-tools/runner-subagents/extension` for the Pi extension surface.
- `@internal/pi-tools/runner-subagents/testing` as the deliberate test-time contract.

The low-level public package export subpaths were removed: `/json-events`, `/presentation`, `/process`, `/runtime`, and `/usage`. Current test-only needs for `RunnerSubagentDispatcherDependencies`, `RuntimeResultV1`, and `createRuntimeConfig` now route through `/runner-subagents/testing` instead of keeping `/process` and `/runtime` public.

The zero-importer `src/runner-subagents/usage.ts` shim was deleted.

## Objective Impact

This resolves candidate 3. `/testing` earns rank as the package's intentional test-time contract for the current runner-subagents and thermo-council tests; `/process` and `/runtime` remain internal implementation modules.

`extension-api.ts` was retained. The previous "pass-through facade" concern was stale against current code: the module is the internal type/API home for runner-subagent result/status types, launch metadata, dispatcher dependency wiring, context types, and `dispatchRunnerSubagent()`, and it is imported by multiple runner-subagents internals.

Verification evidence:

- `rg -n "@internal/pi-tools/runner-subagents/(json-events|presentation|process|runtime|usage)" ts docs .ns/objectives/internal-pi-tools-deepening` found no live references before this Semantic Update existed.
- `rg -n '"\\./runner-subagents/(json-events|presentation|process|runtime|usage)"' ts/packages/internal/pi-tools/package.json` found no removed export-map entries.
- `pnpm --dir ts run test -- packages/internal/pi-tools/test/runner-subagents` passed.
- `pnpm --dir ts run test -- packages/internal/pi-tools/test/thermo-council/thermo-council.test.ts` passed.
- `just ts-format-check` passed.
- `just ts-lint` passed.
- `just ts-check` passed.
- `just ts-test-typescript-style-guard` passed.

## Follow-Ups

None for this row. Context-profiler and thermo-council deepening candidates remain open.
