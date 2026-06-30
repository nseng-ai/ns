# Worktree/pr-previews context options

## Summary

Narrowed five internal Pi extension option/context fields from raw optional-undefined to omission-only optional properties:

- `WorktreeStatusExtensionDependencies.timers`
- `WorktreeStatusExtensionDependencies.clock`
- `WorktreeStatusExtensionDependencies.refreshIntervalMs`
- `WorktreeStatusExtensionDependencies.loaders`
- `ExtensionContext.modelRegistry` in `local-pi-tools/pr-previews`

Scorecard:

- Repo-wide typed optional-undefined property count (`rg --glob '*.ts' '\?:[^\n;=]*\| undefined' ts`): `128 -> 123`.
- Scoped typed optional-undefined property count (`ts/packages/worktree-status`, `ts/packages/local-pi-tools/pr-previews`): `6 -> 1`.
- Repo-wide undefined-normalization/check count (`rg --glob '*.ts' '=== undefined|!== undefined|== null|!= null' ts`): `2733 -> 2733`.
- Scoped undefined-normalization/check count (`ts/packages/worktree-status`, `ts/packages/local-pi-tools/pr-previews`): `139 -> 139`.

Validation:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts exec vitest run packages/worktree-status/test packages/local-pi-tools/pr-previews/test` passed: 9 files, 86 tests.

## Objective Impact

This advances the standing cleanup loop by removing explicit present-key `undefined` from internal dependency/context extension fields where absence already means "use default dependency" or "feature unavailable". Construction and consumers already use omission/defaulting semantics (`?.`, `??`, and absence checks), so no producer normalization was needed and the normalization/check metric stayed unchanged.

The remaining scoped typed candidate is `testContext(statuses?: Map<string, string | undefined>)`, which is a test helper parameter rather than part of this extension dependency/context cluster.

## Follow-Ups

- Continue to preserve env maps, abort signals, SDK/public input surfaces, and external payload mirrors unless a normalized internal boundary justifies narrowing.
- Future worktree-status cleanup can evaluate the remaining test helper and footer/result candidates separately, but this slice intentionally stayed limited to internal extension dependency/context fields.
