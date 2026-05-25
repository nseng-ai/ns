# Roadmap

## Work

- [x] Establish the candidate inventory and disposition log.
  - Preserved the six PR #649 deepening candidates in `candidate-dispositions.md`.
  - Recorded working dispositions: implement, reject, park, or fold into another candidate.
  - Kept this Objective narrow to `/cp` and `/newbr`.
- [x] Implement or reject the checkpoint seam plus pending worktree snapshot first.
  - Added `pending-worktree.ts` for root, branch, status, diff, clean state, and structured git snapshot errors.
  - Kept trunk refusal as `/cp` command policy and untracked file snippets as `/newbr` slug-generation input, not generic snapshot facts.
  - Added `checkpoint-pi.ts` as the neutral Pi checkpoint adapter used by both `/cp` and `/newbr`; `/newbr` no longer imports from `cp.ts`.
  - Preserved checkpoint message validation, repair feedback, deterministic fallback, and commit creation behavior.
- [x] Decide the new-branch transaction Module shape.
  - Added `newbr-transaction.ts` as the named boundary for stash push, stash-ref lookup, Graphite branch creation, stash restoration, and checkpoint commit.
  - Returned typed outcomes for stash failure, missing stash refs, Graphite-create rollback success/failure, restore failure after branch creation, and commit failure after branch creation.
  - Kept `newbr-flow.ts` responsible for snapshot loading, clean-worktree refusal, slug and branch-name policy, checkpoint message preparation, user-facing notifications, and the final clean/dirty probe.
  - Added transaction-level rollback tests and flow-level coverage for stash push failure, missing stash refs, and Graphite-create failure combined with restore failure.
- [ ] Decide whether small-model drafting should become a shared Module.
  - Compare checkpoint message drafting through Pi model registry with branch slug drafting through `pi --print`.
  - Concentrate provider/model/auth/timeout/output policy only if the deletion test shows shared leverage.
- [x] Decide whether Graphite branch creation needs an explicit Adapter.
  - Decided not to introduce a standalone Graphite Adapter in this slice.
  - Kept `gt create <branch> --no-interactive --no-ai` as a private transaction helper inside `/newbr`'s explicit user-facing Graphite contract.
  - Covered Graphite-create failure, rollback restoration success, rollback restoration failure, and post-branch restore failure in tests.
- [ ] Decide branch naming policy depth.
  - Evaluate whether `branch-slug.ts` should grow into a deeper branch-name policy Module that owns generation, sanitation, fallback, suffixing, and availability checks.
  - Reject or park this if it remains a shallow string-helper extraction.
- [~] Align tests with behavior-first fakes.
  - Candidate 1 added a local pending-worktree harness and kept `/newbr` safety-order assertions for prepare, stash, Graphite create, restore, and commit.
  - Candidate 2 added `newbr-transaction.test.ts` for typed transaction outcomes and rollback safety, while `newbr-flow.test.ts` keeps high-level user-facing failure coverage.
  - Continue using local fake adapters or harnesses consistent with existing TypeScript package tests.
  - Keep command-order assertions only where ordering is the safety guarantee.
  - Add regression coverage before or alongside accepted refactors.
- [x] Validate accepted TypeScript changes.
  - `bun run --cwd ts check` passed for Candidate 1 and Candidate 2.
  - `bun run --cwd ts test` passed for Candidate 1 and Candidate 2.
  - `just dprint-check` passed after Candidate 2.
  - Run broader validation only if later changes escape the TypeScript Pi extension package.
- [ ] Close by explicit human decision.
  - Confirm every candidate has a disposition.
  - Confirm accepted refactors are implemented or split.
  - Add closure context to `objective.md`, then add a Closure Marker.

## Parked

- [ ] Cross-reference or update `pi-extension-deepening` only if work in this Objective changes broader Pi extension architecture decisions.
- [ ] Split a follow-on Objective if shared model drafting or Graphite transaction architecture becomes larger than the narrow PR #649 follow-up.
- [ ] Revisit a universal TypeScript fake framework only if multiple production seams prove the same fake Adapter shape.
