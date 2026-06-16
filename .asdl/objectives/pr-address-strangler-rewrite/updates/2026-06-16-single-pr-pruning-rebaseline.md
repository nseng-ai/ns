# Single-PR Pruning Forces Strangler Rebaseline

## Summary

Branch `pr-address-stack-feedback-pruning` simplifies `pr-address` around the
retained single-PR feedback flow. It removes the stack-wide `stack-address`
skill, stack-feedback exec operations, stack schemas, and stack-oriented tests,
and updates the retained skill/docs around `download-feedback`, `get-feedback`,
`map-branch-prs`, classification, planning, mutation, and finalization for one
PR at a time.

The same branch also removes the Objective's previously landed strangler
guardrails: `src/app/run-engine.ts`, `src/legacy`, the import-boundary static
test, the RunEngine app-contract test, and the shared source-file walker. The
clean `src/core` feedback/gateway leaves remain.

## Objective Impact

The Objective should not continue claiming the three-zone boundary and RunEngine
façade as current completed trunk state if this branch lands. The roadmap rows
for the `src/{core,legacy,app}` boundary and the RunEngine façade are moved back
to rebaseline, not because the historical work never happened, but because the
branch removes those artifacts from the prospective default-branch state.

The core carve row stays complete: retained `download-feedback`/`get-feedback`
paths still consume the carved `core` feedback leaves, and package-local
`@asdl/pr-address` check/test passes at this tip. The open RunEngine
`feedback`/`details`/`status` rows remain open, with an added warning that the
current retained surface is still the single-PR exec helper set, not an
app/RunEngine replacement.

## Follow-Ups

- Decide whether to restore the original `app`/`core`/`legacy` import-boundary
  plan or replace it with a smaller single-PR-centered isolation strategy.
- Do not resume the RunEngine read-only verb rows until that boundary decision is
  explicit.
- If the original plan survives, re-add the boundary/app-contract guardrails
  before treating the first two roadmap rows as complete again.
- If the plan changes, rewrite the Objective around the retained single-PR
  surface rather than quietly preserving obsolete app/legacy completion evidence.

## Evidence

- Local committed branch diff against Graphite parent
  `add-pr-stack-feedback-command`: one commit, `cd00a8e3b` (`Simplify pr-address
  to single-PR workflow`).
- Working tree was clean before Objective tracking edits.
- The diff deletes `src/app/run-engine.ts`, `src/legacy/.gitkeep`,
  `test/unit/import-boundary.test.ts`, `test/unit/run-engine-contract.test.ts`,
  and `test/support/source-files.ts`; it also deletes stack-wide skill, schema,
  command, fixture, and scenario-test files.
- Verification: `pnpm --dir ts --filter @asdl/pr-address run check` passed, and
  `pnpm --dir ts --filter @asdl/pr-address run test` passed (25 files, 330
  tests).
- PR evidence was unavailable because `gh pr view` failed with GitHub HTTP 401;
  local committed branch evidence was sufficient.
