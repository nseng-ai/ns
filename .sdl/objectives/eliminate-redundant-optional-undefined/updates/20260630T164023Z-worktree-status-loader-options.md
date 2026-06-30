# Worktree Status Loader Options Narrowing

## Summary

Narrowed `worktree-status` loader option shapes so optional loader/dependency fields use omission-only semantics instead of accepting present-key `undefined`:

- `GraphiteMetadataLoaderOptions.signal`
- `GraphiteMetadataLoaderOptions.onDiagnostic`
- `LoadGtStatusOptions.signal`
- `LoadGtStatusOptions.metadataLoader`
- `LoadGtStatusOptions.onDiagnostic`
- `LoadLocalWorktreeStatusOptions.signal`
- `LoadLocalWorktreeStatusOptions.identity`
- `LoadLocalWorktreeStatusOptions.metadataLoader`
- `LoadLocalWorktreeStatusOptions.onDiagnostic`
- `LoadWorktreeGhStatusOptions.signal`
- `LoadWorktreeGhStatusOptions.identity`
- internal `LoadGhStatusInternalOptions.signal`

Construction sites now omit optional keys with conditional spreads before passing loader options through `loadLocalWorktreeStatus`, `loadGtStatus`, `loadWorktreeGhStatus`, and tests. The semantic claim is that these loader option objects are first-party internal worktree-status request objects: absent signal/identity/loader/diagnostic callback already means “use the default or no override,” and present-key `undefined` has no distinct domain or compatibility meaning inside the package.

Metrics:

- Repo-wide typed optional-undefined property count in `ts`: 354 → 345, measured with `rg -n '\?:[^\n;{=]*\| undefined' ts --glob '*.ts' | wc -l`.
- Repo-wide undefined-normalization/check count in `ts`: 2943 → 2952, measured with `rg -n '=== undefined|!== undefined|!= null|== null|\?\? undefined|: undefined' ts --glob '*.ts' | wc -l`.
- Scoped typed optional-undefined count in `ts/packages/worktree-status`: 14 → 5, measured with the same typed query scoped to the package.
- Scoped undefined-normalization/check count in `ts/packages/worktree-status`: 107 → 116, measured with the same normalization query scoped to the package.

Validation:

- `pnpm --dir ts exec tsgo --noEmit --pretty false` passed.
- `pnpm --dir ts --filter @sdl/worktree-status test` passed: 5 files / 57 tests.
- `pnpm --dir ts --filter @sdl/worktree-status check` passed.
- `pnpm --dir ts run fmt:check` passed.

## Objective Impact

This keeps a coherent package-level cleanup slice and reduces the local optional-undefined declaration count while accepting a small increase in explicit omission-building code. That increase is expected under the Objective metric model: construction is now normalized at the boundary before the stricter omission-only option contracts are used.

Preserved/deferred candidates in `worktree-status`:

- `WorktreeStatusExtensionDependencies` remains unchanged because it is an extension dependency injection surface where callers may intentionally pass explicit `undefined` for optional overrides and where compatibility is less obviously internal.
- The remaining `testContext(statuses?: Map<string, string | undefined>)` grep hit is not a redundant optional property: the map value itself deliberately allows `undefined` because `setStatus` can clear a status value.

## Follow-Ups

Future slices can revisit `WorktreeStatusExtensionDependencies` only if they establish an explicit normalized internal dependency boundary or compatibility claim. Do not treat the remaining worktree-status grep hits as mechanically removable.
