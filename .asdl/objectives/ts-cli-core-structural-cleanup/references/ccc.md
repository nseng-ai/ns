# ccc package findings

Scope: `ts/packages/ccc/src/**`. The land-stack subsystem is unusually careful
around a genuinely hard problem (atomic, abort-safe stack landing). Type hygiene
is excellent — ZERO `as unknown as`, `any`, or human-facing Graphite display
parsing anywhere in scope (grep-verified; reads are sqlite/`--json` plumbing).
The real issues are structural: a god-function, a duplicated metadata-read path,
and a git-gateway boundary observed in only half the package.

## B1. [BLOCKER] performGraphiteMaintenance is a 270-line four-state-machine god-function

`land-stack/landing-operations.ts:541-809`. One function does: (1) pre-refresh
SHA guard, (2) forced `gt get` (optional-vs-required branch on streaming),
(3) pre-delete children re-check, (4) `gt delete`, (5) `gt restack --upstack`,
(6) expected-SHA bookkeeping, (7) `gt submit`. Threaded by `maintenance.kind`
(`required-next-landing | optional-descendant | skip-descendant | none`)
re-tested at `:551,610,647,668,692,735,668-670`. The `severity: "fail" | "warn"`
axis multiplies every exit through `failOrWarn`.

This is the highest-risk code in the package — it mutates local Graphite refs
*after irreversible merges* — and the least linear. Decompose:
- Split per phase into `guardRefreshTarget`, `forceRefreshStack`,
  `verifyChildrenBeforeDelete`, `deleteLandedBranch`, `restackAndResubmit`, each
  returning `GraphiteMaintenanceOutcome`.
- Resolve `maintenance.kind` → a small plan object once (e.g. `{ refresh:
  branch|none, delete: true, restack: branch|none }`) so phases stop re-switching.
  The repeated `maintenance.kind === "required-next-landing" || === 
  "optional-descendant"` guard (4×) collapses to one boolean.

LAND TEST COVERAGE FIRST — this is the item most needing careful tests before
refactor.

## A1. [HIGH] Two independent Graphite-metadata read paths in one package

- `land-stack/graphite-topology.ts:49-102` reads the Graphite sqlite DB via direct
  `exec(pi, "sqlite3", ["-readonly","-json", dbPath,
  GRAPHITE_BRANCH_METADATA_QUERY])`.
- `worktree-status/graphite-metadata.ts:4-13` reads the *same DB, same
  GRAPHITE_BRANCH_METADATA_QUERY, same parseGraphiteBranchMetadataRows*, through a
  `worker_threads` runner (`createGraphiteSqliteJsonRunner`,
  `classifySqliteJsonResult`).

Both produce parent/children topology from identical source, with two separate
failure-classification ladders (`classifyTopologyReadFailure` at `topology.ts:104`
vs the worker's `GraphiteMetadataUnavailableReason` union) that can drift on the
next Graphite schema change. The building blocks already live in
`@asdl/core/graphite-metadata` (`walkGraphiteAncestors`, `walkGraphiteSubtree`,
`parseGraphiteBranchMetadataRows`).

Remedy: lift `loadGraphiteTopology(runner, dbPath)` into
`@asdl/core/graphite-metadata` returning a discriminated result; both call sites
inject their runner (direct exec vs worker — a legitimate execution-strategy
difference). Delete the duplicated classification logic.

## A2. [HIGH] land-stack ignores GitGateway; worktree-status uses it (boundary split-brain)

`worktree-status.ts:14,552-554` constructs `RealGitGateway` and uses
`git.headCommit`, `git.originUrl`. Meanwhile `land-stack/stack-facts.ts`
hand-rolls the same primitives as raw exec:

- `loadRepoRoot` → `git rev-parse --show-toplevel` (`stack-facts.ts:30`) —
  gateway has `repoRoot()`
- `loadCurrentBranch` → `git symbolic-ref --short HEAD` (`:49`) — `currentBranch()`
- `assertLocalBranchExists` → `git show-ref --verify` (`:274`) —
  `validateBranchRef()` / `localBranchPresence()`
- `resolveMetadataDbPath` → `git rev-parse --git-common-dir`
  (`graphite-topology.ts:33`) — `gitPath()`
- `assertCleanRepo` dirty check → `git status --porcelain=v1` (`:190`) —
  `hasUncommittedChangesUnder()`
- `loadTrunk` → `gt trunk` (`:76`) — `trunkBranch()`

Per the repo's stated git-gateway boundary, land-stack reimplements ~6 facts with
bespoke error strings. Routing through the gateway deletes ~150 lines of
hand-rolled command-display/error-formatting and removes a second
`firstNonEmptyLine` (C1) and a second `isRecord` (C2). Caveat: land-stack's
`pi.exec` shape (`types.ts:57`) is its own narrow interface, not `CommandExecApi`
— but `worktree-status.ts:9` already demonstrates the adapter
(`piExecApiToCommandExecApi`). The two halves should converge on the gateway.

## A3. [HIGH] Divergent PR-loading: raw `gh pr view` parse vs shared github-status helpers

- `land-stack/pr-facts.ts:20-88` runs `gh pr view --json` and hand-parses every
  field in `parsePullRequestSnapshot`.
- `worktree-status.ts:15-22,457-473` uses `runGitHubCli` +
  `parseGithubWorktreePrStatusJson` + `githubRepositoryIdentityFromRemoteUrl` from
  `@asdl/core/github-cli` / `@asdl/core/github-status`.

land-stack needs different fields (merge gating) so the snapshot shape may
legitimately differ — but the fetch + envelope + repo-identity mechanics should
reuse `@asdl/core/github-cli`, not a parallel raw-`gh` path with its own
JSON.parse.

## B2. [MED] nextGraphiteMaintenance and nextForcedRefreshBranchAfterMaintaining encode the same ordering twice

`landing-operations.ts:881-919`. Both reconstruct the stack's forced-refresh
sequence independently (`nextForcedRefreshBranchAfterMaintaining` rebuilds the
identical `[...landingBranches, ...remainingLandingBranches, ...descendant]` order
and does an `indexOf`). Build the ordered refresh list once on the plan and index
into it from both call sites.

## B3. [MED] gt restack/submit argument vectors duplicated across files

`["restack","--branch",b,"--upstack","--no-interactive"]` at
`landing-operations.ts:740` and `:853`, and `landing-plan.ts:229`
(`restackForSubmitArgs`). The submit vector (`submit --branch … --no-stack
--update-only --no-edit --no-ai --no-interactive`) at `landing-operations.ts:781`
and `:860` and `landing-plan.ts:216` (`submitUpdateArgs`). `landing-plan.ts`
already exports the canonical builders — `landing-operations.ts` should import
them rather than re-inline (the inlined `optionalDescendantRefreshDeferredWarning`
copy at `:853/:860` is especially easy to let drift).

## C1-C3. [LOW] small dedup / sentinels

- `firstNonEmptyLine` reimplemented at `stack-facts.ts:312` and
  `dispatch-from-trunk.ts:193` (byte-for-byte; both parse single-value `gt trunk`
  plumbing — acceptable mechanically). Promote one to a shared util.
- `isRecord` reimplemented at `worktree-status.ts:296`, `pr-facts.ts:90`; the
  canonical one already exists in `@asdl/pi-extension-runtime/cmux/primitives`
  (imported at `graphite-metadata.ts:14`). The two hand-rolled copies should
  import it.
- `emptyResult()` (`errors.ts:64`) constructs a fake `code:1` ExecResult purely so
  a formatter has something to render — can leak "exit 1" for a command that never
  ran. Prefer making the formatter accept `result: ExecResult | undefined` (it
  already does at `command-exec.ts:87`) and drop the sentinel.

## File size / modularity

- D1. `landing-operations.ts` (1010) — presumptive blocker, but a large fraction
  is failure/warning message construction (`formatSubmitUpdateDetails`,
  `formatRemaining*` ×3, `optionalDescendantRefreshDeferredWarning`,
  `skippedDescendant*Warning`, roughly `:187-260,:847-957`), not control flow.
  Split: `merge-loop.ts` (`prepareMergeLoopState`, `runMergeLoop`),
  `graphite-maintenance.ts` (`performGraphiteMaintenance` decomposed per B1),
  `pre-merge.ts` (`confirmAndSubmitRequiredPrUpdates`, `confirmAndFreeManagedSlots`,
  `residualPreMergeFailure`). Move `format*Warning`/`format*Requirements` into
  `presentation.ts` (which already owns this concern, `presentation.ts:1-60`).
  Drops the file well under 600 and stops mixing message-English with ref-mutation.
- D2. `land-stack.ts` (558) vs `land-stack/landing-operations.ts` — the
  orchestrator/engine split is coherent. The one leak: `presentLandStackFailure`
  threaded as an explicit param-bag through *every* early return in both
  `executeSinglePlanLanding` and `executeChunkedStackLanding` (`land-stack.ts:100,
  125,194,202,222,285,304,317,344,373,399,456,475,490,501` — 15 call sites). The
  classic "error-presentation isn't part of the result type" smell. Have the inner
  functions return `LandStackResult<void>` (most already do) and present *once* at
  the top of `executeStackLanding`. Roughly halves the chunk-loop branching.
- D3. `cmux/slot-dispatch-plan.ts` (548) mixes orchestration with ~180 lines of
  formatting. Flow: `handleCommand`/`createAttachSlotAndLaunch`/
  `openBranchInCmuxSurface` (`:134-334`); presentation: `formatDryRun`,
  `formatFinalSuccess`, `formatSurfaceSuccess`, `formatLaunchPreview`,
  `formatUsage`, `formatCmuxSurfaceFailure` (`:365-548`). Extract the latter into
  `slot-dispatch-plan-presentation.ts`. The two success formatters
  (`formatFinalSuccess` vs `formatSurfaceSuccess`, `:404/:423`) are near-identical
  and should share a base.
- D4. `worktree-status.ts` (808) is cohesive (load → combine → format), not a
  blocker. Only real factoring: the git-file-path walker (`:769-808`) and identity
  helpers (`:415-544`) could move to `worktree-status/git-paths.ts`. Low priority.

## E1. [POSITIVE FINDING — no action] Landing is already structured for half-applied-state safety

`runMergeLoop` snapshots `expectedShas` up front (`prepareMergeLoopState` →
`writeLandBackupRefs`, `landing-operations.ts:379-393`), and
`performGraphiteMaintenance` refuses destructive `gt get --force`/`gt delete`
whenever a branch moved (`:571`) or grew unexpected children (`:672`) since
planning. The merge→verify→cleanup ordering (`:432-491`) verifies the PR actually
merged *before* deleting local branches. The sequential `for` loop at `:416` is
intentional (each PR rebases onto trunk after the prior merges) — a hard
correctness constraint, NOT a missed `Promise.all`. Preserve all of this through
the B1 decomposition.

## Ranked top actions

1. B1/D1 — decompose `performGraphiteMaintenance`, split `landing-operations.ts`.
2. A1 — collapse the two metadata read paths into one shared core loader.
3. A2 — route land-stack git facts through `GitGateway`.
4. A3 — unify GitHub access on `@asdl/core/github-cli`.
5. D2 — present failures once instead of threading through 15 sites.
6. B2/B3/C1/C2 — dedupe refresh-order, gt arg vectors, `firstNonEmptyLine`,
   `isRecord`.
