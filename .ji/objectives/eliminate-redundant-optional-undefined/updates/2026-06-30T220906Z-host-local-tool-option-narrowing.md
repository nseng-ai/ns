# Host and Local Tool Option Narrowing

## Summary

Narrowed a coherent Pi host/local tooling slice by removing redundant explicit `undefined` from omission-only option/context properties:

- `CliCommandExtensionAPI.events` in `ts/packages/hosts/pi/src/commands/cli-extension.ts`
- `emitSessionStart` helper `sessionFile` and `entries` options in `ts/packages/hosts/pi/test/harness-session.test.ts`
- `RunnerSubagentOptions.model` in `ts/packages/local-pi-tools/runner-subagents/src/extension-api.ts`
- `GrillAskExecutionOptions.signal` in `ts/packages/local-pi-tools/grill/src/extension.ts`
- `ObjectiveSelectionCommandContext.hasUI` in `ts/packages/objective/src/api.ts`
- plan slug/repo identity `signal` options in `ts/packages/plans/src/content-slug-derivation.ts`, `ts/packages/plans/src/saved-plan-content-slug.ts`, and `ts/packages/plans/src/saved-plan-file.ts`

Construction paths already treated absence as omission/branching. Two plan-store repo identity calls and the grill tool executor now omit `signal` instead of passing a present `undefined` key under `exactOptionalPropertyTypes`.

Scorecard:

- Repo-wide typed optional-undefined property count (`rg -n "\\?: [^;=\\n]*\\| undefined" ts | wc -l`): 98 → 90.
- Scoped typed optional-undefined property count (`ts/packages/hosts/pi ts/packages/local-pi-tools ts/packages/objective ts/packages/plans ts/packages/capability-pi`): 25 → 17.
- Repo-wide undefined-normalization/check count (`rg -n "\\.\\.\\.\\([^\\n]*=== undefined|!== undefined|!= null|== null|\\?\\? undefined|: undefined" ts | wc -l`): 2080 → 2083.
- Scoped undefined-normalization/check count (same scoped package set): 653 → 656.

Validation passed:

- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `pnpm --dir ts exec vitest run packages/hosts/pi/test/harness-session.test.ts packages/local-pi-tools/runner-subagents/test/runner-subagent-process.test.ts packages/local-pi-tools/grill/test packages/plans/test/saved-plan-content-slug.test.ts`

## Objective Impact

This advances the continuous cleanup row with a semantic internal tooling slice rather than a broad syntax sweep. The typed optional-undefined count dropped by 8 in both repo-wide and scoped views. The normalization/check count rose by 3 because producers now explicitly omit optional `signal` fields before passing narrowed option objects, which is expected temporary normalization debt under the Objective's metric policy.

Preserved/deferred categories remain: env/process maps, callback value parameters that intentionally accept `undefined` to clear state, optional callback parameters/return unions, and public SDK/kernel option mirrors without a separate internal normalized type.

## Follow-Ups

Continue inventorying adjacent internal Pi/tool option shapes. Defer public SDK/kernel command surfaces and env maps unless a later slice introduces a normalized internal boundary with explicit construction evidence.
