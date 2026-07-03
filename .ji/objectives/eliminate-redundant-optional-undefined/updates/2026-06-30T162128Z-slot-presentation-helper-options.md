# Slot Presentation Helper Options Narrowing

## Summary

Narrowed a coherent Slot capability internal presentation/lifecycle helper cluster from explicit present-key `undefined` to omission-only optional properties and parameters.

Changed fields and parameters:

- `cleanup-rendering.ts`: `renderCleanupLines` options (`isDryRun`, `caps`) and `cleanupPreviewLine` / `cleanupResultLine` `caps` parameters.
- `destructive-presentation.ts`: `BuildSlotDestructiveResultBlockInput.body` and `.guidance`.
- `operations/gc.ts`: internal `toGcResult` `isCancelled` option.
- `lifecycle/gc.ts`: `executeGcPlan` `cleanupActions`, `outcomeFromGcPlan` `cleanup`, and `entryFromRecord` `pr` / `message` helper options.
- `lifecycle/free.ts`: `planFreeSlots` `preflightErrors` / `trunkBranch` options and `executeFreePlan` `progress` parameter.
- `lifecycle/release-cleanup.ts`: release-cleanup plan/execute/internal helper `trunkBranch`, `progress`, `prNumber`, and `message` options.

Construction normalization was needed for the narrowed destructive result-block input: renderers in `operations/free.ts`, `operations/gc.ts`, `operations/gt/free-stack.ts`, and `operations/resize.ts` now omit `body` when the detail renderer returns `undefined` instead of passing `body: undefined`.

## Objective Impact

Semantic claim: these Slot presentation and lifecycle-helper fields are internal omission-only shapes. Consumers treat `undefined` as absence and do not distinguish a present optional key with an explicit `undefined` value. The builder already omits output `body` / `guidance`; the remaining producer call sites now do the same before the input type is narrowed.

Scorecard for this slice:

- Repo-wide typed optional-undefined property count (`rg -n --glob '*.ts' '\?:[^;=\n]*\| undefined' ts | wc -l`): 408 before, 387 after.
- Scoped Slot typed optional-undefined property count (`ts/packages/capabilities/slot`): 51 before, 30 after.
- Repo-wide undefined-normalization/check count (`rg -n --glob '*.ts' '=== undefined|!== undefined|!= null|== null|\?\? undefined|: undefined|undefined \?' ts | wc -l`): 2934 before, 2940 after.
- Scoped Slot undefined-normalization/check count: 185 before, 191 after.

The normalization/check metric increased by six because the slice added conditional spreads at producer boundaries before narrowing the internal builder input. This is expected under the Objective metric policy: boundary omission guards may rise before upstream contracts become omission-only.

Preserved/deferred categories:

- Slot process/env/API/gateway surfaces were left alone.
- External/Graphite/GitHub/sqlite JSON mirror test shapes were left alone.
- `cd-directive.test.ts` fixture-builder options remain deferred because they were not needed by this internal presentation/lifecycle slice.

Validation:

- `pnpm --dir ts --filter @sdl/slot run check` passed.
- `pnpm --dir ts --filter @sdl/slot run test` passed: 27 files, 220 tests.
- `pnpm --dir ts run fmt:check` initially found formatting drift in `packages/capabilities/slot/src/operations/gc.ts`; `pnpm --dir ts run fmt` fixed it, and the rerun passed.
- `pnpm --dir ts run lint` passed.

## Follow-Ups

Continue with another coherent internal cluster. Good candidates remain in Slot `context`, `gateway`, and API-like option surfaces, but those need separate classification because some are dependency/API/process-facing and may legitimately accept explicit `undefined`.
