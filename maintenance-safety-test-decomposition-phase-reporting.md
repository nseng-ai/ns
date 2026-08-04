# Remediation stack for land maintenance code quality findings

## Goal and outcome

Remediate the high- and medium-confidence findings from the thermo-nuclear review of the Flow landing stack (`22f30fabc..land-merge-execution-context`) without changing landing behavior, CLI output, failure semantics, or provider boundaries.

Produce a three-change Graphite stack:

1. **Simplify and unify post-merge maintenance safety** — remove unreachable warning-grade control flow, centralize the forced-refresh/deletion safety invariants shared by ordinary and descendant maintenance, and take the adjacent low-risk cleanups.
2. **Decompose Graphite maintenance tests** — a standalone test-only change that splits descendant reconciliation coverage out of the file this work pushed from 686 to 1144 lines.
3. **Centralize merge-loop phase reporting** — make one function own the mapping from merge-loop results and observations to report phase outcomes, and remove the otherwise-unnecessary failed descendant observation state.

This ordering keeps the two HIGH findings together because dead-code removal makes the shared safety primitives natural, gives the user-requested F3 decomposition its own independently reviewable change, and isolates phase-report ownership from mutation-safety code. The resulting stack should preserve all externally visible behavior while deleting concepts and duplicated invariants.

## Context and discovered facts

- Review base: `22f30fabc`; reviewed tip: `land-merge-execution-context` (`644ea2ead` when planned).
- The reviewed stack introduced required fail-fast descendant reconciliation under `ts/packages/incubating/extensions/flow/src/land/execution/descendant-reconciliation.ts` and simplified maintenance planning to a discriminated union in `maintenance-plan.ts`.
- `OrdinaryMaintenance` currently has only:
  - `required-next-landing`, whose `branches` are non-empty in practice and whose failures halt; and
  - `none`, whose type fixes `branches` to `readonly []`.
- In `maintainNextLandingBranches`, `guardMaintenanceBranch`, `checkSubmitMaintenanceBranch`, `restackMaintenanceBranch`, and `submitMaintenanceBranch` run only inside loops over `maintenance.branches`. Their warning arms under mode `none` are therefore statically unreachable. Only branch cleanup/check operations outside those loops can still have legitimate best-effort warning behavior in `none` mode.
- `descendant-reconciliation.ts` and `maintenance.ts` independently encode the same safety invariants:
  - verify the branch SHA before `gt get --force`;
  - re-read Graphite children immediately before deletion and reject unexpected children;
  - classify deletion failures, including the same in-progress Git operation recovery message.
- Refresh behavior must **not** be over-generalized: ordinary next-landing refresh uses conflict handling `fail` and parses command failure diagnostics, while descendant refresh uses `defer` and receives a typed checkout-conflict result. Preserve these separate flows.
- Descendant deletion passes `checkedOutConflictHandling: "fail"`; the real command channel only returns `retained` when handling is `retain`. The current descendant `retained` success arm is production-impossible and can mask a fake/adapter contract violation.
- `DescendantRootPreparation` currently mixes `{ kind: "prepared" }` directly with `LandingExecutionFailure` and discriminates using `"type" in preparation`, while the adjacent PR-facts result uses an explicit `kind` union.
- `graphiteRefreshFailure` has a `branchRole: string` input with one caller and one value (`"next landing branch"`).
- `test/unit/land-graphite-maintenance.test.ts` grew from 686 to 1144 lines. Descendant-specific cases occupy most of the latter portion, while planning and ordinary next-landing/final-cleanup behavior share the same file. The file-local `createLandingPlan`, `createMergeLoopState`, and `createProgressRecorder` helpers are useful to both groups.
- Merge phase bookkeeping currently spans:
  - `observeDescendantMaintenance` / `reduceDescendantMaintenanceObservation` in `merge-loop.ts`;
  - `observedMaintenancePhases` in `execute.ts`, which ignores an observation of type `failed`; and
  - the merge failure branch in `executeLandingRequest`, which special-cases descendant failure and filters phase outcomes by `failedPhase`.
- Existing behavior to preserve: a descendant-maintenance halt occurs only after every target merge has been verified, so the report records `merge` completed and `descendant-maintenance` failed. A merge-maintenance-cleanup halt may occur mid-loop and must retain its current phase history. The final failed phase itself remains appended by `failedResult`.
- Active orientation requires provider-owned topology and no new ambient Graphite dependencies. This remediation stays within the existing `LandContext` gateway boundary and must not introduce a new external-tool gateway.
- The downgraded findings about combining `shouldPreserveLandedBranches` with `deferredDeletionBranch`, and splitting the already-large `src/land/testing.ts`, are intentionally deferred. They do not block this remediation stack and should not be opportunistically included.

## Stack design

### Change 1 — `simplify-land-maintenance-safety`

**Included findings:** F2 HIGH, F1 HIGH, F5 LOW, F6 LOW, F10 LOW.

**Review narrative:** make all required branch maintenance fail-closed through one set of safety invariants, while keeping best-effort final cleanup explicit and separate.

**Why it cannot be combined with Change 2:** Change 2 is intentionally test-only and exists to restore a file-size boundary. Mixing test movement with production restructuring would obscure whether behavior changed or tests merely moved.

**Dependencies:** none.

### Change 2 — `split-descendant-reconciliation-tests`

**Included finding:** F3 MEDIUM (presumptive file-size blocker).

**Review narrative:** mirror the production module boundary in tests and bring the original maintenance test file back below 1000 lines without changing assertions.

**Why it cannot be combined with adjacent changes:** this is a pure decomposition with independent review/revert value, and the user explicitly requires F3 to be its own change. It should be performed after Change 1 so tests are moved in their final post-remediation form rather than moved and then edited across two branches.

**Dependencies:** Change 1 for sequencing only; there is no semantic dependency.

### Change 3 — `centralize-land-phase-reporting`

**Included finding:** F4 MEDIUM.

**Review narrative:** make report phase history a single owned transformation rather than cooperation among observation state, a helper that ignores failures, and a caller-side filter.

**Why it cannot be combined with Change 1:** phase-report construction is a separate invariant and test surface from Graphite mutation safety. It should remain independently reviewable and revertible.

**Dependencies:** none semantically; stack it after Change 2 to avoid mixing production edits into the test-decomposition branch.

**Priority inversions:** none. The HIGH structural remediation lands first. The F3 split precedes F4 only to preserve the explicitly requested standalone boundary and avoid moving phase-related tests after editing them; both are MEDIUM.

## Files, symbols, tests, and documentation

### Production files

- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance-plan.ts`
  - `MaintenanceTargetPlan`, `RequiredNextLandingMaintenance`, `OrdinaryMaintenance`
  - Remove or narrow `OrdinaryMaintenance` if mode-specific dispatch makes it unnecessary.
- `ts/packages/incubating/extensions/flow/src/land/execution/maintenance.ts`
  - `performGraphiteMaintenance`
  - `maintainNextLandingBranches`
  - `failOrWarn`
  - `guardMaintenanceBranch`
  - `checkGraphiteBranchBeforeDelete`
  - `deleteLocalGraphiteBranchAfterLanding`
  - `checkSubmitMaintenanceBranch`
  - `submitMaintenanceBranch`
  - `restackMaintenanceBranch`
  - `graphiteRefreshFailure`
  - `localBranchDeletionFailureDetails`
- `ts/packages/incubating/extensions/flow/src/land/execution/descendant-reconciliation.ts`
  - `DescendantRootPreparation`
  - `reconcileDescendantRoots`
  - `guardDescendantBranch`
  - `checkLandedBranchBeforeDelete`
  - `deleteLandedBranch`
- Add a focused internal module under `src/land/execution/`, tentatively `maintenance-safety.ts`, only if its API deletes the duplicated safety concepts rather than merely renaming them.
- `ts/packages/incubating/extensions/flow/src/land/execution/merge-loop.ts`
  - `ObservedDescendantMaintenance`
  - `MergeLoopResult`
  - `observeDescendantMaintenance`
  - `reduceDescendantMaintenanceObservation`
- `ts/packages/incubating/extensions/flow/src/land/execution/execute.ts`
  - merge-loop result handling in `executeLandingRequest`
  - `observedMaintenancePhases`

### Test files

- `ts/packages/incubating/extensions/flow/test/unit/land-graphite-maintenance.test.ts`
  - Retain planning, required-next-landing maintenance, and no-descendant/final-cleanup coverage.
- Add `ts/packages/incubating/extensions/flow/test/unit/land-descendant-reconciliation.test.ts`
  - Move descendant fail-fast, postcondition, prepare-before-publish, and multi-root ordering coverage.
- Add a narrow test support module such as `ts/packages/incubating/extensions/flow/test/unit/land-maintenance-test-support.ts` only for fixtures genuinely shared by both suites (`createLandingPlan`, `createMergeLoopState`, `createProgressRecorder`, and shared constants). Do not introduce a generic builder that hides the scenario under test merely to reduce lines.
- `ts/packages/incubating/extensions/flow/test/land/unit/execute.test.ts`
  - Strengthen phase-history assertions for successful maintenance, descendant-maintenance failure, merge-maintenance-cleanup failure, and ordinary merge failure.
- `ts/packages/incubating/extensions/flow/test/land/unit/merge-loop.test.ts`
  - Update observation/result assertions if the `failed` descendant observation variant is removed.

### Documentation

No README, help text, or domain glossary changes are expected: the remediation preserves the user-visible semantics already documented by the reviewed stack. If implementation changes any message or phase semantics, stop and treat that as scope expansion rather than silently updating docs.

## Implementation steps

### Change 1: simplify and unify post-merge maintenance safety

1. **Replace mixed `OrdinaryMaintenance` orchestration with mode-specific flows.**
   - In `performGraphiteMaintenance`, dispatch explicitly on all four maintenance modes.
   - Keep `blocked-descendants` and `required-descendants` behavior unchanged.
   - Route `required-next-landing` to a required, halt-only maintenance function.
   - Route `none` to a small best-effort landed-branch cleanup function. This is the only ordinary mode where warning-grade cleanup outcomes remain legitimate.
   - Remove `failOrWarn` from branch refresh/restack/submit helpers. If explicit dispatch makes `failOrWarn` unnecessary altogether, delete it rather than retaining a one-use abstraction.
   - Update/narrow `MaintenanceTargetPlan` aliases so types reflect the mode-specific flows and impossible branches cannot be represented.

2. **Make required next-landing branch operations halt-only.**
   - `guardMaintenanceBranch`, `refreshMaintenanceBranch`, `restackMaintenanceBranch`, `checkSubmitMaintenanceBranch`, and `submitMaintenanceBranch` should return only proceed/submit/skip-submit or a `LandingExecutionFailure`; they must no longer construct unreachable warning alternatives.
   - Delete stale optional-descendant warning prose and associated `landingWarning` construction from these helpers.
   - Preserve the existing best-effort warning behavior for final landed-branch deletion under mode `none`, including checked-out branch retention.
   - Inline the single `"next landing branch"` role in `graphiteRefreshFailure`; remove the one-value `branchRole` parameter.

3. **Extract only the safety primitives that are genuinely shared.**
   - After step 2 converges the required paths, compare the ordinary and descendant implementations and extract a focused internal module.
   - Centralize the SHA guard before forced refresh. Inputs should be the execution context plus explicit repo/PR/branch/state facts; output should be `LandingExecutionFailure | undefined` (or an equally narrow explicit result).
   - Centralize the authoritative child-list pre-delete check for fail-closed paths. The caller supplies the exact allowed-child set/branches; the primitive owns querying and the refusal invariant.
   - Centralize deletion failure classification/message construction so the in-progress Git-operation recovery text has one owner.
   - Do **not** merge the ordinary and descendant refresh operations: their checkout-conflict contracts differ intentionally.
   - Do **not** build a generic policy/config object that recreates the deleted severity/boolean machinery. Prefer two direct orchestrators calling a few narrow primitives.

4. **Tighten descendant result contracts.**
   - Change `DescendantRootPreparation` to a conventional explicit union, e.g. `{ kind: "prepared"; proof } | { kind: "failure"; failure }`, matching `DescendantRootPrFacts`.
   - Replace the `"type" in preparation` check with a `kind` switch/guard.
   - When descendant deletion requested `checkedOutConflictHandling: "fail"` but receives `retained`, return a clear fail-closed execution failure (or throw only if the established gateway contract treats this strictly as a programmer invariant). Do not silently record success. Prefer a returned execution failure because the value crossed an external gateway boundary.

5. **Adapt tests without broad test movement yet.**
   - Preserve tests proving required next-landing and descendant moved-SHA guards halt before mutation.
   - Add/adjust a focused test proving a configured `retained` result under descendant `fail` deletion no longer proceeds silently.
   - Preserve tests proving mode `none` can retain a checked-out final local branch and report cleanup.
   - Remove type/test expectations for warning-grade outcomes that are now impossible in required branch loops.
   - Keep all tests in the existing file for this change; Change 2 owns movement.

### Change 2: decompose Graphite maintenance tests

1. **Create the descendant reconciliation suite by semantic ownership, not arbitrary line ranges.**
   - Move the no-warning-grade type assertion and descendant-specific reconciliation tests: checkout-conflicted refresh, descendant SHA guards, descendant deletion checks, restack/ancestry/provider-parent postconditions, PR submit verification, multi-root guard-before-mutate, prepare-all-before-publish, and fail-fast publication/preparation cases.
   - For parameterized tests that combine ordinary and descendant cases, split the cases so each suite owns its relevant behavior. Preserve assertion strength and names.
   - Keep maintenance planning tests in `land-graphite-maintenance.test.ts`, including selection of required descendant mode; planning belongs to the dispatcher rather than the descendant executor.

2. **Extract only shared fixture mechanics.**
   - Move shared constants and the three small fixture functions (`createLandingPlan`, `createMergeLoopState`, `createProgressRecorder`) to a narrow support file if both suites use them.
   - Keep `createTwoRootReconciliationContext` and `runTwoRootMaintenance` with the descendant suite; they encode descendant scenarios rather than generic maintenance mechanics.
   - Do not force every explicit test setup through a generic builder. The objective is fewer concepts and a clear file boundary, not merely fewer lines.

3. **Verify file-size and discovery outcomes.**
   - Both test suites should be comfortably below 1000 lines, with the original file no longer carrying descendant execution implementation details.
   - Confirm Vitest discovers both files and that no test was lost by comparing test names/counts before and after the move.
   - Run a grep for moved helper and describe names to ensure no duplicate stale definitions remain.

### Change 3: centralize merge-loop phase reporting

1. **Remove failure as a descendant observation state if it carries no independent information.**
   - Narrow `ObservedDescendantMaintenance` to actual observations that can produce completed/skipped report entries: `not-attempted`, `completed`, and `skipped`.
   - On a maintenance halt, let `MergeLoopResult.failedPhase` remain the sole failure fact; do not manufacture an observation that a downstream function intentionally ignores.
   - Simplify `observeDescendantMaintenance` / reduction accordingly, preserving success and no-descendant observations.

2. **Give one function ownership of merge-loop phase outcomes.**
   - Replace the current caller special case plus `observedMaintenancePhases` with one explicit transformation in `execute.ts` that receives the full `MergeLoopResult` (or its result type, observations, and optional failed phase) and emits only the completed/skipped phases that precede the final result.
   - Encode existing behavior directly rather than generating all phases and filtering one out by string name:
     - successful merge loop → `merge` completed plus observed descendant/cleanup phases;
     - descendant-maintenance failure → `merge` completed; omit a descendant completed/skipped entry because `failedResult` adds the failed phase;
     - merge-maintenance-cleanup failure → preserve current merge/cleanup history exactly and omit a completed entry for the failed cleanup phase;
     - merge failure → do not report merge completed.
   - Keep `failedResult` as the sole owner of appending the final failed phase.
   - Name the helper around phase ownership (for example `mergeLoopPhaseOutcomes`), not around incidental observation filtering.

3. **Lock phase invariants with table-driven tests.**
   - In `execute.test.ts`, assert the complete relevant ordered phase subsequence for success, descendant failure, cleanup failure, and merge failure—not only `failedPhase`.
   - In `merge-loop.test.ts`, update result expectations to show that failure attribution comes from `failedPhase`, not a parallel `descendantMaintenance: { type: "failed" }` marker.
   - Ensure no phase appears both completed/skipped and failed in one report.

## Refactor execution strategy

These are semantic TypeScript refactors affecting a small number of files per change, not a broad syntactic rename. Use **precise, reviewed edits**, not an opaque text-replacement script and not `refactor-swarm`:

- Change 1: read and edit the affected sections in `maintenance-plan.ts`, `maintenance.ts`, `descendant-reconciliation.ts`, and the focused tests. Although the same invariant appears in two files, the surrounding semantics differ; first narrow the ordinary flow, then extract the converged code deliberately.
- Change 2: move whole semantic test cases and helpers with precise edits across 2–3 files. Preserve test bodies verbatim where possible, then adjust imports. Do not use line-number-based shell splitting.
- Change 3: make focused edits in `merge-loop.ts`, `execute.ts`, and their two unit tests.

No suitable existing codemod is warranted because this is control-flow and ownership redesign, not a purely syntactic API migration. After each change, run bounded greps for stale concepts/names:

- Change 1: `failOrWarn`, dead optional-descendant warning prose, duplicated guard/delete refusal strings, `branchRole`, and `"type" in preparation`.
- Change 2: duplicate helper definitions and descendant test names remaining in the ordinary suite.
- Change 3: `{ type: "failed" }` descendant observations, `observedMaintenancePhases`, and phase-name filtering against `failedPhase`.

## Validation guidance

Follow `ts/AGENTS.md` and the `ns-typescript` toolchain. At minimum for each change:

1. Run the directly affected Vitest files using the workspace Vitest config, including both split files after Change 2 and `execute.test.ts` / `merge-loop.test.ts` after Change 3.
2. Run the Flow package test suite:
   - `pnpm --dir ts --filter @nseng-ai/flow test`
3. Run TypeScript formatting, lint, and native TS7 typecheck:
   - `just ts-format-check`
   - `just ts-lint`
   - `just ts-check`
4. Because Change 1 and Change 3 alter TypeScript control-flow/type architecture, run:
   - `just ts-test-typescript-style-guard`
5. Before declaring the stack ready, run the repository default validation entrypoint:
   - `just`

If formatting fails, use `just ts-format-fix`; if lint has autofixable failures, use `just ts-lint-fix`, then rerun the checks. Do not add module mocks, fake timers, process mutation, or other shared-cache-unsafe test mechanisms.

## Risks, assumptions, and open questions

- **Behavior-preservation risk:** mode-specific dispatch may accidentally change the best-effort cleanup behavior of mode `none`. Keep explicit tests for retained checked-out branches and deletion warning outcomes before deleting `failOrWarn` machinery.
- **Over-abstraction risk:** sharing refresh operations would force genuinely different checkout-conflict contracts behind flags. The plan explicitly excludes that. Shared code should own safety invariants, not whole workflow policies.
- **Failure-message compatibility:** tests and users may rely on detailed recovery text. Centralize existing wording verbatim unless a mismatch is itself proven; do not opportunistically rewrite messages.
- **Gateway-contract risk:** `retained` under a `fail` request is impossible in the real adapter but representable by the broad result union and configurable fake. Treat it fail-closed; do not widen the scope into redesigning `LandGraphiteGateway` unless implementation proves the type cannot otherwise stay honest.
- **Test-movement risk:** Vitest file discovery is path-based. Confirm both new and retained files are included by the package test command and compare collected tests.
- **Phase-history risk:** the current asymmetry between descendant failure and mid-loop cleanup failure is intentional. Preserve exact report behavior and use ordered phase assertions before simplifying state.
- **Assumption:** no user-visible CLI semantics, storage behavior, migrations, or compatibility surfaces change. If implementation reveals a required semantic change, stop and revise the plan rather than folding it into remediation.
- **Deferred, non-blocking work:** making `shouldPreserveLandedBranches` required may be taken only if it is a trivial touched-line cleanup with no new policy type; do not combine the two deletion-deferral concepts. Splitting `src/land/testing.ts` remains separate future debt.

## Review and remediation checklist

### After Change 1

- Required branch operations have no warning-grade result or warning construction.
- Mode `none` still owns explicit best-effort final cleanup behavior.
- SHA guard, pre-delete child validation, and deletion failure classification each have one authoritative implementation for fail-closed paths.
- Descendant and ordinary refresh flows remain separate.
- `DescendantRootPreparation` is explicitly discriminated.
- A production-impossible `retained` result cannot silently succeed in descendant deletion.
- No new Graphite dependency or provider-private topology read bypasses `LandContext`.

### After Change 2

- `land-graphite-maintenance.test.ts` is below 1000 lines.
- Descendant execution tests live with the descendant reconciliation boundary.
- Test names/counts and assertion strength are preserved.
- Shared support contains mechanics only, not scenario-obscuring abstractions.

### After Change 3

- One function owns completed/skipped merge-loop phase construction.
- `failedPhase` is the sole failure-attribution fact.
- No ignored `failed` descendant observation remains.
- Reports never contain the same phase as both completed/skipped and failed.
- Existing success, descendant partial-completion failure, cleanup failure, and merge failure histories are unchanged.

### Final stack review

Review the merged stack as code, not commits: confirm the remediation deletes concepts rather than reintroducing policy flags, all safety checks remain fail-closed, files remain cohesive, and no unrelated F7/F8 debt slipped into scope.