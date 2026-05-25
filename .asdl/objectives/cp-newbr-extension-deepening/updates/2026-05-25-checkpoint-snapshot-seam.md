# Checkpoint Snapshot Seam Implemented

## Summary

Implemented Candidate 1, the checkpoint seam plus pending worktree snapshot.

The new `pending-worktree.ts` Module loads root, branch, status, diff, and clean state through one structured snapshot path, returning typed errors for non-repository checkouts, detached HEAD, status failures, and diff failures. The new `checkpoint-pi.ts` Module is the neutral Pi checkpoint adapter for shared extension context types, checkpoint message preparation, spinner/source notifications, prompt construction, and prepared commit creation.

`/cp` now consumes the pending-worktree snapshot while keeping trunk refusal and clean-worktree refusal as command policy. `/newbr` consumes the same snapshot and no longer imports shared checkpoint behavior from `cp.ts`; untracked file content snippets remain local to branch slug generation.

Evidence: working-tree implementation diff on `brmem-plans/checkpoint-worktree-snapshot-seam`; Graphite parent reported as `deepen-cp-newbr-checkpoint-and-newbr-flows`; current-branch PR evidence was unavailable. Verification passed with `bun run --cwd ts check` and `bun run --cwd ts test`.

## Objective Impact

The checkpoint seam plus pending worktree snapshot roadmap item is complete. The first two open design questions are resolved for this Objective slice:

- The snapshot Interface owns raw repository facts and structured git fact-gathering errors, not command policy.
- Trunk refusal remains `/cp` policy; clean state is a snapshot fact interpreted by callers; detached HEAD is a structured error; untracked snippets stay in `/newbr` slug generation.

The deletion-test guardrail remains active for later candidates. Candidate 1 passed it because deleting `pending-worktree.ts` or `checkpoint-pi.ts` would push shared worktree facts or checkpoint Pi adapter behavior back into command modules and tests.

## Follow-Ups

- Continue with Candidate 2: new-branch transaction Module shape and rollback locality.
- Revisit Candidate 5 before deciding whether branch naming deserves a deeper policy Module.
- Keep Candidate 3 parked until branch slug drafting proves whether a shared small-model drafting Module is useful beyond checkpoint drafting.
