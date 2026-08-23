---
name: code-split-pr
disable-model-invocation: true
description: Plan the split of one oversized PR or diff into a stack of decision-sized, reviewable PRs.
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
- **After:** implementation, tests, fixtures, types, and exports made unreachable or obsolete by the preceding cutover.

### Deletion PRs

Prefer a pure deletion PR over folding substantial dead-code removal into a decision PR, even when the deletion is an obvious consequence of that decision. A deletion PR earns its place by de-noising either adjacent decision PR — preceding or following. It deletes only code its parent already proved unreachable or obsolete, and its parent stays green while retaining that residue. It preserves runtime and public behavior, touches only dead code, and is independently revertible.

## Steps

### 1. Establish the donor

The donor is required: a PR, branch, commit range, or uncommitted worktree diff. Gather evidence when present — the originating plan or spec, session reports, review threads. Done when you hold the complete donor diff and its changed-file list.

### 2. Mine the donor for learnings

The implementation knows things the original plan does not. Enumerate what it discovered: tests encoding invariants legible neither from the plan nor the pre-change codebase, documented deviations, review-finding fixes, edge cases handled only in code. Classify every learning as one of:

- assigned to a specific batch;
- promoted into a batch's reviewer question, when it changes what the reviewer must judge;
- an intentional drop, named as such.

Done when every donor test is accounted for by name or glob and every learning carries a classification.

### 3. Batch

Attempt few decision batches first; one decision PR is the default opening bid, and additional reviewer questions must be argued. Then inspect every decision boundary for substantial pure code motion that deserves mechanical isolation, including deletion PRs (see **Deletion PRs**). For each decision batch, write its **reviewer question** — the single question the PR asks. For each mechanical batch, name the adjacent decision PR whose review, conflict resolution, or reversion it makes safer, and state the proof that behavior is unchanged.

Assign every changed donor file to exactly one batch: this is the **coverage map**, and it is the step's required artifact. Split decision work only when reviewer questions are genuinely distinct or the combined diff is unreviewably large. Split mechanical work when isolating high-volume motion gives reviewers and conflict resolvers a trustworthy semantic-free unit. For every boundary, answer why the adjacent batches should not combine. Done when the coverage map is total and every boundary carries its non-combination answer.

### 4. Order

Prerequisites come before dependents; additive phases come before cutovers, so each intermediate stack state stays green and honest — behavior claims, guidance, and exports match what is actually wired at that point. Done when the batches form one total order and each intermediate state carries a written one-sentence description of its coherent, shippable behavior; those sentences feed the executor handoff.

### 5. Choose the rebuild strategy

Recommend **fresh stack from trunk with the donor retained** whenever any intermediate PR state must differ from a slice of the final diff — compatibility residue, code retained then deleted upstack, additive phases. Recommend **in-place splitting of the donor** only when the final diff partitions cleanly by hunks. Either way, **diff-to-zero** governs donor retirement: the donor stays alive until the finished stack's tip diffs empty against it, except deliberate improvements made while constructing reviewable intermediate states. Done when one strategy is named and the condition that selected it is stated for this donor.

### 6. Emit and iterate

Emit the plan in the shape below, ending every emitted plan with the required concise summary, and invite iteration. Revise until the user accepts the plan or ends the session; acceptance still leaves execution to the caller. The summary is an output contract, not authorization to mutate branches or execute the plan.

## Plan shape

1. **Ordered batches**, each with: slug suggestion; class; reviewer question (decision) or adjacent decision plus behavior-preservation proof (mechanical); contents and areas; dependencies; why it should not combine with an adjacent batch; learnings carried.
2. **Coverage map**: donor file → batch.
3. **Rebuild-strategy recommendation** with its rationale for this donor.
4. **Executor handoff**: per-branch expectation that each intermediate branch passes the repository's validation and stays honest; the donor **diff-to-zero** verification (step 5); and a description skeleton per decision batch from the rubric below.
5. **Summary**: the final section of the emitted plan. Include every proposed batch exactly once and in stack order. Each numbered entry must use this compact shape:

   ```markdown
   1. **<concise human-readable PR title>**
      **Content:** <what this PR changes.>
      **Decision PR:** <the single reviewer question or decision boundary and why it is independent of adjacent work.>
   ```

   Replace the final label with **Mechanical PR:** for ordinary mechanical batches; its rationale must name the review, conflict-resolution, or reversion benefit and the adjacent decision it supports. Use **Mechanical deletion PR:** for pure deletion batches; explain why isolated dead-code removal improves comparison or review and remains independently revertible. Keep class and rationale together on this one labeled line—do not emit separate `Class:` and `Rationale:` fields. The summary supplements rather than replaces the detailed ordered batches, coverage map, rebuild strategy, or executor handoff.

## Decision-PR description rubric

1. **Decision** — one sentence.
2. **Previously** — behavior before this PR.
3. **After this PR** — behavior this PR alone introduces.
4. **Intentionally unchanged** — behavior deferred upstack.
5. **Revert consequence** — what returns if only this PR is reverted.
6. **Reviewer focus** — 2–4 concrete invariants to check.
