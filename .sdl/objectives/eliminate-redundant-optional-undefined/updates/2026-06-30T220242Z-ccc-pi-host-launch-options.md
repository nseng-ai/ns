# CCC Pi Host Launch Options Narrowing

## Summary

Narrowed the remaining safe CCC and Pi host/launch helper optional-undefined fields to omission-only optional properties, with producer normalization where exact-optional type checking needed absent keys to be omitted.

Changed declarations:

- `ts/packages/ccc/src/cli.ts`: `CccCliDeps.commands`, `env`, and `autobranch`, plus `CccCliContext.autobranch`.
- `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts`: `CccSlotDispatchPlanOptions.createBranchContextContext`.
- `ts/packages/ccc/test/ccc-test-harness.ts`: scripted exec helper `ScriptedExec.result`.
- `ts/packages/capability-pi/branch-context/src/host-types.ts`: `BranchContextExtensionOptions.branchContextOperations` and `createBranchContextContext`.
- `ts/packages/capability-pi/handoff/src/launch-flow.ts`: `VerifyHandoffLaunchOptions.failureDetails` and `onUpdate`.

Producer normalization:

- `buildHandoffLaunchTool` now uses `optionalEntry` for `failureDetails` and `onUpdate` before calling `verifyHandoffLaunchTarget`.
- The CCC `step` test helper now omits `result` when no result override is supplied.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                                                                                               | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| --------------------------------------------------------------------------------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                                                                                         |                                77 |                                 86 |                       0 |                                2368 |
| `ts` after                                                                                          |                                67 |                                 86 |                       0 |                                2369 |
| `ts/packages/ccc ts/packages/capability-pi/branch-context ts/packages/capability-pi/handoff` before |                                10 |                                  0 |                       0 |                                 177 |
| `ts/packages/ccc ts/packages/capability-pi/branch-context ts/packages/capability-pi/handoff` after  |                                 0 |                                  0 |                       0 |                                 178 |

Validation:

- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts --filter @sdl/ccc run check` passed.
- `pnpm --dir ts --filter @sdl/branch-context-pi run check` passed.
- `pnpm --dir ts --filter @sdl/handoff-pi run check` passed.
- `pnpm --dir ts --filter @sdl/ccc run test` passed: 10 files / 121 tests.
- `pnpm --dir ts --filter @sdl/branch-context-pi run test` passed: 9 files / 88 tests.
- `pnpm --dir ts --filter @sdl/handoff-pi run test` passed: 8 files / 105 tests.
- `just dprint-check` failed on pre-existing formatting in `.sdl/objectives/eliminate-redundant-optional-undefined/updates/2026-06-30T213602Z-brmem-gateway-filter-options.md`; `just dprint-fix` was tried and then that historical update formatting was reverted to preserve Objective update immutability. The new update file was checked with `dprint check <new update file>`.

## Objective Impact

This clears a coherent host/launch helper cluster across the legacy CCC package and adjacent Pi branch-context/handoff helpers. The semantic claim is that these DI/test-helper/launch-verification fields represent absence by omission; present-key `undefined` has no domain, compatibility, external-schema, or cancellation-seam meaning.

The scoped undefined-normalization/check count increases by one because the CCC test helper now omits `result` explicitly when the optional argument is absent. The handoff launch normalization reused existing `optionalEntry` calls and did not add raw `=== undefined` checks.

Preserved/deferred categories:

- Preserved `Record<string, string | undefined>` env-map value semantics in `CccCliDeps.env`; only the outer optional property contract was narrowed.
- No `AbortSignal`, external schema, GitHub payload mirror, SDK-wide, or Capability Kit-wide contracts were narrowed in this slice.
- Broader `sdl-sdk` and `sdl-capability-kit` candidates remain deferred to a separate compatibility-focused slice.

## Follow-Ups

The scoped CCC / Pi branch-context / Pi handoff raw optional-undefined count is now zero. Future work should choose another coherent package/subsystem cluster rather than reopening these files mechanically.
