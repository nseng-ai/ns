# Graphite Internal Option Narrowing

## Summary

Narrowed omission-only internal `@sdl/graphite` option/dependency fields by removing redundant explicit `| undefined` from:

- `GraphiteCommandRunParams.timeoutMs`, `onStdout`, and `onStderr`;
- the private `execOptions` callback fields in `branch.ts`;
- `LoadGraphiteMetadataStatusInWorkerOptions.timeoutMs`, `workerFactory`, `timers`, and `onDiagnostic`;
- `LoadGraphiteMetadataStatusOptions.dbAccess` and `branchAccess`;
- `RealGraphiteStackGateway` constructor options `execApi` and `metadataDbAccess`.

The semantic claim is that these Graphite command/metadata seams use omission to request defaults or omit optional callbacks; present-key `undefined` has no separate domain meaning. Existing `env` and `signal` contracts remain explicit because they are process/abort compatibility seams. Typecheck exposed two construction paths that were still passing maybe-undefined callback fields, so those builders now omit `onStdout`/`onStderr` and worktree-status `onDiagnostic` when absent.

## Objective Impact

Primary typed optional-undefined metric (`rg -n "\\?: [^;=\\n]*\\| undefined" ts/packages --glob '*.ts' | wc -l`):

- Repo-wide `ts/packages`: 113 -> 105.
- Scoped `ts/packages/infra/graphite/src`: 8 -> 0.

Supplemental line audit (`rg -n "\\?: .*\\| undefined" ...`) catches callback-function declarations that the primary metric misses; the scoped Graphite source line audit went 13 -> 0, matching the 13 narrowed declarations above.

Undefined-normalization/check metric (`rg -n "=== undefined|!== undefined|\\?\\? |\\?\\.|\.\.\.\\([^\\n]*undefined" ... | wc -l`):

- Repo-wide `ts/packages`: 6090 -> 6093.
- Scoped `ts/packages/infra/graphite/src`: 70 -> 72.

The normalization/check count rose because this slice added conditional spreads to omit callback/diagnostic keys after narrowing the contracts. That is expected Objective progress: the new checks sit at construction boundaries and preserve exact-optional-property semantics.

Validation:

- `pnpm --dir ts --filter @sdl/graphite run test`: passed (3 files, 43 tests).
- `pnpm --dir ts run check`: passed after adding omission builders.
- `pnpm --dir ts --filter @sdl/worktree-status run test`: passed (5 files, 57 tests) for the adjusted Graphite loader callsite.
- `pnpm --dir ts run fmt:check`: passed.

## Follow-Ups

Preserved `env`/`signal` explicit-undefined contracts in Graphite because they model external process and abort seams. Deferred other SDK/capability/public option bags and unrelated test fakes for separate semantic slices rather than batching by syntax.
