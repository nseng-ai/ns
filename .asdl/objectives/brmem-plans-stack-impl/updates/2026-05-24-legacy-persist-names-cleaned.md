# Legacy Persist Names Cleaned

## Summary

The legacy cleanup slice removed strict old persistence vocabulary from the canonical Pi extension helper source. The exported `PersistBrmemPlan*` types/functions were renamed to neutral `BrmemPlanStorage*` names, `persistBrmemPlan` became `storeBrmemPlanFromFile`, and `parsePersistBrmemPlanParams` became `parseBrmemPlanStorageParams`.

User-facing parameter errors now describe Branch Memory plan storage without naming the old `persist_brmem_plan` tool. Redundant prompt/guideline negative assertions were removed from the `create-brmem-plan-branch` tests, while the explicit legacy command/tool absence assertion remains as the registration-contract check.

Verification passed:

- `cd ts/packages/pi-extensions && bun test test/create-brmem-plan-branch.test.ts test/brmem-plan-branch.test.ts`
- `cd ts/packages/pi-extensions && bun run check`
- `just dprint-check`
- `git diff --check`

Strict stale-name search found no old persistence names in TypeScript source. Remaining old command/tool references in the focused test suite are intentional absence assertions. PR #626 corroborates the same source/test file set and completion evidence.

## Objective Impact

This completes the legacy cleanup/docs roadmap row and finishes the planned no-compatibility cleanup for the old `persist_brmem_plan` helper naming in canonical code. The broader hidden-reference risk is now de-risked across the skill/prompt migration paths and the TypeScript helper source.

The Objective still remains open for final stack review preparation.

## Follow-Ups

- Prepare the stack for review with clear PR descriptions for each slice.
