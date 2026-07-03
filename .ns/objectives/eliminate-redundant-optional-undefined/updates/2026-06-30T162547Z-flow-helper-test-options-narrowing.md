# Flow Helper/Test Options Narrowing

## Summary

Narrowed a coherent Flow helper/test cluster from explicit present-key `undefined` to omission-only optional properties.

Changed fields and parameters:

- `shared/ccc-cli.ts`: `CreateFlowCccCliOutputCaptureOptions.mode`.
- `extension-shared-ccc-cli.test.ts`: test-local mirror/fake `FlowCccCliExecOptions.cwd` / `.timeout`, optional runner `exec` options parameter, `RunFlowCccCliOptions.shouldForwardLiveOutput` / `.trustedExec` / `.outputMode` / `.afterExitCode`, `FlowCccCliModule.createFlowCccCliOutputCapture` `mode`, and `ExecCall.options`.
- `land-stack-helpers.test.ts`: `prSnapshot` fixture override `title` and `body`.

No construction normalization was needed. The source helper already conditionally omits `mode` when `outputMode` is absent, fake exec calls already omit `options` when absent, and the land-stack PR snapshot helper uses `overrides.body === undefined` only as fixture omission/default selection while preserving explicit `null` as a meaningful PR body value.

## Objective Impact

Semantic claim: these Flow source/test helper declarations are omission-only internal shapes. Present-key `undefined` has no distinct domain, compatibility, input, or external-conformance meaning for the output-capture mode option or the test-local helper/fake mirror declarations. `null` remains preserved for PR body fixtures where it models a meaningful nullable body.

Scorecard for this slice:

- Repo-wide typed optional-undefined property count (`node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs ts`): 429 before, 418 after.
- Scoped typed optional-undefined property count (`ts/packages/capabilities/flow/src/shared/ccc-cli.ts ts/packages/capabilities/flow/test/unit/extension-shared-ccc-cli.test.ts ts/packages/capabilities/flow/test/unit/land-stack-helpers.test.ts`): 11 before, 0 after.
- Repo-wide undefined-normalization/check count: 2317 before, 2317 after.
- Scoped undefined-normalization/check count: 10 before, 10 after.

Preserved/deferred categories:

- Flow `autoslot.ts` and `slot-checkout.ts` environment-map candidates remain preserved/deferred because `Record<string, string | undefined>` reflects environment value semantics.
- Required fake-record fields that always carry a key whose value may be absent, such as notification/status/widget captured values, were left as required `T | undefined` shapes rather than optional properties.
- Broader Flow autobranch/land-stack/source result shapes were not included in this helper/test mirror slice.

Validation:

- `pnpm --dir ts --filter sdl-flow run check` passed.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/unit/extension-shared-ccc-cli.test.ts packages/capabilities/flow/test/unit/land-stack-helpers.test.ts` passed: 2 files, 34 tests.
- `pnpm --dir ts run fmt:check` passed.

## Follow-Ups

Continue with another coherent internal cluster. Remaining Flow source candidates include autobranch and land-stack/worktree shapes plus environment-map candidates; classify them separately because some may represent command inputs, durable state, or process/environment semantics rather than simple omission-only helper types.
