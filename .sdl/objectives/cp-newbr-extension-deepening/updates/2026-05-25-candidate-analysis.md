# Candidate Analysis

## Summary

Created `candidate-dispositions.md` as the working disposition log for the six PR #649 deepening candidates. Candidate 1, checkpoint seam plus pending worktree snapshot, is the first implementation slice. Candidate 2 follows as the new-branch transaction shape. Candidate 5 is the next likely policy deepening. Candidate 3 is parked until snapshot and branch naming clarify the shared model-drafting need. Candidate 4 is folded into Candidate 2 unless a separate Graphite seam becomes real. Candidate 6 is accepted as an ongoing behavior-first testing policy, not as a standalone universal fake framework.

Evidence: local branch diff against `master` includes the PR #649 `/cp` and `/newbr` implementation files plus this Objective record. Graphite parent is `master`. PR evidence for the current branch was unavailable; local committed branch evidence was sufficient.

## Objective Impact

The first roadmap item is complete: the Objective now has a candidate inventory and disposition log. The checkpoint seam plus pending worktree snapshot item is marked in progress because it is the next implementation slice.

The main architectural guardrail remains active: avoid premature extraction by applying the deletion test. A new Module should concentrate behavior that would otherwise reappear across `/cp`, `/newbr`, or their tests.

## Follow-Ups

- Start Candidate 1 by shaping the pending-worktree snapshot and checkpoint-preparation seam.
- Keep untracked snippets under scrutiny: they are useful for branch slug generation, but may not belong in the generic checkpoint snapshot Interface.
- Use local fake adapters or harnesses; keep command-order assertions only where order is the safety guarantee.
