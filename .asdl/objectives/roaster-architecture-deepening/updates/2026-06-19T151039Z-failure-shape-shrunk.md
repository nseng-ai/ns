# Failure Shape Shrunk

## Summary

Candidate 4 now has branch-local shipped evidence. The `shrink-roaster-failure-consumed-shape` branch resolves the `RoasterFailure` depth mismatch by shrinking the failure interface to the shape actually consumed by roaster command seams: `{ type, message }`. `src/failures.ts` keeps semantic failure-code aliases for review definition, catalog, local diff, harness, and GitHub failure categories, but removes unused structured payload fields such as `command`, `stderr`, `code`, `path`, `reviewKey`, and `model`. Gateway and operation code now construct and consume the smaller shape directly, and the unused `failureMessage` / `isFailureOfType` helpers were removed.

Evidence considered: Graphite parent `roaster-context-runtime-vocabulary-refactor`; branch commit `151a0c37e`; local branch diff against that parent; name-status evidence showing only roaster source/test files changed before this Objective update; stale helper/field-consumption search; `pnpm --dir ts run check`; `pnpm --dir ts run test`.

## Objective Impact

The roadmap marks candidate 4 complete. The Objective decision is shrink, not deepen: the structured fields were dead weight for the current roaster contracts, while semantic failure codes remain available for exits and diagnostics. The candidate-4 premature-shrink risk is de-risked by preserving the consumed behavior and passing full TypeScript validation.

All four roadmap candidates now have definite shipped states, so the Objective is closure-ready and has been closed in the same update.

## Follow-Ups

- If future roaster callers need machine-readable failure diagnostics beyond `type` and `message`, introduce that as a new explicit output contract rather than reusing this Objective as unfinished work.
