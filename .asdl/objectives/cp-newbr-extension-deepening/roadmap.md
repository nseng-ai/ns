# Roadmap

## Work

- [ ] Establish the candidate inventory and disposition log.
  - Preserve the six PR #649 deepening candidates from the architecture review.
  - Use the dispositions: implement, reject with reason, park with rationale, or split into a follow-on Objective.
  - Keep this Objective narrow to `/cp` and `/newbr`.
- [ ] Implement or reject the checkpoint seam plus pending worktree snapshot first.
  - Deepen checkpoint behavior so `/cp` and `/newbr` do not need to pass the full Pi runtime through the shared seam.
  - Decide what pending worktree facts belong behind the snapshot Interface: branch, status, diff, untracked files, clean state, detached-head state, and trunk refusal.
  - Preserve checkpoint message validation, repair feedback, deterministic fallback, and commit creation behavior.
- [ ] Decide the new-branch transaction Module shape.
  - Keep safety-critical sequencing visible: prepare before stash, stash before Graphite create, restore before commit.
  - Improve locality around stash, restore, branch creation, rollback reporting, and final checkpoint commit.
  - Avoid freezing incidental shell choreography in tests.
- [ ] Decide whether small-model drafting should become a shared Module.
  - Compare checkpoint message drafting through Pi model registry with branch slug drafting through `pi --print`.
  - Concentrate provider/model/auth/timeout/output policy only if the deletion test shows shared leverage.
- [ ] Decide whether Graphite branch creation needs an explicit Adapter.
  - Keep `/newbr`'s Graphite dependency explicit and local to the command's user-facing contract.
  - Cover failure and rollback behavior if this seam is deepened.
- [ ] Decide branch naming policy depth.
  - Evaluate whether `branch-slug.ts` should grow into a deeper branch-name policy Module that owns generation, sanitation, fallback, suffixing, and availability checks.
  - Reject or park this if it remains a shallow string-helper extraction.
- [ ] Align tests with behavior-first fakes.
  - Use local fake adapters or harnesses consistent with existing TypeScript package tests.
  - Keep command-order assertions only where ordering is the safety guarantee.
  - Add regression coverage before or alongside accepted refactors.
- [ ] Validate accepted TypeScript changes.
  - Run `bun run --cwd ts check`.
  - Run `bun run --cwd ts test`.
  - Run broader validation only if changes escape the TypeScript Pi extension package.
- [ ] Close by explicit human decision.
  - Confirm every candidate has a disposition.
  - Confirm accepted refactors are implemented or split.
  - Add closure context to `objective.md`, then add a Closure Marker.

## Parked

- [ ] Cross-reference or update `pi-extension-deepening` only if work in this Objective changes broader Pi extension architecture decisions.
- [ ] Split a follow-on Objective if shared model drafting or Graphite transaction architecture becomes larger than the narrow PR #649 follow-up.
- [ ] Revisit a universal TypeScript fake framework only if multiple production seams prove the same fake Adapter shape.
