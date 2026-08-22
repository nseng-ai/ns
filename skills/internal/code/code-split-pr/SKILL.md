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
- **Mechanical PR** — removes review noise while preserving behavior exactly. It earns its place only by demonstrably shrinking a later decision PR's reviewable diff. A "mechanical" change that alters behavior is a decision PR wearing a costume; reclassify it.

Mechanical taxonomy (reference): new package creation; file moves; behavior-preserving refactors (renames, function extraction, shape normalization); test-fixture modernization ahead of a behavioral change; dead-code deletion after a behavioral switch.

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

Attempt few batches first; one decision PR is the default opening bid, and splitting must be argued. For each decision batch, write its **reviewer question** — the single question the PR asks. For each mechanical batch, name the later decision PR it de-noises. Assign every changed donor file to exactly one batch: this is the **coverage map**, and it is the step's required artifact. Split a batch only when the reviewer questions are genuinely distinct or the combined diff is unreviewably large; for every boundary, answer why the adjacent batches cannot combine. Done when the coverage map is total and every boundary carries its non-combination answer.

### 4. Order

Prerequisites come before dependents; additive phases come before cutovers, so each intermediate stack state stays green and honest — behavior claims, guidance, and exports match what is actually wired at that point. Done when the batches form one total order and every intermediate state is describable as a coherent, shippable behavior.

### 5. Choose the rebuild strategy

Recommend **fresh stack from trunk with the donor retained** whenever any intermediate PR state must differ from a slice of the final diff — compatibility residue, code retained then deleted upstack, additive phases. Recommend **in-place splitting of the donor** only when the final diff partitions cleanly by hunks. Either way, the donor stays alive until the finished stack's tip diffs empty against it, except deliberate improvements made while constructing reviewable intermediate states.

### 6. Emit and iterate

Emit the plan in the shape below and invite iteration. Revise until the user accepts the plan or ends the session; acceptance still leaves execution to the caller.

## Plan shape

1. **Ordered batches**, each with: slug suggestion; class; reviewer question (decision) or de-noised target PR (mechanical); contents and areas; dependencies; why it cannot combine with an adjacent batch; learnings carried.
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
