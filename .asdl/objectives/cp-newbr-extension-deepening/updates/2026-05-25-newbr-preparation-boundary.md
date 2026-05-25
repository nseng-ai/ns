# Newbr Preparation Boundary Reframed

## Summary

Recorded the design decision to stop treating branch naming policy as the next standalone slice. Branch naming alone is too narrow; the next useful decision is whether `/newbr` needs a holistic preparation or plan boundary that produces a typed plan before `newbr-transaction.ts` applies it.

That preparation boundary would be allowed to coordinate requested or generated slug input, fallback naming, branch availability, checkpoint-message readiness, and typed preparation failures. It should not become a shallow wrapper around `branch-slug.ts`, and it should not extract shared small-model policy unless the preparation seam proves real leverage.

Evidence: explicit human direction in this session, with local branch evidence still showing Candidate 2 complete on top of Graphite parent `brmem-plans/checkpoint-worktree-snapshot-seam`. No new implementation validation was required for this tracking-only update.

## Objective Impact

Candidate 5 is parked as a standalone branch-naming extraction. Candidate 3 is partially unparked only through the `/newbr` preparation-boundary decision, not as an abstract shared model/provider policy.

The next roadmap item is now to decide whether a `newbr-preparation.ts` or `newbr-plan.ts` Module should produce a typed plan with branch name, base slug/source, checkpoint message, and fallback/availability metadata before the transaction phase.

## Follow-Ups

- Evaluate a typed `/newbr` preparation or plan boundary before doing any branch-name-only refactor.
- Keep `newbr-transaction.ts` as the apply phase for stash, Graphite branch creation, restore, and commit.
- Use behavior-first tests to prove the preparation deletion test before introducing a new production Module.
