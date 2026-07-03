# sdlcc Stack Map Internal Results Narrowing

## Summary

Narrowed a small `ts/packages/hosts/sdlcc` internal-result slice by removing redundant explicit `| undefined` from three omission-only optional declarations:

- `StackMapGraphBranch.validationResult?: string`
- `StackMapCmuxActivationExecutor.openNew(..., slot?: StackMapSlotAssignment)`
- `SdlccCmuxReportResult` failed variant `commandFailure?: SdlccCmuxReportCommandFailure`

The `StackMapGraphBranch` parser now uses `optionalEntry("validationResult", validationResult)` so absent validation data is omitted instead of materializing `validationResult: undefined`. The fallback synthetic branch also omits `validationResult`.

Scoped `sdlcc` candidate count from `rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/hosts/sdlcc --glob '*.ts'` moved from 41 to 38.

Validation passed:

- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run check`
- `pnpm --dir ts/packages/hosts/sdlcc run test` (6 files, 66 tests)

## Objective Impact

This advances the standing optional-undefined cleanup loop with a coherent host-internal slice. The semantic claim is that these three narrowed sites are internal result/helper shapes where absence is already modeled by omission or a real value, not by meaningful present-key `undefined`.

Preserved/deferred categories in the same cluster:

- `cwd`, `env`, `runCommand`, `slotClient`, and similar dependency/options bags remain loose because accepting explicit `undefined` is compatible caller behavior.
- `CmuxReportEnvironment` remains an environment mirror where variables may be present with `undefined` values.
- Broader stack-map presentation/action types, OpenTUI renderer inputs, tab key descriptors, and test fixture helper options were deferred as separate semantic decisions rather than batched by syntax.

## Follow-Ups

Future slices can classify the remaining `sdlcc` stack-map presentation/action types separately, especially the model fields constructed with `optionalEntry`, but should avoid mixing those with dependency/options/environment bags.
