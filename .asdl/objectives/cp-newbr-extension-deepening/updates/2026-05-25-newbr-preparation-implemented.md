# Newbr Preparation Boundary Implemented

## Summary

Implemented the `/newbr` preparation boundary as `newbr-preparation.ts`.

The new Module owns requested slug normalization/rejection, untracked snippet collection, `pi --print` slug prompt construction and invocation, model-output sanitation, fallback slug selection, branch-name availability and suffixing, checkpoint-message preparation, typed non-fatal warnings, and typed preparation failures. It returns a `NewBranchPlan` with `branchName`, `baseSlug`, `slugSource`, `usedSuffix`, and `checkpointMessage` before `newbr-transaction.ts` applies the stash/Graphite/restore/commit transaction.

`newbr-flow.ts` is now the thin command workflow for snapshot loading, clean-worktree refusal, preparation warning/error notification, transaction invocation, transaction failure formatting, final cleanliness probing, and success/warning reporting. The transaction boundary remains unchanged, and `branch-slug.ts` remains the small sanitation/truncation primitive.

Evidence: local committed branch diff on `newbr-preparation-boundary` against Graphite parent `newbr-transaction-boundary`. Verification passed with `bun run --cwd ts check`, `bun run --cwd ts test`, and `just dprint-check`. PR evidence was not required; local branch commits and validation were sufficient.

## Objective Impact

The preparation deletion test is positive. Deleting `newbr-preparation.ts` would push real preparation complexity back into `newbr-flow.ts`: slug drafting and fallback, untracked snippet reading, branch availability and suffixing, checkpoint-message readiness, typed warnings, and typed failures.

Candidate 3 remains parked as a standalone shared model-policy extraction. This slice intentionally preserved the current `pi --print` slug-drafting behavior and did not introduce shared provider/model/auth policy.

Candidate 5 remains parked as a standalone branch-name Module but is implemented where it has leverage: inside the broader preparation boundary. Candidate 6 improved because slug, fallback, suffixing, exhaustion, and checkpoint-preparation cases now have typed preparation tests, while flow tests stay focused on command-level behavior and safety ordering.

## Follow-Ups

- Keep shared model/provider policy parked unless a future cross-command need passes the deletion test.
- Keep standalone branch naming parked; use `newbr-preparation.ts` as the preparation-time owner for generation, fallback, availability, and suffixing.
- Ask for explicit human closure confirmation before closing this Objective.
