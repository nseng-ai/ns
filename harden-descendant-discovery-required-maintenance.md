# Remediate descendant reconciliation dependency discovery and maintenance optionality

## Goal and outcome

Bring `fix-flow-land-descendant-reconciliation` / PR #4085 to the code-quality approval bar without changing its intended user-visible landing policy:

1. Close the fail-open hole in pre-merge remote-dependent discovery by recognizing an open PR as a possible dependent when either its base ref name identifies a landing branch or its observed base OID identifies a landing head.
2. Rename the GitHub gateway operation so its contract truthfully expresses dependency discovery rather than OID-only “based on heads” matching.
3. Finish the optional-to-required maintenance refactor by deleting unreachable warning/skip paths from branch maintenance and making required maintenance failure behavior explicit in types and control flow.
4. Correct the misleading phase-history comment in `execute.ts` without otherwise restructuring phase bookkeeping.

Do not preemptively split `maintenance.ts`. Reassess its cohesion and line count after deleting the dead optionality scaffolding; extraction is out of scope unless simplification itself reveals a compelling, low-coupling seam.

## Context and discovered facts

### Branch and reviewed change

- Source branch: `fix-flow-land-descendant-reconciliation`.
- PR: #4085, “Require verified descendant reconciliation for Flow landings.”
- Baseline reviewed: `master...HEAD`, 37 files, approximately +2142/−502 at planning time.
- Existing branch validation evidence before this remediation: native TypeScript check passed; focused Flow suite passed 93 files / 883 tests.
- The PR correctly changes descendant reconciliation from optional warning-grade maintenance into a required post-merge completion condition with verified Git ancestry, Graphite topology, and GitHub PR facts. Preserve that direction.

### Confirmed dependency-discovery defect

The current gateway operation is:

- `LandGithubPrGateway.openPullRequestsBasedOnHeads({ repoRoot, headOids })`
- implemented by `loadOpenPullRequestsBasedOnHeads` in `src/land/stack/pr-facts.ts`
- filtered only by `PullRequestDependencyFacts.baseRefOid`

`PullRequest.baseRefOid` cannot be treated as the live current tip of the base branch. During planning, a live GitHub GraphQL query against `nseng-ai/ns` returned long-open PRs based on `master` with differing historical base OIDs:

- PR #91: `master` at `3f46a33a5da1…`
- PR #353: `master` at `059a8def2aeb…`
- PR #361: `master` at `e15fe4f06841…`
- current local and `origin/master` at the same observation: `29482e2f945f…`

The query used the GraphQL fields `number createdAt baseRefName baseRefOid headRefName` over open PRs. This is concrete off-repo/API evidence that `baseRefOid` is snapshot-like and may be stale after the base branch advances. Consequently, OID-only filtering can miss an unknown dependent after its parent landing branch is amended or restacked.

The corrected matching contract is the union of two observations:

- `dependent.baseRefName` equals a landing branch name; or
- `dependent.baseRefOid` equals an observed local or PR head OID for a landing branch.

Name matching catches ordinary named base refs when their OID snapshot is stale. OID matching remains necessary for Graphite synthetic base refs. Do not claim this proves arbitrary ancestry: it is a conservative name-or-observed-OID dependency signal based on the facts available from the complete open-PR scan.

### Confirmed maintenance-structure defect

`planGraphiteMaintenanceTargets` currently establishes this matrix:

- `required-next-landing`: non-empty branches, `severity: "fail"`, `shouldHaltOnRefreshFailure: true`
- `required-descendants`: non-empty branches, `severity: "fail"`, `shouldHaltOnRefreshFailure: true`
- `none`: empty branches, `severity: "warn"`
- `blocked-descendants`: empty branches and an early return before maintenance helpers

Therefore all per-maintenance-branch helpers execute only in required/failing modes. Their warning halves and refresh skip fallback became unreachable when optional descendants were removed. In particular:

- `guardMaintenanceBranch`
- `refreshMaintenanceBranch`
- `restackMaintenanceBranch`
- `checkSubmitMaintenanceBranch`
- `submitMaintenanceBranch`

should not accept or produce warning-grade branch outcomes.

`stopFailure` is also dead defensive coercion: required descendant paths already produce failures, but the function admits `skip`, converts warnings back into failures, and can fabricate the contextless message `Descendant reconciliation step did not complete.` Delete this imprecision rather than preserving it for hypothetical future optional behavior.

Warning behavior remains live only for final landed-local-branch cleanup in `none` mode. Preserve warning-grade cleanup there, but make that policy local to cleanup rather than a general branch-maintenance severity.

### Standing repository constraints

- Node 24+, TypeScript 7, pnpm workspace under `ts/`.
- Use relative `.ts` imports inside the package and strict result/discriminated-union types.
- Default tests must remain fake-driven and shared-cache safe; do not add real network/subprocess work to default tests.
- `just` is the default repository validation entrypoint.
- If formatter checks fail, use `just ts-format-fix` / `just dprint-fix` rather than hand-formatting generated output.
- Active provider-neutrality orientation prohibits new ambient Graphite coupling. This remediation stays within the explicitly Graphite-branded Flow landing implementation and must not widen Graphite dependencies.

## Files, symbols, tests, and documentation

### Remote dependency contract and implementation

- `ts/packages/incubating/extensions/flow/src/land/types.ts`
  - `PullRequestDependencyFacts`
  - `LandGithubPrGateway.openPullRequestsBasedOnHeads`
  - Correct the `baseRefOid` documentation so it does not say the OID is the commit the base ref “currently” points at.
- `ts/packages/incubating/extensions/flow/src/land/stack/pr-facts.ts`
  - `loadOpenPullRequestsBasedOnHeads`
  - complete paginated open-PR scan and filter
  - GraphQL argument/parser helpers remain structurally valid
- `ts/packages/incubating/extensions/flow/src/land/stack/land-context-adapter.ts`
  - real gateway wiring
- `ts/packages/incubating/extensions/flow/src/land/preflight.ts`
  - `landingHeadOids`
  - `findUndiscoveredRemoteDependents`
  - `validateRemoteDescendantConsistency`
  - stack preflight invocation
- `ts/packages/incubating/extensions/flow/src/land/execution/single-branch-landing.ts`
  - fast-path dependency discovery invocation
- `ts/packages/incubating/extensions/flow/src/land/testing.ts`
  - in-memory gateway method, call event, request/call type, call log, and matching fake
- `ts/packages/incubating/extensions/flow/test/unit/land-stack-pr-facts.test.ts`
  - paginated real-adapter boundary behavior
- `ts/packages/incubating/extensions/flow/test/land/unit/preflight.test.ts`
  - stack preflight mismatch/acceptance behavior
- `ts/packages/incubating/extensions/flow/test/unit/single-branch-fast-path.test.ts`
  - fast-path fail-closed behavior
- Additional compile-driven call-site fixtures:
  - `test/land/api-boundary.test.ts`
  - `test/land/unit/execute.test.ts`
  - `test/land/unit/merge-loop.test.ts`

### Maintenance simplification

- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance-plan.ts`
  - `MaintenanceTargetPlan`
  - `MaintenanceSeverity`
  - `buildMaintenanceTargetPlan`
- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance.ts`
  - `GraphiteMaintenanceOutcome`, `GraphiteMaintenanceStop`, `failOrWarn`, `stopFailure`
  - `maintainNextLandingBranches`
  - `reconcileDescendantRoots`
  - the five per-branch helpers listed above
  - `checkGraphiteBranchBeforeDelete`
  - `deleteLocalGraphiteBranchAfterLanding`
  - local deletion diagnostic pair helpers
- `ts/packages/incubating/extensions/flow/test/unit/land-graphite-maintenance.test.ts`
  - planning-shape assertions for removed flags
  - required maintenance hard-failure assertions
  - warning-grade `none` cleanup behavior
- Other Flow landing tests should be updated only where the more precise result shape or renamed gateway contract requires it.

### Phase comment and docs

- `ts/packages/incubating/extensions/flow/src/land/execution/execute.ts`
  - comment above post-merge failure phase handling
- `ts/packages/incubating/extensions/flow/CONTEXT.md`
- `ts/packages/incubating/extensions/flow/README.md`
  - retain the documented fail-closed policy, but avoid claiming that OID-only comparison proves a PR is based on the landing branch’s current head; describe the complete scan and conservative base-name/base-OID reconciliation accurately.

## Implementation steps

### 1. Rename and correct the GitHub dependency-discovery gateway

Adopt a dependency-oriented private contract, for example:

```ts
openPullRequestDependents(request: {
  readonly repoRoot: string;
  readonly baseRefNames: readonly string[];
  readonly baseRefOids: readonly string[];
}): Promise<LandResult<readonly PullRequestDependencyFacts[]>>;
```

Use an equivalent name only if it is more idiomatic in the surrounding code; do not retain `openPullRequestsBasedOnHeads`, because that name would be false after adding name matching.

Rename the real adapter function consistently, e.g. `loadOpenPullRequestDependents`. Preserve:

- complete pagination across all open PRs;
- the explicit page bound and fail-closed overflow;
- malformed-page/node failure behavior;
- no arbitrary bounded prefix;
- filtering after each parsed page rather than returning unrelated open PRs to the domain layer.

Filter a node into the returned dependency facts when either:

```ts
baseRefNameSet.has(node.baseRefName) || baseRefOidSet.has(node.baseRefOid)
```

Return early with `[]` only when both key collections are empty. Update comments and failure text from “based on heads” to dependency reconciliation terminology.

Rename all matching fake/event/log symbols in `testing.ts`, including the operation discriminator. This is unreleased private code; do not add a deprecated compatibility alias.

### 2. Build explicit dependency match keys at preflight call sites

Replace `landingHeadOids` with a helper/model that exposes both:

- unique landing branch names;
- unique observed head OIDs, including each branch plan’s `localSha` and `pr.headRefOid`.

The stack path should pass all landing branch names and all observed OIDs. The single-branch fast path should pass the current branch name and PR head OID. Keep construction deterministic and deduplicated.

In `findUndiscoveredRemoteDependents`, resolve the landing branch associated with a dependency using:

1. exact `baseRefName` match against landing branches;
2. otherwise `baseRefOid` match against observed landing head OIDs.

Prefer the name match when both signals exist because it identifies the intended branch even if multiple branches temporarily share an OID. Preserve existing exclusions:

- PRs already in the landing path are not mismatches;
- branches already represented in provider-known landing/remaining/descendant topology are not mismatches;
- Flow never adopts or reparents an unknown branch automatically.

Update mismatch diagnostics so they are truthful for both evidence paths. Do not say every match is “based on the landing branch’s current head.” State that the dependent’s base ref name or observed base OID identifies the landing branch, and continue to include the PR number, head branch, base ref name, and shortened base OID for repairability.

### 3. Add regression coverage for stale OIDs and synthetic bases

Extend the adapter test in `land-stack-pr-facts.test.ts` so one paginated scan proves the union behavior:

- include a PR whose `baseRefName` matches a requested landing branch but whose `baseRefOid` is stale/unrequested; it must be returned;
- include a PR with a Graphite/synthetic base ref name but a matching requested base OID; it must be returned;
- include an unrelated PR matching neither; it must be filtered out;
- retain multi-page coverage, missing-end-cursor failure, malformed-node failure, and page-bound behavior.

Add domain/preflight tests proving:

- an unknown dependent with matching landing `baseRefName` and stale `baseRefOid` fails before backup refs, confirmation, merge, delete, restack, or submit;
- a synthetic-base dependent still fails through OID matching;
- provider-known dependents remain accepted;
- the recorded gateway call carries both branch-name and OID keys.

Mirror the stale-OID/name-matching regression in the single-branch fast-path test so that path cannot drift from stack preflight.

### 4. Replace general maintenance severity with cleanup-local policy

Remove from `MaintenanceTargetPlan`:

- general `severity`;
- `shouldHaltOnRefreshFailure`;
- `MaintenanceSeverity`.

Represent only the policies that remain variable. In particular, use a cleanup-specific field or an equivalent explicit decision such as:

```ts
readonly cleanupFailureHandling: "fail" | "warn";
```

Set it to fail for required next-landing/descendant modes and warn for `none`. `blocked-descendants` still exits before helpers; avoid retaining irrelevant flags solely to populate that variant if the planner can express it more narrowly.

Keep `refreshCheckedOutConflictHandling` because required descendant refresh still uses `defer` to obtain structured checkout-conflict facts and emit the tailored failed/deferred repair message. Its command behavior is distinct from warning severity.

### 5. Make every per-branch maintenance helper fail explicitly

Refactor the five branch helpers so their error cases return `LandingExecutionFailure` directly (or a narrow discriminated result containing that failure), never `LandingWarning`/`skip`:

- `guardMaintenanceBranch`
- `refreshMaintenanceBranch`
- `restackMaintenanceBranch`
- `checkSubmitMaintenanceBranch`
- `submitMaintenanceBranch`

Preserve the existing failure messages, command evidence, failed branch/PR metadata, backup-recovery hints, and checkout-conflict-specific guidance. Delete only the unreachable warning siblings and optional-descendant wording.

Update callers:

- `maintainNextLandingBranches` wraps a branch failure as a maintenance halt and returns immediately;
- `reconcileDescendantRoots` collects branch failures directly across roots;
- `reconcileDescendantRoot` remains the verified postcondition flow and should not be broadened into warning semantics.

Delete `stopFailure`; no required path should need to coerce a warning into a failure or fabricate a fallback failure.

### 6. Isolate warning/failure duality to landed-branch cleanup

Retain both failure and warning diagnostics only for:

- pre-delete child recheck;
- local Graphite branch deletion.

A clean shape is for these low-level cleanup steps to return either success or a diagnostic pair, with the caller applying `cleanupFailureHandling`:

```ts
type MaintenanceDiagnosticPair = {
  readonly failure: LandingExecutionFailure;
  readonly warning: LandingWarning;
};
```

Required flows consume `.failure`; `none` mode consumes `.warning`. Use a cleanup-specific applicator if useful, but do not recreate the old general recorder/control-string abstraction. The type design must make it impossible for required per-branch maintenance to return `skip`.

Preserve current state mutations and ordering:

- do not delete the landed branch until required roots pass guard/refresh and the authoritative child recheck passes;
- retain checked-out branches according to existing delete handling;
- record deleted/retained branches exactly once;
- keep aggregate descendant reconciliation failures branch-specific.

Update maintenance tests to assert the simplified planner shape and hard-failure semantics. Ensure `none` mode still converts cleanup problems into warnings/skips rather than failing the already-completed landing.

### 7. Correct the phase-history comment only

In `execute.ts`, split or relocate the existing comment so it states precisely:

- only a `descendant-maintenance` failure proves every target PR merge completed and therefore adds `completed("merge")`;
- filtering the observed maintenance phases prevents a completed/skipped entry from duplicating the phase that `failedResult` records as failed.

Do not redesign phase ownership or thread `failedPhase` through `observedMaintenancePhases` in this change unless implementation exposes an actual bug. The current filtering is load-bearing for partial `merge-maintenance-cleanup` failure.

### 8. Reconcile docs and perform a post-simplification structure check

Update `CONTEXT.md`, `README.md`, and TypeScript doc comments to describe the corrected evidence accurately:

- complete paginated GitHub open-PR scan;
- base-ref-name or observed-base-OID matching;
- snapshot OIDs are not described as live base tips;
- unknown dependents still fail before mutation;
- no automatic adoption/reparenting.

After the maintenance deletion, measure `maintenance.ts` and inspect its remaining cohesion. Do not extract a new module merely to lower line count. Record or report a decomposition follow-up only if the file still approaches/crosses 1,000 lines and a descendant-reconciliation module can be extracted without exporting a large shared internal surface.

## Refactor execution strategy

This plan includes a same-shape private TypeScript API rename across more than five mixed source/test files plus semantic code and prose changes.

- Use **`refactor-swarm`** for the mechanical gateway rename and call-site propagation if that capability is available to the implementation session.
- If it is unavailable, use a deterministic TypeScript language-service/symbol rename for the method/function/type identifiers, then make semantic request-shape and matching changes with precise edits. Do not use an opaque ad hoc `text.replace()` script for mixed code/prose changes.
- Handle the maintenance simplification as a semantic refactor by reading each affected helper and changing its result type/caller together; do not perform broad regex replacement of `failOrWarn` blocks.
- Finish with bounded stale-symbol/terminology searches, including at least:
  - `openPullRequestsBasedOnHeads`
  - `loadOpenPullRequestsBasedOnHeads`
  - `LandOpenPullRequestsBasedOnHeadsCall`
  - `shouldHaltOnRefreshFailure`
  - `MaintenanceSeverity`
  - `stopFailure`
  - stale prose claiming `baseRefOid` is the base ref’s current tip

## Validation guidance

Run focused checks while iterating, then the repository gate:

1. Focused Flow typecheck:
   - `cd ts && pnpm exec tsc --noEmit -p packages/incubating/extensions/flow`
2. Focused Flow tests:
   - `cd ts && pnpm vitest run packages/incubating/extensions/flow/test`
3. At minimum, explicitly inspect the focused output for:
   - stale-OID/name match;
   - synthetic-base/OID match;
   - unrelated-PR filtering;
   - complete pagination and fail-closed cursor/page-bound behavior;
   - stack and single-branch refusal before mutation;
   - required maintenance failures never becoming warnings/skips;
   - `none` cleanup warnings remaining non-fatal;
   - phase report entries remaining non-contradictory.
4. Run the TypeScript architectural/style guard because gateway and result types change:
   - `just ts-test-typescript-style-guard`
5. Run the default repository validation entrypoint:
   - `just`
6. If formatting fails, run the appropriate fixer (`just ts-format-fix` or `just dprint-fix`) and rerun validation.

Do not add real GitHub calls to the test suite. The live GraphQL observations above are planning provenance; implementation coverage remains scripted adapter tests plus in-memory domain fakes.

## Risks, assumptions, and open questions

### Risks

- **False confidence from the union match:** name-or-OID matching is deliberately more conservative than OID-only matching, but it is not a general ancestry proof. Synthetic base refs with stale OIDs may still be unknowable from these facts alone. Documentation and diagnostics must describe observed matching, not absolute dependency ancestry.
- **False positives from branch-name reuse:** an open PR explicitly naming a landing branch as its base is intentionally treated as a dependent even if its stored OID is old. That is the safety-biased behavior required before destructive landing.
- **Ambiguous shared OIDs:** two landing branches can theoretically name the same commit. Prefer exact base-ref-name resolution; use OID fallback only when name resolution fails. Avoid silently overwriting a stronger name signal.
- **Cleanup regression while deleting optionality:** warning behavior for final local cleanup with no descendants remains valid. Tests must distinguish this from branch maintenance so the cleanup warning is not accidentally promoted to a hard failure.
- **Scope creep into decomposition:** line-count pressure should largely disappear when dead warning siblings are removed. Do not introduce a wide internal export surface just to move lines into another file.

### Assumptions

- Breaking the private gateway method name is acceptable because ns is private and unreleased.
- Existing user-visible policy remains unchanged: topology mismatch refuses before mutation; disclosed cross-worktree descendant blockage may permit parent merge but finishes nonzero as partial completion; required post-merge reconciliation failures remain failures.
- No durable state or migration is involved.
- No active Objective directly owns this Flow PR; active repository orientations still apply, especially provider-neutrality and fake-driven test boundaries.

### Open questions

No material user decision remains. Internal exact symbol names may vary from the examples above if the selected names remain dependency-oriented and the request explicitly carries both base-ref names and OIDs.

## Review and remediation checklist

Before declaring the remediation complete, review the resulting diff against the original findings:

- The dependency gateway name and docs no longer imply OID-only/current-head semantics.
- A stale base OID with a matching landing base-ref name is caught on stack and single-branch paths before mutation.
- A Graphite synthetic base ref with a matching observed OID is still caught.
- Pagination remains complete and fail-closed.
- Provider-known branches and landing PRs remain excluded from mismatch failures.
- No per-branch maintenance helper can return warning/skip.
- General `severity`, `shouldHaltOnRefreshFailure`, `stopFailure`, and their stale tests are gone.
- Cleanup-only warning behavior remains localized and tested.
- The old recorder/control-string abstraction is not reintroduced under a different name.
- Phase-history comments match actual control flow; no unnecessary phase refactor was added.
- `maintenance.ts` was reassessed after deletion, and module extraction was not performed without a demonstrable cohesion win.
- README, CONTEXT, source comments, fake names, event discriminators, and tests use consistent corrected terminology.
- Final bounded `rg` searches find no stale identifiers or misleading “current base OID” claims.
