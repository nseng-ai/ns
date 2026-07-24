# Delete residual submit metadata-prewrite code

## Goal and outcome

Create a small cleanup PR directly upstack of `whole-body-pr-replacement/simplify-submit-pipeline`. Remove code, presentation state, and fixtures that became dead or misleading when that stack moved Submit PR metadata generation from a pre-publication metadata-prewrite phase to post-publication batching.

The finished change should leave ordinary `ns flow submit` with its current behavior:

1. inspect the stack;
2. submit and verify PRs;
3. generate and apply complete title/body metadata only for PRs newly created by that invocation.

It should no longer advertise or model a separate pre-submit `metadata` phase or matrix column, and it should contain no orphaned traversal utility or temporary commit-body compatibility shape left behind by the removed prewrite implementation.

This is a causal dead-code cleanup, not a broader redesign of submit internals.

## Branch and provenance

- Planning source branch: `whole-body-pr-replacement/simplify-submit-pipeline`
- Planning source commit: `347dba7b39fb5db452066c1f37cb2b7b378fbcbb` (`Generate new PR metadata after submit`)
- Commit date: `2026-07-24T15:11:34-07:00`
- Intended placement: create a new Graphite PR directly upstack of the current tip, because the cleanup depends on the preceding submit-pipeline simplification.
- The source branch and SHA are forensic anchors, not mechanical checkout requirements. Use attached branch-context/loader evidence to determine the implementation branch, and revalidate the symbol anchors below before editing.

## Context and discovered facts

The cumulative stack from `master` through the planning commit removes roughly 4,500 lines and deletes the old `submit-pr-metadata-prewrite.ts` implementation and tests. The current tip now generates complete PR metadata after publication in `generateSubmitPrDescriptions`.

Stable findings from direct repository inspection on the source commit:

- `ts/packages/capabilities/flow/src/submit/parent-branch-chain.ts` defines `ParentBranchWalkStep` and `walkParentBranchChain` but has no remaining importer. On `master`, `submit-plan.ts` used it to determine metadata-prewrite eligibility; the current `submit-plan.ts` no longer does.
- `SubmitMetadataProgressReason` and `compactSubmitMetadataCellText` in `submit-matrix-progress.ts` have no production caller. Their only surviving caller is a unit assertion in `submit-matrix-progress.test.ts`.
- Production writes only the `description` matrix column. The `metadata` column remains declared and exercised only by presentation tests.
- `SUBMIT_CORE_PHASES` still declares a `metadata` phase, but current `runSubmitCommand` performs no work in it. It emits only `phase-done` with `detail: "deferred until PR creation"`; actual generation is under `descriptions` after submit and verification.
- `bindMatrixSubmitProgress` retains a special tail-note branch for `phase-progress` events in the `metadata` phase. Current production emits no such event.
- `PrCommitMessage.body` is marked as temporary prewrite compatibility, while `RealGithubPrGateway.getPrCommitMessages` constructs headline-only values and PR generation formats only commit headlines.
- `SubmitStackNewBranch` now contains only `kind`, `branch`, and `parentBranch`. One `submit.test.ts` fixture still carries obsolete `commitMessages` and `diff` fields from the former inventory/prewrite shape.
- The `successfulSubmitResponses` scenario helper accepts `existingPrBody`, but the sole caller that varies it belongs to a duplicate existing-PR test. Existing PRs are partitioned by identity only and are deliberately not read or rewritten.
- `messageBody` remains in several fake GitHub JSON payloads even though the gateway ignores it.
- `metadataGateway` is poorly named but remains live: it supplies stack inspection required to distinguish existing from newly created PRs. Do not delete it in this PR.
- `updateStackPrs`, the post-publication PR-description pipeline, `createNsSubmitRuntime`, `createNsPrDescriptionRuntime`, and `submit/index.ts` remain reachable. They are not dead-code candidates for this change.

The repo default validation entrypoint is `just`. A planning-time attempt to invoke `pnpm --dir ts exec vitest ...` was blocked before tests ran because Corepack exposed pnpm `11.15.1` while the project requires `11.8.0`. Treat this as an environment/toolchain fact to revalidate, not a product failure; use repo-sanctioned `just` recipes and the repository's configured package-manager path rather than bypassing version enforcement.

## Decisions and boundaries

### In scope

- Delete the now-unreferenced parent-branch traversal module.
- Remove the vestigial submit `metadata` phase and its no-work completion event.
- Collapse the submit matrix to its live `description` column.
- Remove the dead metadata-reason vocabulary, formatter, and metadata-only progress-note behavior.
- Update tests that assert the old phase/column shape while preserving coverage of phase ordering, matrix event forwarding, and post-publication description progress.
- Remove directly obsolete prewrite-era fixture fields, comments, helper options, and duplicate coverage.

### Out of scope

- `ts/packages/capabilities/flow/src/submit/index.ts`: do not replace the internal barrel or broadly rewrite imports. It remains reachable, and changing it would mix architectural cleanup into this causal deletion PR.
- `ts/packages/capabilities/flow/src/submit/ns-runtime.ts`: do not trim reachable runtime wrappers/re-exports or rename `metadataGateway` here.
- Post-publication metadata generation and batching (`submit-pr-descriptions.ts`, `pr-description-orchestration.ts`): retain behavior and coverage.
- Submit command semantics, CLI flags, package exports, README/skill/objective semantics, and GitHub gateway method inventory: no user-visible behavior is changing, so no documentation update is expected unless implementation reveals an inaccurate current-contract statement.
- Generic matrix-core tests that happen to use the arbitrary key string `metadata`: those tests exercise generic matrix behavior, not Submit's removed metadata concept, and need not be renamed.

### Rejected alternatives

- **Strict zero-reference deletion only:** rejected because it would leave a no-op user-visible phase and an unwritten matrix column that falsely represent removed work.
- **Broad submit-internals simplification:** rejected because reachable barrels, wrappers, and naming cleanup are not caused by the prewrite deletion and deserve separate review if pursued.
- **Amending the current PR:** rejected in favor of a distinct upstack cleanup PR, preserving the dependency and making the deletion easy to review.

## Files, symbols, and tests

### Production code

1. Delete `ts/packages/capabilities/flow/src/submit/parent-branch-chain.ts` in full.
2. Edit `ts/packages/capabilities/flow/src/submit/submit-matrix-progress.ts`:
   - narrow `SubmitMatrixColumnKey` to `"description"`;
   - delete `SubmitMetadataProgressReason`;
   - remove the Metadata entry from `SUBMIT_MATRIX_COLUMNS`;
   - delete `compactSubmitMetadataCellText` and its comment;
   - retain the generic cell methods because production uses them for description state.
3. Edit `ts/packages/capabilities/flow/src/phase-stream/phase-stream-specs.ts`:
   - remove the `metadata` entry from `SUBMIT_CORE_PHASES`;
   - preserve order as checkpoint → preflight → restack → submit → verification → descriptions.
4. Edit `ts/packages/capabilities/flow/src/submit/submit.ts`:
   - delete the standalone `phase-done` event for `phaseKey: "metadata"` after inventory;
   - do not move post-publication generation; it remains after verification under `descriptions`.
5. Edit `ts/packages/capabilities/flow/src/submit/submit-progress.ts`:
   - simplify `bindMatrixSubmitProgress` so `phase` forwards directly to `input.matrix.phase`;
   - remove the metadata-only tail-note comment and branch.
6. Edit `ts/packages/capabilities/flow/src/submit/github-pr-gateway.ts`:
   - remove optional `body` from `PrCommitMessage` and the temporary-prewrite comment;
   - retain headline parsing and all gateway methods.

### Tests and fixture cleanup

1. Edit `ts/packages/capabilities/flow/test/unit/submit-matrix-progress.test.ts`:
   - remove the `compactSubmitMetadataCellText` import/assertion;
   - update phase declarations to omit `metadata`;
   - update matrix declarations and row-cell fixtures to contain only `description`;
   - keep tests proving structured events are forwarded once, checks are inserted at the named boundary, frames render row cells, and PR links map to new rows.
2. Edit `ts/packages/capabilities/flow/test/scenario/submit-command.test.ts`:
   - update expected phase and matrix declarations to omit metadata;
   - remove `existingPrBody` from `successfulSubmitResponses`;
   - remove the behaviorally duplicate “empty existing PR title and body” test while retaining the stronger existing-PR untouched test and its negative assertions;
   - remove ignored `messageBody` from commit JSON fixture payloads used only as prose-generation input.
3. Edit `ts/packages/capabilities/flow/test/unit/submit.test.ts`:
   - remove obsolete `commitMessages` and `diff` fields from the `kind: "new"` stack-inspection fixture;
   - rewrite/remove the stale comment referring to a metadata phase while preserving useful active-operation assertions for stack inspection, current-PR verification, and model generation.
4. Edit `ts/packages/capabilities/flow/test/unit/github-pr-gateway.test.ts`:
   - remove `messageBody` from the commit JSON fixture; continue asserting that commit headlines parse correctly.
5. Edit `ts/packages/capabilities/flow/test/scenario/regenerate-pr-command.test.ts` only if the `PrCommitMessage` shape or stale-fixture grep requires it; remove ignored `messageBody` while preserving regenerate behavior coverage.

No test should be deleted merely because it mentions PR descriptions or metadata. In particular, preserve batch preparation/application, no-edit-on-preparation-failure, ordered application, edit-failure, provenance, and newly-created-PR generation coverage.

## Implementation steps

1. **Revalidate the dependency and working state.** Confirm the implementation branch is upstack of the submit-pipeline simplification, the worktree is clean, and the old prewrite module remains absent. Search for the symbols and exact phase/column keys listed below before editing.
2. **Delete the orphan.** Remove `parent-branch-chain.ts`. Confirm no import/export needs adjustment; the current tree has none.
3. **Remove the fake presentation lifecycle.** In one coherent change, remove the metadata phase specification, the no-op event in `runSubmitCommand`, the metadata-only progress tail branch, and the metadata matrix column/reason formatter.
4. **Narrow the compatibility data shape.** Make `PrCommitMessage` headline-only and remove the stale temporary compatibility comment.
5. **Update behavior-facing tests.** Change expected phase lists and matrix declarations to reflect the live pipeline. Keep assertions focused on the remaining semantic phases and description-cell events.
6. **Remove obsolete fixture residue.** Delete the extra stack-inspection fields, the unused existing-body helper option and duplicate test, ignored commit-body payload fields, and stale comments. Do not remove live detailed PR/diff/commit setup required for newly created PR metadata generation.
7. **Run stale-concept searches.** Distinguish Submit-specific residue from generic matrix tests. Expected Submit production results after cleanup:
   - no `phaseKey: "metadata"`;
   - no Submit matrix `key: "metadata"` or `column: "metadata"`;
   - no `SubmitMetadataProgressReason`, `compactSubmitMetadataCellText`, `walkParentBranchChain`, or `ParentBranchWalkStep`;
   - no `Temporary prewrite compatibility`, `existingPrBody`, `metadata-prepared`, or `amending-metadata-commit`;
   - generic `matrix-progress-core.test.ts` may still use `metadata` as an arbitrary sample column key.
8. **Format and validate.** Use the repo's autofix recipes if format/lint reports mechanical issues, then rerun validation.
9. **Review the final diff as a deletion PR.** Verify changed files stay within this plan, no post-publication behavior was altered, and test deletions remove duplication/scaffolding rather than meaningful outcomes.

## Execution strategy

Use precise semantic edits, not a codemod or `refactor-swarm`. Although several files change, this is not a same-shape bulk refactor: one module is deleted, four coupled production files lose distinct pieces of a lifecycle, one type is narrowed, and tests require meaning-aware assertion updates. Read each affected section and make targeted edits. Do not use opaque ad hoc `text.replace()` scripts.

Finish with bounded `rg` stale-concept checks because the change removes a concept and several related names. If implementation unexpectedly expands into five or more truly same-shape file-local transformations beyond the listed fixture removals, reconsider `refactor-swarm` per `skills/enriched-plan-save/references/refactor-execution-strategy.md` instead of manually repeating broad edits.

## Validation guidance

Use the repository baseline and changed-file judgment; ordinary validation scope is the implementation agent's responsibility. At minimum:

1. Run focused Flow tests covering:
   - submit matrix/phase presentation;
   - submit orchestration;
   - GitHub PR gateway parsing;
   - submit and regenerate-pr scenarios affected by fixture changes.
2. Run TypeScript formatting, lint, and native TypeScript 7 checks through repo-sanctioned commands. If formatting fails, use `just ts-format-fix`; if lint has autofixable failures, use `just ts-lint-fix`, then rerun checks.
3. Run the default repository validation entrypoint:

   ```bash
   just
   ```

   Expected result: success with no formatting, lint, typecheck, default-test, or style-guard regression attributable to the change.
4. Run integration/isolated lanes if required by the changed-file judgment or by `just` output; do not move tests between lanes for this cleanup.
5. Run a bounded stale-concept search, for example:

   ```bash
   rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
     'walkParentBranchChain|ParentBranchWalkStep|SubmitMetadataProgressReason|compactSubmitMetadataCellText|phaseKey: "metadata"|existingPrBody|Temporary prewrite compatibility' \
     ts/packages/capabilities/flow/src ts/packages/capabilities/flow/test | head -n 200
   ```

   Expected result: no matches. Separately inspect remaining literal `metadata` matches rather than demanding zero repo-wide matches, because current PR metadata terminology and generic matrix sample keys remain valid.

## Risks, assumptions, and STOP conditions

### Risks and mitigations

- **Accidentally deleting current PR metadata generation:** retain the `descriptions` phase and all `generateSubmitPrDescriptions` behavior and tests. This PR removes only prewrite-era presentation/state.
- **Mistaking generic sample terminology for product residue:** leave `matrix-progress-core.test.ts` sample-column uses alone unless they import Submit-specific types.
- **Over-cleaning reachable internals:** if a symbol has a production importer, do not delete or inline it under this plan merely because it has one caller.
- **Weakening existing-PR safety coverage:** retain one explicit scenario proving existing PR title/body are not fetched, generated, or edited.
- **Toolchain mismatch:** do not bypass pnpm version policy. Resolve/use the repo-sanctioned toolchain path before interpreting test failures.

### Assumptions

- Removing an unstarted/no-work phase is an intentional correction to progress output, not a compatibility break requiring deprecation. `NsProgressPhaseEvent.phaseKey` values are runtime strings and the package is private/unreleased.
- No README, skill, or objective text promises a standalone metadata phase or two-column Submit matrix; planning grep found no such documentation.
- A one-column per-PR matrix remains useful because description generation still reports branch/PR-level active, prepared, done, failed, and skipped states.

### Plan-specific STOP conditions

Stop and reassess rather than widening the PR if any of these are discovered:

1. A live production consumer outside the inspected Flow tree relies on the Submit `metadata` phase key or matrix column as a compatibility contract.
2. `parent-branch-chain.ts` has regained an importer, or the implementation base predates removal of `submit-pr-metadata-prewrite.ts`.
3. Any runtime path still constructs or consumes `PrCommitMessage.body` for prompt generation or another behavior.
4. Removing the phase/column requires redesign of generic phase-stream or matrix-core APIs rather than simple narrowing of Submit-owned configuration and tests.

## Inherited evidence and revalidation

### Stable inherited evidence

- Direct source/reference audit at commit `347dba7b3` established the orphaned parent-chain module and production-unwritten metadata matrix column.
- `git grep` against `master` showed the causal history: `submit-plan.ts` used `walkParentBranchChain`, and `submit-pr-metadata-prewrite.ts` plus `submit.ts` used the metadata reason formatter before this stack removed those paths.
- Three independent read-only audits agreed that post-publication description generation, gateway methods, and runtime wrappers remain live and should be retained.

### Volatile facts to revalidate

- Current import/reference counts for every deletion candidate.
- Current phase order and matrix columns in source and tests.
- Clean worktree and upstack dependency before branch creation/commit.
- Available pnpm/Node toolchain and the exact repo-sanctioned focused-test invocation.

### Material open questions

None. Scope and stack placement were resolved during grilling: causal cleanup only, as a new PR directly upstack of the current tip.

## Review and remediation

Before considering the implementation complete:

1. Read the complete diff, including deleted tests, rather than trusting green commands.
2. Compare changed paths to the in-scope list; explain or revert every deviation.
3. Confirm the remaining Submit phase declaration matches actual runtime work and the remaining matrix column has production writers.
4. Inspect the retained existing-PR scenario and newly-created-PR metadata tests to ensure they still assert meaningful safety and behavior.
5. Re-run all declared gates after any formatter, lint fixer, or remediation edit.
6. Check `git status` for generated/untracked artifacts and confirm no plan, Branch Memory, objective, or unrelated barrel cleanup entered the commit.
7. If validation exposes a real dependency on removed presentation keys, document the consumer and return to the relevant STOP condition instead of restoring dead scaffolding silently.
