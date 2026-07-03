# Flow Autobranch/Land-Stack Clock and Path-Injection Option Narrowing

## Summary

Narrowed seven omission-only dependency-injection optional properties in
`ts/packages/capabilities/flow` from raw `?: (...) | undefined` to plain omission-only
optional properties, and fixed two forwarding call sites that previously passed a
present-key `undefined` value into the narrowed contracts:

- `ts/packages/capabilities/flow/src/land-stack/worktrees.ts`:
  `DetectWorktreeConflictsOptions.normalizePath`
- `ts/packages/capabilities/flow/src/land-stack/stack-facts.ts`:
  `DetectInProgressOperationOptions.pathExists`
- `ts/packages/capabilities/flow/src/autobranch/latest-commit.ts`:
  `LatestCommitAutobranchInput.now` (plus its forwarding call into
  `runLatestCommitAutobranchTransaction`, now using a conditional spread)
- `ts/packages/capabilities/flow/src/autobranch/latest-commit-transaction.ts`:
  `LatestCommitTransactionInput.now`
- `ts/packages/capabilities/flow/src/autobranch/dirty-worktree.ts`:
  `AutobranchFlowInput.now` (plus its forwarding call into `runAutobranchTransaction`, now
  using a conditional spread matching the file's existing `onPhase`/`readFile`/`stat`
  convention)
- `ts/packages/capabilities/flow/src/autobranch/dirty-transaction.ts`:
  `AutobranchTransactionInput.now`
- `ts/packages/capabilities/flow/src/api/autobranch.ts`:
  `FlowAutobranchCheckpointInput.now` (plus normalizing its `createLatestCommitAutobranchFlow`
  forwarding call site to the same conditional-spread pattern already used two lines below
  for the `runDirtyAutobranchFlow` call)

Semantic claim: every narrowed field is an internal test-clock or path-helper injection seam
consumed with `options.now?.() ?? Date.now()` or `options.<field> ?? default<Field>`.
Present-key `undefined` has no distinct meaning from omission anywhere in this cluster;
callers and tests always either omit the key or pass a concrete function.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                                  | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| -------------------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                            |                                57 |                                 81 |                       0 |                                2298 |
| `ts` after                             |                                50 |                                 81 |                       0 |                                2298 |
| `ts/packages/capabilities/flow` before |                                 7 |                                  0 |                       0 |                                 268 |
| `ts/packages/capabilities/flow` after  |                                 0 |                                  0 |                       0 |                                 268 |

The undefined-normalization/check count is unchanged in both scopes: the two forwarding-call
fixes use truthy conditional spreads (`...(input.now ? { now: input.now } : {})`), matching
this package's existing local convention for sibling fields (`onPhase`, `readFile`, `stat`),
not new `=== undefined` / `!== undefined` comparisons, so this slice added no temporary
normalization debt.

## Objective Impact

This clears the entire scoped `ts/packages/capabilities/flow` raw optional-undefined
inventory (7 → 0) with a coherent single-package DI-seam cluster, and reduces the repo-wide
count by 7 with zero normalization-debt cost. Investigation before this slice also confirmed
the top two remaining repo-wide clusters (`ts/packages/sdl-sdk`, `ts/packages/sdl-capability-kit`)
are public-tier packages (`package.json` `"sdl": {"tier": "sdk"}` / `"tier": "capability-kit"`)
excluded by the Objective's Non-Goals, so this slice deliberately picked the next-largest
safe internal cluster instead.

Tracking-gate note: at slice start, `sdl objective exec tracking-gate` flagged branch
`update-optional-entries-usage` as having unrecorded material progress (one commit,
`4d713cfc3 Normalize optionalEntries usage across TypeScript packages`, touching 29 files
outside this Objective's tracked paths). Investigation showed `git diff a5a2478bf 4d713cfc3`
(master's own tip vs. that branch tip) was empty: the commit's tree is byte-identical to a
commit already merged to `master` under a different hash/message. No unrecorded progress was
actually attributable to that branch, so no additional Semantic Update was written for it;
this update instead records the fresh `capabilities/flow` slice built on top of that state.

Preserved/deferred categories:

- `ts/packages/sdl-sdk/src/{execution,command}.ts` — public SDK tier; deferred per Non-Goals.
- `ts/packages/sdl-capability-kit/src/{git,sdl-command,sdl-context}.ts` — capability-kit
  tier; deferred per Non-Goals.
- `ts/packages/roaster/src/{api,project-config}.ts` — already flagged in a prior Semantic
  Update as a deferred public/API/schema-facing residual.
- `ts/packages/infra/github/{src/cli.ts,test/github-cli.test.ts,src/pr-feedback/types.ts}` —
  likely GitHub API/external payload mirror surfaces; not evaluated in this slice.
- A local, unrelated `detectWorktreeConflicts` function in
  `ts/packages/capabilities/land/src/preflight.ts` (different package/function, same name)
  was confirmed out of scope and left untouched.

## Validation

- `pnpm --dir ts --filter sdl-flow run check`: passed.
- `pnpm --dir ts --filter sdl-flow run test`: passed, 35 files / 354 tests.
- `pnpm --dir ts --filter @sdl/ccc run check`: passed (downstream `sdl-flow/api` consumer
  sanity check; `ccc` never passes a `now` field to `createFlowAutobranchCheckpointFlow`).
- `just ts-format-check`: passed.
- `just ts-lint`: passed.
- `just ts-check`: passed.

## Follow-Ups

- Continue with `ts/packages/infra/github` (`cli.ts`, `github-cli.test.ts`,
  `pr-feedback/types.ts`, 8 combined raw properties) as a candidate next cluster, but
  classify each field carefully first: these likely mirror GitHub API request/response
  shapes and may be legitimate external-conformance surfaces rather than safe internal
  DI seams.
- Do not reopen `sdl-sdk` or `sdl-capability-kit` mechanically; only narrow those if a
  separate compatibility review explicitly approves tightening the public SDK/capability-kit
  tier surfaces.
