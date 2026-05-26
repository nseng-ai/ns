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
- [x] Decide whether `/newbr` needs a typed preparation/plan boundary before the transaction.
  - Added `newbr-preparation.ts` as the preparation owner for requested slug normalization/rejection, untracked snippets, `pi --print` slug drafting, fallback naming, branch availability/suffixing, checkpoint-message preparation, typed warnings, and typed failures.
  - Returned `NewBranchPlan` with branch name, base slug, slug source, suffix metadata, and checkpoint message before `newbr-transaction.ts` applies the transaction.
  - Kept `newbr-flow.ts` as the thin command workflow for snapshot loading, clean-worktree refusal, notifications, transaction invocation, final cleanliness probing, and success/failure text.
  - Kept `newbr-transaction.ts` as the apply phase for stash, Graphite branch creation, restore, and commit.
  - Deletion test passed: deleting `newbr-preparation.ts` would push real planning complexity back into `newbr-flow.ts`.
- [x] Decide whether small-model drafting should become a shared Module.
  - Kept checkpoint message drafting and branch slug drafting separate for this Objective.
  - Localized branch slug drafting, fallback warnings, and prompt construction in `newbr-preparation.ts` while preserving current `pi --print` behavior.
  - Parked shared provider/model/auth/timeout/output policy until a future cross-command need proves enough leverage.
- [x] Decide whether Graphite branch creation needs an explicit Adapter.
  - Decided not to introduce a standalone Graphite Adapter in this slice.
  - Kept `gt create <branch> --no-interactive --no-ai` as a private transaction helper inside `/newbr`'s explicit user-facing Graphite contract.
  - Covered Graphite-create failure, rollback restoration success, rollback restoration failure, and post-branch restore failure in tests.
- [x] Park standalone branch naming policy depth.
  - Human decision after Candidate 2: branch naming alone is too narrow for the next slice.
  - Reframe slug generation, fallback, suffixing, and availability checks as possible responsibilities of the `/newbr` preparation/plan boundary.
  - Revisit a standalone branch-name policy Module only if later evidence proves it independently passes the deletion test.
- [x] Align tests with behavior-first fakes.
  - Candidate 1 added a local pending-worktree harness and kept `/newbr` safety-order assertions for prepare, stash, Graphite create, restore, and commit.
  - Candidate 2 added `newbr-transaction.test.ts` for typed transaction outcomes and rollback safety, while `newbr-flow.test.ts` keeps high-level user-facing failure coverage.
  - The preparation boundary added `newbr-preparation.test.ts` for typed plans, typed failures, model fallback warnings, branch suffixing, and checkpoint-preparation failure.
  - `newbr-flow.test.ts` now stays focused on command-level stops, safety ordering across major phases, preparation warning surfacing, and transaction failure text.
  - A universal TypeScript fake framework remains unnecessary.
- [x] Validate accepted TypeScript changes.
  - `bun run --cwd ts check` passed for Candidate 1, Candidate 2, and the preparation boundary.
  - `bun run --cwd ts test` passed for Candidate 1, Candidate 2, and the preparation boundary.
  - `just dprint-check` passed after Candidate 2 and after the preparation-boundary Objective updates.
  - Run broader validation only if later changes escape the TypeScript Pi extension package.
- [ ] Close by explicit human decision.
  - Confirm every candidate has a disposition.
  - Confirm accepted refactors are implemented or split.
  - Add closure context to `objective.md`, then add a Closure Marker.

## Parked

- [ ] Cross-reference or update `pi-extension-deepening` only if work in this Objective changes broader Pi extension architecture decisions.
- [ ] Split a follow-on Objective if shared model drafting, `/newbr` preparation architecture, or Graphite transaction architecture becomes larger than the narrow PR #649 follow-up.
- [x] Keep standalone branch naming policy parked unless the `/newbr` preparation-boundary work proves it deserves an independent Module.
- [ ] Revisit a universal TypeScript fake framework only if multiple production seams prove the same fake Adapter shape.
