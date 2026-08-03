## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

You are continuing implementation on branch `fail-closed-descendant-reconciliation` in:

`/Users/schrockn/.local/state/ns/slots/repos/ns/worktrees/slot-07`

The previous session exceeded its safe context budget and was cancelled. Start by inspecting the current working tree and diff; do not discard existing edits. Do not commit, push, submit, or mutate Branch Memory unless explicitly asked.

## Goal

Complete the attached branch-context plan “Make Flow landing fail closed around descendant reconciliation.”

Harden `ns flow land` so it cannot report full success when open descendant PRs remain undiscovered, locally un-restacked, remotely stale, or incorrectly based.

Required behavior:

1. Before merge, compare provider-reported descendants with complete GitHub dependency facts. If an open PR is based on a landing branch’s head OID but its branch is absent from provider topology, refuse before any mutation. Never auto-adopt/reparent it.
2. Descendants checked out in another worktree require the existing main confirmation or `--yes` to authorize merging. They are never mutated. The merge then ends as nonzero partial completion with landed facts and repair guidance.
3. Automatic descendant maintenance is required for full completion. Verify observable Git ancestry, provider parent/topology, local/remote SHA equality, and expected remote PR base after restack/submit.
4. A post-merge maintenance failure returns a failed `LandingExecutionResult`, preserves landed chunks, uses a truthful maintenance phase, exits nonzero, and must not produce `Land completed.`
5. Preserve backup refs, moved-SHA guards, worktree protections, and provider-neutral domain seams.

## Repository rules

Before further work:

- Run `ns objective exec load-orientations --format md`; honor all active orientations, especially provider-neutral opt-in stacking.
- Read root `AGENTS.md`, `ts/AGENTS.md`, `.agents/skills/typescript-style/SKILL.md`, and `.agents/skills/ns-typescript/SKILL.md`.
- Use `uv` for Python, never bare `python`.
- Use bounded `rg` searches.
- TypeScript uses native TS7, Vitest, oxfmt, and oxlint.
- Default validation is `just`.
- Do not add ambient Graphite dependencies or a monolithic provider interface.

The attached plan requested `refactor-swarm`, but the previous session documented a justified adaptation: this is a cross-file cascading semantic refactor, explicitly outside that skill’s safe use. Continue directly in dependency order.

## Verified branch/worktree state at handoff

- Branch: `fail-closed-descendant-reconciliation`
- The working tree contains substantial uncommitted implementation and test edits.
- Before the final interrupted turn:
  - `pnpm run check` passed.
  - The complete Flow test selection passed: `93 passed (93)`.
- Full repository validation has not run.
- Documentation updates have not been completed.
- Additional required coverage and at least one critical architectural gap remain.

Re-run focused checks after inspecting the current diff; do not assume the tree is unchanged after cancellation.

## Work already implemented

### Domain and gateways

`ts/packages/incubating/extensions/flow/src/land/types.ts`

- Added domain failure reason:
  - `descendant-topology-mismatch`
- Changed `DescendantMaintenancePlan`:
  - `none`
  - `auto`
  - `blocked` (replaces warning-grade `skipped`)
- Added `PullRequestDependencyFacts` with:
  - PR number
  - head branch/OID
  - base ref name/OID
- Added required gateway methods:
  - `LandGithubPrGateway.openPullRequestsBasedOnHeads`
  - `LandGraphiteGateway.branchParent`

`src/land/api.ts`

- Exports `PullRequestDependencyFacts`.

### Preflight mismatch detection

`src/land/preflight.ts`

- Calls `openPullRequestsBasedOnHeads` during canonical stack-plan construction.
- Added:
  - `landingHeadOids`
  - `findUndiscoveredRemoteDependents`
  - remote/provider consistency validation
- Unknown remote dependents produce a preflight `descendant-topology-mismatch` domain failure with PR/branch/base/provider facts and no auto-adoption.
- Blocked worktree descendants now produce `DescendantMaintenancePlan.type === "blocked"`.

### GitHub and Graphite adapters

`src/land/stack/pr-facts.ts`

- Added complete paginated open-PR scan:
  - `openPullRequestDependencyFactsGraphqlArgs`
  - `loadOpenPullRequestsBasedOnHeads`
  - page parsing and fail-closed cursor handling
  - explicit maximum of 50 × 100 PRs; exceeding it returns failure rather than truncating silently.

`src/land/stack/land-context-adapter.ts`

- Wires the GitHub dependency scan.
- Implements provider parent lookup through the existing Graphite metadata topology reader.

### Required descendant reconciliation

`src/land/execution/maintenance-plan.ts`

- Modes changed to:
  - `required-next-landing`
  - `required-descendants`
  - `blocked-descendants`
  - `none`
- Required descendants now have failure severity.
- Added blocked and aggregate descendant failure builders.

`src/land/execution/maintenance.ts`

This file was substantially rewritten:

- Blocked descendants halt at `descendant-maintenance` after the consented merge, without mutating blocked worktrees or deleting the landed local branch.
- Required descendants:
  1. Guard and refresh every root.
  2. Aggregate refresh failures and avoid deletion if refresh safety fails.
  3. Recheck provider children.
  4. Delete the landed branch only when safe.
  5. Restack each root.
  6. Re-read post-restack local SHA.
  7. Verify root contains refreshed trunk.
  8. Verify provider parent equals trunk.
  9. Load GitHub PR facts.
  10. Skip submit only if remote facts are already proven current.
  11. Otherwise force-submit and reload GitHub facts.
  12. Fail if submit exits zero but remote head/base facts remain stale.
- Multiple roots are attempted and branch-specific failures are aggregated.
- Halts carry either:
  - `descendant-maintenance`
  - `merge-maintenance-cleanup`

`src/land/execution/merge-loop.ts`

- Failure results now carry `failedPhase`.
- Descendant observations include `failed`.
- Maintenance failures propagate their truthful phase.

`src/land/execution/execute.ts`

- Uses `mergeOutcome.failedPhase` rather than always reporting `merge`.
- Records completed merge before final descendant-maintenance failure.
- Preserves landed chunks and cleanup observations.

### Presentation/help

`src/land/land-presentation.ts`

- Describes automatic descendant reconciliation as required and verified.
- Discloses blocked descendants, worktree conflicts, deferred maintenance, nonzero partial completion, and repair implications.
- Replaced `skipped` wording with `blocked`.

`src/land/stack/flags.ts`

- `--yes` help now says it also accepts disclosed deferred descendant maintenance, while such landings still finish nonzero.

### Stateful testing fakes

`src/land/testing.ts`

- Added fake support for:
  - branch parent reads/transitions
  - complete remote dependency scans
  - mutable local SHAs/ancestry
  - mutable provider parent topology
  - mutable remote PR head/base facts
- Added declarative cross-gateway transitions:
  - `onRestackSuccess`
  - `onSubmitUpdateSuccess`
- Tests can now prove command success only becomes completion after observable state changes.

### Tests updated/added

Important coverage now exists in:

- `test/land/unit/preflight.test.ts`
  - provider-unknown remote dependent refusal
  - no backup/merge/delete/restack/submit mutation
  - provider-known dependents accepted
  - blocked maintenance plan
- `test/land/unit/merge-loop.test.ts`
  - truthful failed phase
  - required descendant refresh failure
- `test/land/unit/execute.test.ts`
  - blocked worktree partial completion with landed chunks
  - required descendant completion
- `test/unit/land-graphite-maintenance.test.ts`
  - restack command failure
  - restack exits zero but ancestry remains wrong
  - restack exits zero but provider parent remains landed branch
  - submit exits zero but remote facts remain stale
  - full success via state transitions
  - multi-root attempt/aggregation
- Scenario fixture helpers now include the dependency scan and verified descendant sequence.
- Flow scenario tests were updated to expect nonzero maintenance failures rather than warning-grade success.
- Large-stack telemetry baselines include the two extra preflight GitHub calls.

## Critical unresolved gap: single-branch fast path

The mismatch check currently lives in `buildStackLandingPlan`, but `runLandingDispatch` can select the isolated single-branch fast path before canonical stack planning.

This is potentially the exact fail-open incident shape:

- Provider reports no descendants.
- `isSingleBranchFastPath(shape.stack)` returns true.
- A remote GitHub PR is actually based on the current branch head.
- Canonical `buildStackLandingPlan` and its remote/provider consistency check may never run.

You must verify this execution path before doing anything else. The safety requirement is “before any merge,” including the isolated fast path.

Preferred direction:

- Reuse a small domain-level remote/provider reconciliation helper rather than duplicating GraphQL or policy.
- Ensure the single-branch fast path calls the complete dependency gateway and refuses before confirmation, backup refs, merge, or cleanup.
- Do not route a genuinely isolated branch through Graphite-heavy canonical execution merely as a shortcut unless that is the cleanest existing architecture.
- Add a regression test where provider shape qualifies for fast path but GitHub reports an unknown dependent based on the branch head; assert no merge or Graphite mutation and exit 1.
- Preserve ordinary isolated no-descendant fast-path behavior.

This is a release-blocking gap.

## Other remaining implementation questions

### Remote postcondition base OID

The current maintenance verification uses `PullRequestFacts.baseRefName`, while dependency facts include `baseRefOid`. The plan requires post-submit remote base ref/base OID consistency.

Inspect current Graphite synthetic-base fixtures and determine the narrow correct contract:

- If `gh pr view --json` reliably supports `baseRefOid`, add it to `PullRequestFacts`, `PR_FIELD_NAMES`, parsing, fakes, fixtures, and post-submit verification.
- Do not incorrectly require a literal trunk base name if valid Graphite synthetic-base semantics use another ref whose OID/topology proves the correct relationship.
- If complete reliable base-OID verification cannot be implemented through the current adapter, stop and report the limitation rather than weakening the requirement.

The current implementation may therefore be incomplete relative to the attached plan even though tests pass.

### Consent wording

Current dry-run plan text includes wording equivalent to:

“Full completion is impossible until those worktrees are freed/detached or deferred maintenance is explicitly accepted.”

Explicitly accepting deferred maintenance does not make full completion possible; it permits partial completion. Correct this wording so:

- freeing/detaching permits full reconciliation;
- confirmation/`--yes` permits the parent merge with known nonzero partial completion.

### Main consent representation

The previous implementation relies on the existing typed `LandConfirmationDecision.type === "approved"` after the blocked-descendant disclosure. Interactive approval and `--yes` already converge there. Verify this satisfies the plan’s typed-consent requirement and that no route can merge blocked descendants without the disclosure/approval.

## Remaining tests to add

1. `test/unit/land-stack-pr-facts.test.ts`
   - Add pagination tests for `loadOpenPullRequestsBasedOnHeads`:
     - first page with `hasNextPage: true` and cursor
     - second exhausted page
     - filter by requested base OIDs
     - malformed missing cursor fails closed
     - malformed dependency node fails closed
2. Single-branch fast-path unknown-dependent regression described above.
3. Explicit no-consent/default-refusal regression:
   - blocked descendant
   - no usable confirmation and no `--yes`
   - no merge
4. If needed, add `runLandCli` assertion that a post-merge descendant-maintenance failure returns exit code 1 and does not yield wrapper success.
5. Add or extend gateway fake tests for:
   - `openPullRequestsBasedOnHeads`
   - branch parent transitions
   - restack/submit state mutation
6. Update API allowlist expectations if further exported types change.

## Documentation remaining

Update both in the same change:

- `ts/packages/incubating/extensions/flow/README.md`
- `ts/packages/incubating/extensions/flow/CONTEXT.md`

Document:

- landing completion includes verified descendant reconciliation;
- remote/provider topology mismatch is a fail-closed pre-merge refusal;
- no automatic adoption/reparenting;
- blocked worktree descendants require main confirmation or `--yes`;
- blocked descendants are never mutated;
- approved blocked landing still exits nonzero as partial completion;
- post-merge restack/submit/verification failures preserve landed facts and return nonzero;
- command success alone does not prove reconciliation.

Do not add an ADR; this is a safety correction within existing architecture.

## Validation requirements

After completing implementation:

1. Focused Flow tests while iterating.
2. `pnpm --dir ts run check`
3. `just ts-format-fix` if formatting fails, then `just ts-format-check`
4. `just ts-lint` or `just ts-lint-fix`, then rerun lint
5. `just ts-test`
6. `just ts-test-integration`
7. `just ts-test-isolated`
8. `just ts-test-sanity`
9. `just ts-test-typescript-style-guard`
10. `just ts-deps-check`
11. Flow API boundary/allowlist test
12. `just`
13. Inspect final diff and changed-file scope.

Run bounded stale-pattern searches:

- `optional-descendants`
- warning-only descendant completion
- `type: "skipped"` for descendant maintenance
- command-success-only restack/submit paths
- assertions that worktree-blocked descendants complete successfully
- new raw Graphite dependencies outside existing Flow/adapter boundaries.

## Material risks

- The fast-path bypass is likely a real correctness hole and must be resolved before claiming completion.
- Graphite synthetic-base semantics may make literal `baseRefName === trunk` too strict or base-OID verification more nuanced; use observed facts and fixtures.
- Complete GitHub pagination must never silently truncate.
- One descendant root may reconcile before another fails; reports must not imply rollback.
- Autofixers may touch files outside the planned Flow scope; report formatter-only changes separately.
- Keep `LandingExecutionReport` as the single report model and preserve `report.landedChunks` for irreversible work.