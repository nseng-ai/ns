# Land Domain extraction — inventory and migration map

## Summary

The inventory row's deliverable: a full map of Flow Land Execution behaviors
against Land Gateway Set coverage, with a proposed slice decomposition for
the migration row. Produced by a read-only investigation (no source files
changed), parent-recorded. Paths are relative to
`ts/packages/capabilities/flow/`.

### Headline findings

- **Only preflight planning has migrated.** Every mutation still runs
  Flow-side on `pi.exec` / the operation-shaped command channel. The domain
  core hard-skips merge: `land/preflight.ts:166` emits
  `"merge execution remains in Flow"`. The two mutation methods on
  `LandGraphiteGateway` (`prepareSubmitUpdate`, `prepareRestackForSubmit`)
  are wired as no-op stubs (`land-context-adapter.ts:72-73`) and never
  called.
- **The `src/land/` directory is not the domain boundary.** Only
  `{api.ts, preflight.ts, results.ts, types.ts, testing.ts}` are the Land
  Domain Core; `landing-dispatch.ts`, `isolated-fast-path.ts`, and
  `post-landing-slot-cleanup.ts` are Flow Land Execution that merely lives
  there and imports `land-stack/` internals.
- **Five modules cross the boundary today** (target: exactly one):
  `landing-plan.ts` (the intended Flow Stack Preflight Adapter),
  `plan-mapping.ts`, `land-context-adapter.ts`, `pre-merge-submit.ts`
  (which builds a *second* mid-execution `LandContext` at `:72`), and
  `pr-facts.ts` (imports/re-exports `collectPrSubmitRequirements`).
- **Gateway gaps are concentrated in mutations**: GitHub squash-merge, git
  ref writes (backup refs), five Graphite maintenance operations, and a
  wholly absent slot-action seam (`LandWorktreeSlotFactsGateway` is
  facts-only).
- **Adapter fidelity bugs that will bite during migration**: `stackShape`
  circularly calls Flow's whole `loadLandingShape`; `listLocalBranches`
  fabricates `sha: ""`; `toLandFailure` collapses every failure to
  `code: "flow-adapter-failure"`, `phase: "preflight"`.
- `pr-facts.ts:98 validateInitialPrPreflight` is production-dead (test-only
  imports).

### Behavior map (classification / today's home / gateway coverage)

- **B1 Command presentation** — presentation, stays Flow-side.
  `core/land-stack.ts` (parseArgs/completions/renderer),
  `land-stack/presentation.ts`, `land-presentation.ts`,
  `command-stream.ts`, `commands/land.ts`.
- **B2 Stack-mode orchestration** — mixed; phase sequencing is execution
  (domain already models `LandingPhase`), interleaved presentation stays.
  `land/landing-dispatch.ts`, `core/land-stack.ts:64`,
  `land-stack/landing-plan-execution.ts`, `landing-coordination.ts`.
  Migrates LAST. Duplication: the nothing-to-land check exists three times
  (`landing-dispatch.ts:50`, `land/preflight.ts:40`,
  `plan-mapping.ts:147`).
- **B3 Prompts/confirmation** — presentation, stays Flow-side by design
  (`LandContext` deliberately has no prompt seam); migrated execution must
  expose decision points as plan data (already largely present).
- **B4 Preflight planning** — execution, already migrated
  (`land/preflight.ts`). Residual Flow duplicates serve mid-execution
  re-checks: `pr-facts.ts:148 validateOpenPrBasics` (live),
  `worktrees.ts:15 detectWorktreeConflicts` (live re-check),
  `stack-facts.ts:250 assertCleanRepo` (live re-check).
- **B5 Landing shape/stack facts** — execution (facts); gateways cover it
  method-wise, but the adapter backend is circular and production bypasses
  it via `preloadedShape`. Needs a real backend, not new methods.
- **B6 Pre-merge submit/restack** — execution, migrates.
  `pre-merge-submit.ts`. Gateway methods exist but are stubs; needs them
  made real (backed by the operation channel).
- **B7 Pre-merge managed-slot freeing** — execution, migrates.
  `landing-operations.ts:71`. Gateway: NONE — needs a slot-action seam
  (e.g. `freeSlots(...)`); `LandingCleanupOutcome.freedSlots` already
  anticipates the result shape.
- **B8 Backup refs** — execution, migrates. `backup-refs.ts:16`. Gateway:
  NONE on `LandGitGateway` (zero ref-mutation ops); needs e.g.
  `snapshotBackupRefs` covering rotate/prune/write.
- **B9 Stack merge execution** — execution, migrates.
  `landing-operations.ts:214 runMergeLoop`, `pr-facts.ts:22 loadPr`,
  `:125 validateStrictMergeGate` (pure logic → domain core). Gateway gap:
  `LandGithubPrFactsGateway` is read-only; needs
  `squashMergePullRequest(...)`.
- **B10 Isolated fast-path landing** — execution, migrates (same merge
  gateway gap). Lives in `land/isolated-fast-path.ts` but runs on
  land-stack primitives. Open design question: domain target
  (`IsolatedPullRequestLandingTarget` exists) vs Flow shortcut (CONTEXT.md
  "Stack Landing Target" *Avoid* disclaims isolated-PR execution). Fast
  path skips the post-merge MERGED verification the stack loop does.
- **B11 Post-merge Graphite maintenance** — execution, migrates; RISKIEST
  (owns every destructive guard). `graphite-maintenance.ts:243` +
  the operation channel. Gateway: `LandGraphiteGateway` covers none of it;
  needs `refreshBranchFromRemote`, `deleteLocalBranch` (tri-state),
  `restackUpstack`, real forced `submitUpdate`, `branchChildren`.
- **B12 Post-landing slot cleanup (`--free`)** — execution, migrates after
  B7/B11 (reuses `freeSlots` + `deleteLocalBranch`).
  `land/post-landing-slot-cleanup.ts`.
- **B13 Failure mapping/warning accumulation** — split by construction;
  typed failure production is domain, rendering is Flow. The dual mappers
  (`plan-mapping.ts:145`, `land-context-adapter.ts:232`) are the round
  trip the retirement row deletes.

### Proposed migration slices (one behavior per slice, ordered)

1. **Strict merge gate + PR validators onto the domain core** (FIRST,
   lowest risk; pure logic, no subprocess change, no gateway extension).
2. **Real `stackShape`/facts gateway backend** (fidelity fix: kill the
   circular call, real SHAs).
3. **Isolated fast-path merge via gateways** (adds
   `squashMergePullRequest`).
4. **Backup refs onto `LandGitGateway`** (adds `snapshotBackupRefs`;
   scenario tests assert exact argv — backend must emit identical
   commands).
5. **Pre-merge submit/restack through the graphite gateway** (make the
   stubs real; removes the second boundary crossing).
6. **Slot-action seam + pre-merge slot freeing** (adds `freeSlots`).
7. **Stack merge loop onto gateways** (high risk: interleaved
   presentation; needs a progress-reporting decision).
8. **Post-merge Graphite maintenance** (RISKIEST: destructive guards,
   checkout-conflict policies, fail-vs-warn severity).
9. **Post-landing slot cleanup** (low-medium after 6/8).
10. **Retire the round trip** — the existing separate roadmap row, enabled
    by 1–9.

### Open decisions the migration row must settle

- Isolated fast path: domain target or Flow shortcut?
- Progress reporting: does the operation channel become the gateway
  backend (keeping per-command streaming) or do gateways return settled
  results only?
- Slot-free stays an `sdl slot free` self-invocation behind the seam —
  confirm against `docs/conventions/platform-and-consumer.md` expectations.
- Argv-exactness: every gateway backend must preserve command
  construction byte-for-byte or the "scenario tests pass unchanged"
  evidence contract fails.

## Objective Impact

- The inventory row is complete; the migration row's precondition (the
  map exists) is satisfied. Slices should be previewed one at a time per
  that row's `Policy: preview`.
- Premise corrections for later rows: the round-trip retirement row's
  file list is confirmed, but the boundary is five crossings today, not a
  neat adapter plus mirror — `pr-facts.ts` and `pre-merge-submit.ts`
  crossings retire via slices 1 and 5 respectively, before the retirement
  row runs.
- The parked presentation row's re-inventory expectation is reaffirmed:
  slices 7–8 churn `presentation.ts` inputs.

## Follow-Ups

- Start the migration row at Slice 1 (strict merge gate + validator
  dedupe) via `objective-next` preview, per the row's policy.
- Settle the isolated-fast-path and progress-reporting decisions during
  the relevant slice previews (3 and 7), not before.
