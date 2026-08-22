---
name: code-split-pr
disable-model-invocation: true
description: Plan the split of one oversized PR or diff into a stack of decision-sized, reviewable PRs. Emits a plan only.
metadata:
  internal: true
---

<!-- Experimental: trial-stage doctrine. Expect real splits to reshape it. -->

# code-split-pr

Turn one oversized diff — the **donor** — into a plan for a stack of PRs where each PR encodes **one human decision and its isolated consequences**. This skill plans only: it emits a proposal and iterates with the user. Branch mutation, stacking-tool choice, and submission belong to the caller.

## Two PR classes

- **Decision PR** — asks the reviewer exactly one question about product or architecture. Its diff is that decision's consequences and nothing else. Tests, docs, type adjustments, and local cleanup travel with the decision they prove.
- **Mechanical PR** — isolates high-volume code motion while preserving behavior exactly. It earns its place by making behavioral review, merge-conflict resolution, or reversion safer: reviewers can ignore the motion while judging decisions, conflict resolvers know that any semantic change is accidental, and the whole PR can be reverted without undoing intended behavior. A "mechanical" change that alters behavior is a decision PR wearing a costume; reclassify it.

Mechanical taxonomy (reference): new package creation without wiring; file moves; mass renames; behavior-preserving refactors (function extraction, shape normalization); test-fixture modernization ahead of a behavioral change; pure dead-code deletion after a behavioral switch.

Actively look for mechanical isolation on both sides of a decision:

- **Before:** moves, renames, fixtures, or shape changes that make the later behavioral diff smaller and clearer.
- **After:** implementation, tests, fixtures, types, and exports made unreachable or obsolete by the preceding cutover. Prefer a pure deletion PR over folding substantial dead-code removal into the decision PR, even when the deletion is an obvious consequence of that decision.

A post-cutover deletion PR must delete only code already proved unreachable or obsolete by its parent. Its parent must remain green while retaining that residue. The deletion PR must preserve runtime and public behavior, must not opportunistically refactor live code, and must be independently revertible.

## Steps

### 1. Establish the donor

The donor is required: a PR, branch, commit range, or uncommitted worktree diff. Gather optional evidence opportunistically when present — the originating plan or spec, session reports, review threads. Done when you hold the complete donor diff and its changed-file list.

### 2. Mine the donor for learnings

The implementation knows things the original plan does not. Enumerate what it discovered: tests encoding invariants legible neither from the plan nor the pre-change codebase, documented deviations, review-finding fixes, edge cases handled only in code. Classify every learning as one of:

- assigned to a specific batch;
- promoted into a batch's reviewer question, when it changes what the reviewer must judge;
- an intentional drop, named as such.

Done when every donor test is accounted for by name or glob and every learning carries a classification.

### 3. Batch

Attempt few decision batches first; one decision PR is the default opening bid, and additional reviewer questions must be argued. Then inspect every decision boundary for substantial pure code motion that deserves mechanical isolation, especially dead-code deletion after a cutover. For each decision batch, write its **reviewer question** — the single question the PR asks. For each mechanical batch, name the adjacent decision PR whose review, conflict resolution, or reversion it makes safer, and state the proof that behavior is unchanged. Do not reject a pure deletion PR merely because it de-noises a preceding rather than later decision PR.

Assign every changed donor file to exactly one batch: this is the **coverage map**, and it is the step's required artifact. Split decision work only when reviewer questions are genuinely distinct or the combined diff is unreviewably large. Split mechanical work when isolating high-volume motion gives reviewers and conflict resolvers a trustworthy semantic-free unit. For every boundary, answer why the adjacent batches should not combine. Done when the coverage map is total and every boundary carries its non-combination answer.

### 4. Order

Prerequisites come before dependents; additive phases come before cutovers, so each intermediate stack state stays green and honest — behavior claims, guidance, and exports match what is actually wired at that point. Done when the batches form one total order and every intermediate state is describable as a coherent, shippable behavior.

### 5. Choose the rebuild strategy

Recommend **fresh stack from trunk with the donor retained** whenever any intermediate PR state must differ from a slice of the final diff — compatibility residue, code retained then deleted upstack, additive phases. Recommend **in-place splitting of the donor** only when the final diff partitions cleanly by hunks. Either way, the donor stays alive until the finished stack's tip diffs empty against it, except deliberate improvements made while constructing reviewable intermediate states.

### 6. Emit and iterate

Emit the plan in the shape below and invite iteration. Revise until the user accepts the plan or ends the session; acceptance still leaves execution to the caller.

## Plan shape

1. **Ordered batches**, each with: slug suggestion; class; reviewer question (decision) or adjacent decision plus behavior-preservation proof (mechanical); contents and areas; dependencies; why it should not combine with an adjacent batch; learnings carried.
2. **Coverage map**: donor file → batch.
3. **Rebuild-strategy recommendation** with its rationale for this donor.
4. **Executor handoff**: per-branch expectation that each intermediate branch passes the repository's validation and stays honest; the donor diff-to-zero verification (stack tip vs donor empty except deliberate improvements); and a description skeleton per decision batch from the rubric below.

## Decision-PR description rubric

1. **Decision** — one sentence.
2. **Previously** — behavior before this PR.
3. **After this PR** — behavior this PR alone introduces.
4. **Intentionally unchanged** — behavior deferred upstack.
5. **Revert consequence** — what returns if only this PR is reverted.
6. **Reviewer focus** — 2–4 concrete invariants to check.
