# Refactor Flow landing maintenance around explicit workflows

## Goal and outcome

Improve PR #4087’s landing-maintenance implementation without changing its observable behavior:

1. Isolate required descendant reconciliation from ordinary next-landing maintenance so the fail-closed workflow has a focused owner instead of remaining interleaved in the 933-line `maintenance.ts` module.
2. Replace the flat `MaintenanceTargetPlan` policy matrix with a discriminated union whose variants encode the legal behavior for each maintenance mode.
3. Preserve all current landing semantics, diagnostics, cleanup behavior, progress reporting, aggregation, and observed descendant-maintenance outcomes.

The resulting structure should make these distinctions explicit:

- **ordinary next-landing maintenance** may be required or warning-grade depending on its mode;
- **required descendant reconciliation** is always fail-closed and verifies postconditions rather than trusting Graphite command success;
- **blocked descendant maintenance** is a failed partial completion after an already-consented merge;
- **no descendant work** performs only the applicable cleanup behavior.

The test-file decomposition finding is intentionally deferred. Do not split `test/unit/land-graphite-maintenance.test.ts` in this change, although its assertions must be updated to match the honest policy type and extracted module boundaries.

## Context and discovered facts

- Source branch: `fail-closed-descendant-reconciliation`; PR #4087, “Fail closed on incomplete descendant reconciliation.” Revalidate branch/PR state before implementation because the local branch was observed ahead of and behind its remote during planning.
- The PR’s intended behavior is destructive-workflow safety: after selected PRs merge, every Graphite-reported descendant root must be refreshed, restacked, verified against local trunk ancestry and provider topology, submitted when needed, and reverified against GitHub facts. Any unproven postcondition must produce a failed partial completion, not success.
- Active repository orientation says stacking is moving toward explicit, capability-split, provider-neutral seams. This refactor must not add ambient Graphite construction or create a new monolithic provider interface. It is a local behavior-preserving cleanup of the current Graphite-backed Flow landing implementation.
- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance.ts` grew from 701 to 933 lines in the PR. It currently contains:
  - the `performGraphiteMaintenance` dispatcher;
  - ordinary next-landing cleanup/restack/submit orchestration;
  - strict multi-root descendant reconciliation;
  - strict local ancestry, provider-parent, and GitHub postcondition verification;
  - generic warning-or-failure helpers driven by policy flags.
- `maintenance-plan.ts` currently defines `MaintenanceTargetPlan` as `mode` plus six correlated policy fields. `buildMaintenanceTargetPlan()` derives all of them from `mode`, so the interface permits combinations that the sole constructor never emits.
- The strict descendant path receives broad `skip | halt` operation results and uses `stopFailure()` to turn warning-grade outcomes back into failures even though required descendant reconciliation is always fail-closed.
- `isRemotePrProvenCurrent()` and `isPrMetadataCurrentForMaintenance()` both implement the same open/head-SHA/base-current predicate using `validateOpenPrBasics(...)` plus a trunk-base check.
- `merge-loop.ts` calls `performGraphiteMaintenance()` and separately calls `planGraphiteMaintenanceTargets()` to derive `ObservedDescendantMaintenance`. Preserve this behavior unless returning the selected mode from the maintenance outcome clearly removes the duplicate planning call without widening the public API.
- The user selected **focused extraction**: move strict descendant orchestration into a dedicated module and share only narrow, genuinely identical facts/operations. Do not build a generic parameterized reconciliation framework.
- The user explicitly deferred the review finding about splitting `land-graphite-maintenance.test.ts`, which currently crosses 1,000 lines.

## Files, symbols, tests, and documentation

### Primary production files

- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance-plan.ts`
  - `MaintenanceMode`
  - `MaintenanceTargetPlan`
  - `planGraphiteMaintenanceTargets()`
  - `scopeForMaintenanceRestack()`
  - `shouldRefreshExpectedShasAfterRestack()`
  - `refreshTargetsAfterMaintainedBranch()`
  - descendant failure aggregation/repair formatting currently colocated here
- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance.ts`
  - `performGraphiteMaintenance()`
  - `maintainNextLandingBranches()`
  - `reconcileDescendantRoots()` / `reconcileDescendantRoot()`
  - `GraphiteMaintenanceOutcome`, `GraphiteMaintenanceStop`, `failOrWarn()`
  - guard/refresh/delete/restack/submit helpers
  - duplicate PR-current predicate
- `ts/packages/incubating/extensions/flow/src/land/execution/merge-loop.ts`
  - import and call sites for maintenance execution/planning
  - `observeDescendantMaintenance()`
- New focused internal module under the same directory, recommended name:
  - `ts/packages/incubating/extensions/flow/src/land/execution/descendant-reconciliation.ts`

If extracting truly shared operation primitives is necessary to avoid an import cycle, use one narrowly named internal module such as `maintenance-operations.ts`. Do not introduce it merely to relocate wrappers; each exported primitive must remove duplication or encode an invariant.

### Tests

- `ts/packages/incubating/extensions/flow/test/unit/land-graphite-maintenance.test.ts`
  - update planner assertions to assert union variants rather than derived policy flags;
  - preserve existing ordinary-maintenance, strict postcondition, cleanup-policy, and multi-root aggregation coverage;
  - add or adjust type/runtime tests proving required descendants cannot take warning-grade paths;
  - do **not** split this file in this change.
- Existing broader Flow landing tests that exercise merge-loop phase attribution and partial completion:
  - `ts/packages/incubating/extensions/flow/test/land/unit/merge-loop.test.ts`
  - `ts/packages/incubating/extensions/flow/test/land/unit/execute.test.ts`
  - scenario/integration landing suites as selected by the package test command.

### Documentation/domain language

No user-facing command or domain vocabulary change is intended. Do not edit `CONTEXT.md` unless implementation reveals that an existing description of Canonical Landing Execution or descendant maintenance is factually stale. Do not update the active provider-neutrality Objective or ADR for this internal refactor.

## Implementation steps

### 1. Establish behavior-preserving boundaries before moving code

Record the current semantic contract from tests and call sites:

- required next-landing maintenance halts before another merge on failures;
- no-target cleanup failures can remain warning-grade where currently supported;
- required descendant reconciliation attempts every root and aggregates failures;
- refresh/guard failures prevent landed-branch deletion;
- after successful root refresh and the pre-delete child check, branch deletion follows `preserve` versus `free` policy;
- descendant restack success is not trusted until local ancestry and provider parent are verified;
- submit is skipped only when GitHub already proves the reconciled head/base state;
- successful submit is reverified;
- descendant failures carry `descendant-maintenance`, while ordinary cleanup failures carry `merge-maintenance-cleanup`;
- observed landed PRs and cleanup state survive every partial-completion result.

Use these as invariants during extraction. Avoid opportunistic message rewrites because tests and human recovery guidance depend on exact semantics.

### 2. Replace `MaintenanceTargetPlan` with an honest discriminated union

In `maintenance-plan.ts`, replace `mode` plus correlated fields with variants that carry only data needed by that legal mode. A suitable shape is:

```ts
type MaintenanceTargetPlan =
  | { readonly mode: "required-next-landing"; readonly branches: readonly string[] }
  | { readonly mode: "required-descendants"; readonly branches: readonly string[] }
  | { readonly mode: "none"; readonly branches: readonly [] }
  | { readonly mode: "blocked-descendants"; readonly branches: readonly [] };
```

Adjust exact empty-array typing if it makes construction needlessly awkward, but do not restore correlated policy booleans. Delete `MaintenanceSeverity` and `buildMaintenanceTargetPlan()` if direct variant construction is clearer.

Derive operation details at the owning workflow boundary rather than storing them as independent state:

- required descendant restack scope is `upstack`;
- required next-landing restack scope is `branch-only`;
- warning versus halt behavior is selected by the ordinary workflow’s discriminant, not a free-standing severity field;
- checked-out conflict handling and delete behavior are fixed by the workflow that invokes the gateway;
- skipped-scope prose is rendered by the relevant failure/warning formatter rather than carried as a callback in a plan object.

Narrow helper inputs with `Extract<MaintenanceTargetPlan, ...>` where a function supports only selected modes. This should make it impossible to pass `blocked-descendants` or `required-descendants` into warning-grade ordinary maintenance helpers.

Preserve target-selection precedence in `planGraphiteMaintenanceTargets()` exactly: next selected landing branch, then remaining future landing branch, then final descendant policy, otherwise none.

### 3. Extract strict descendant reconciliation as one cohesive workflow

Create `descendant-reconciliation.ts` and move the strict workflow there:

- multi-root refresh/guard phase and failure collection;
- pre-delete child safety check and cleanup-policy handling as required by descendant reconciliation;
- per-root restack;
- post-restack local SHA reload and expected-SHA update;
- local trunk-ancestry proof;
- provider-parent proof;
- pre-submit GitHub fact load and current-state decision;
- forced submit when needed;
- post-submit GitHub verification;
- branch-specific and aggregate failure construction;
- blocked-descendant partial-completion construction if that keeps all strict descendant failure semantics cohesive;
- descendant-specific recovery guidance.

Expose one focused entry point, for example `reconcileDescendantRoots(options)`, whose input requires the `required-descendants` plan variant and whose outcome is only:

- proceed; or
- halt with `phase: "descendant-maintenance"` and a `LandingExecutionFailure`.

Do not expose warning/skip outcomes from this module. This deletes `stopFailure()` and prevents warning-grade handling from compiling in the strict path.

Keep `performGraphiteMaintenance()` as the small dispatcher in `maintenance.ts`:

- blocked descendants → strict failed partial completion;
- required descendants → focused reconciliation entry point;
- required next landing / none → ordinary maintenance path.

Avoid a new generic “maintenance pipeline” configured by callbacks, policy objects, or arrays of postconditions. The extraction should reduce concepts, not move the current matrix into a framework.

### 4. Share only narrow facts and operations

Identify the smallest genuinely shared seams needed by both workflows.

- Consolidate the duplicate PR-current check into one pure helper that accepts PR facts, expected branch, expected local SHA, and expected base. Keep it beside other maintenance facts or in the module that already owns `validateOpenPrBasics`; do not create a file for this one predicate alone.
- If guard, refresh, pre-delete child verification, or deletion are reused across modules, make their contracts factual or narrowly operational. Prefer results that preserve gateway facts over results already converted through warning/failure policy.
- Keep ordinary warning construction in ordinary maintenance and strict failure construction in descendant reconciliation.
- If sharing these operations would require a broad context object with mode flags, duplicate a small amount of direct gateway plumbing rather than recreate `MaintenanceTargetPlan` as hidden policy machinery.
- Avoid import cycles. `maintenance.ts` may import the descendant entry point; therefore descendant reconciliation must not import runtime values back from `maintenance.ts`. Move only genuinely shared types/primitives to a neutral internal owner when necessary.

A successful extraction should leave `maintenance.ts` narrating ordinary maintenance and dispatch, while `descendant-reconciliation.ts` narrates the strict fail-closed algorithm end to end.

### 5. Simplify outcome and observation plumbing

Update `merge-loop.ts` imports and any affected types after the extraction.

Prefer one source of truth for the selected mode. If `performGraphiteMaintenance()` can return the mode or a typed descendant observation without complicating its result, use that to eliminate the second `planGraphiteMaintenanceTargets(plan, index)` call. Otherwise retain the pure second planning call; do not introduce stateful coupling merely to remove one deterministic invocation.

Preserve:

- `PerformedGraphiteMaintenance`’s externally consumed proceed/skip/halt behavior for ordinary maintenance;
- halt phase attribution;
- `ObservedDescendantMaintenance` values and reduction semantics;
- report snapshots for landed PRs, warnings, retained/deleted branches, and descendant outcome.

### 6. Update tests without performing the deferred test-file split

In `land-graphite-maintenance.test.ts`:

- change planner assertions from the old matrix fields to exact discriminated variants;
- remove assertions for `severity`, `isDescendantRoot`, `shouldHaltOnRefreshFailure`, conflict policies, and callback prose when those fields no longer exist;
- preserve tests for target-selection ordering and refresh-target derivation;
- keep strict descendant tests proving fail-closed behavior for refresh, ancestry, provider topology, PR fact lookup, submit, post-submit verification, cleanup policy, and multiple roots;
- retain the test proving every descendant root is attempted and failures aggregate;
- add a focused assertion that strict descendant execution cannot return warning-grade success. Prefer compile-time narrowing through the entry-point return type plus runtime outcome assertions over type-test tricks.

Only adjust other tests where imports or intentionally changed internal types require it. Do not rename or reorganize broad test sections as a disguised test split.

### 7. Remove stale policy machinery

After compilation succeeds, delete obsolete symbols and branches:

- `MaintenanceSeverity`;
- `buildMaintenanceTargetPlan()` if no longer needed;
- `severity`, `isDescendantRoot`, `shouldHaltOnRefreshFailure`, checkout-policy, and formatting-callback fields from maintenance plans;
- `stopFailure()` and unreachable warning-to-failure fallback text;
- duplicate PR-current predicates;
- descendant-only helpers left in ordinary `maintenance.ts`;
- exports/imports made obsolete by module ownership changes.

Run a bounded stale-symbol search for all removed concepts before validation.

## Execution strategy

This is a coupled semantic refactor, not a same-shape mechanical rewrite. Use staged, precise edits after reading each affected section; do not use opaque `text.replace()` scripts. A codemod is not warranted because the important work is changing ownership and narrowing contracts, not uniformly renaming syntax.

Recommended order:

1. introduce the discriminated plan union and make planner tests compile;
2. introduce the descendant module by moving behavior intact;
3. narrow shared operations and remove the strict path’s warning conversion;
4. update dispatcher and merge-loop imports;
5. remove dead policy fields/helpers;
6. run final stale-symbol searches.

Although imports and assertions will change in several files, they are consequences of one semantic API change rather than independent file-local edits. Keep this work in one coordinated implementation session instead of a refactor swarm so type errors can guide the dependency order.

Required final searches should include:

```bash
rg -n 'MaintenanceSeverity|isDescendantRoot|shouldHaltOnRefreshFailure|stopFailure|buildMaintenanceTargetPlan' \
  ts/packages/incubating/extensions/flow
rg -n 'isRemotePrProvenCurrent|isPrMetadataCurrentForMaintenance' \
  ts/packages/incubating/extensions/flow/src/land
```

The first search should return no obsolete policy machinery; the second should show only the single canonical current-PR predicate chosen by the implementation.

## Validation guidance

Start with focused feedback, then run repository-required TypeScript lanes:

```bash
pnpm --dir ts --filter @nseng-ai/flow run check
pnpm --dir ts --filter @nseng-ai/flow run test
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-sanity
just ts-test-typescript-style-guard
```

Also run `git diff --check`. If formatting fails, use `just ts-format-fix`; if lint has autofixable failures, use `just ts-lint-fix`, then rerun the affected checks.

Behavioral validation must demonstrate:

- no landing policy or command behavior changed;
- blocked and failed descendant reconciliation still exits nonzero after reporting already-landed PRs;
- every descendant root is attempted where safe;
- cleanup still honors `preserve` versus `free`;
- ordinary next-landing failures retain their existing phase and halt/warning behavior;
- no descendant failure is converted into a warning-grade completion;
- CI-relevant shared-cache tests remain fake-driven and introduce no forbidden module/process/timer mutation.

## Risks, assumptions, and open questions

### Risks

- **Behavior drift while moving error construction.** Exact failure phase, landed observations, cleanup state, and repair hints are safety-relevant. Move behavior first, simplify second, and rely on existing scenario assertions.
- **Replacing flags with repeated switches.** The discriminated union should centralize workflow dispatch, but every helper should not independently switch over all modes. Narrow helper inputs at the call boundary.
- **A shallow shared-operations module.** Do not create pass-through wrappers merely to avoid duplicate lines. Shared code must own a factual invariant or a nontrivial destructive-operation guard.
- **Provider-neutrality regression.** Keep Graphite mechanics in the current Graphite-backed landing implementation, but do not expand those mechanics into generic workflow contracts or a monolithic provider seam.
- **Import cycles through `MergeLoopState`.** Both current maintenance and the extracted workflow mutate the merge-loop state. Use type-only imports where sufficient, or move only the minimal shared state contract to a neutral existing owner if needed; do not duplicate state models.

### Assumptions

- Breaking internal module boundaries is allowed; these execution modules are not exported through the curated `@nseng-ai/flow/land` API.
- Existing in-memory reconciliation transitions remain valid test infrastructure and are not part of this refactor.
- Exact test-file decomposition is a separate follow-up and must not be folded into this work.
- No external research is required; repository code, tests, PR description, and active orientation are the sources of truth.

### Open implementation-level questions

These are non-blocking and should be resolved by the smallest coherent code shape:

- Whether blocked-descendant failure formatting lives in the new descendant module or remains with pure plan-derived presentation. Prefer the new module if doing so makes `maintenance-plan.ts` a genuinely pure planner.
- Whether shared destructive-operation guards deserve `maintenance-operations.ts`. Create it only if at least two workflows share meaningful implementation and its API remains mode-neutral.
- Whether to return the selected maintenance mode from execution to avoid replanning in `merge-loop.ts`. Do so only if it simplifies the contract overall.

## Review and remediation checklist

Before considering the refactor complete, review the merged diff against these criteria:

- `maintenance.ts` is materially smaller and reads as dispatcher plus ordinary maintenance, not two interleaved engines.
- Descendant reconciliation has one focused entry point and no warning-grade result.
- `MaintenanceTargetPlan` is a discriminated union with no free-standing correlated severity/boolean policy matrix.
- Impossible combinations cannot be constructed through the exported type.
- There is one canonical PR-current predicate.
- No parameterized generic reconciliation framework or callback policy bag replaced the old matrix.
- Failure phases, partial-completion reports, branch cleanup, and recovery guidance remain behaviorally unchanged.
- No new ambient Graphite dependency or provider-private state leaks into a neutral contract.
- The existing over-1k maintenance test file was updated but intentionally not split, matching user direction.
- All obsolete symbols are absent under the final bounded `rg` checks.

If implementation cannot extract strict reconciliation without introducing a broad policy framework or duplicating destructive safety logic, stop and reassess module ownership rather than preserving a worse abstraction merely to satisfy the file move.