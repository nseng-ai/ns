---
name: plan-stack-from-findings
description: "Plan a stack from findings: take findings already in context — review feedback, audit results, architecture recommendations — and produce the fewest coherent landing batches, ordered by priority and dependency with every priority inversion flagged. Use when turning findings or issues into an ordered stack of change batches, or when another skill needs findings converted into a batched, dependency-ordered plan."
metadata:
  internal: true
---

# Plan a Stack from Findings

Turn a loose set of **findings** into the fewest coherent **landing batches**, then order those batches into a **stack**. Each batch should tell one reviewable story and build only on batches before it. For an ordinary finding set, target **one to three PRs**; one PR is the default first attempt, not one PR per finding.

This skill is one composable step. It runs on findings already in context, whatever produced them, and hands an abstract plan back to the caller. It does **not** rank findings (priority arrives with each finding), and the plan it returns names no branches, gates no approval, and edits no code — naming, approval, and execution belong to the caller.

## Findings it expects

Findings arrive in context as prose. Each should convey roughly: what the issue is, how confidently it should land (a **priority tier**), what it touches, and the gist of the change. Work with whatever detail is present; do not demand a fixed set of fields.

Priority tiers, most-to-least confident. Each source maps its own axis (trunk-acceptance, payoff, reviewer blocking-ness) onto these — you consume the tier and stay agnostic about why it was assigned:

- `high` — low risk, clear evidence, obvious acceptance.
- `medium` — plausible and bounded, with some uncertainty.
- `low` — useful but interpretation- or context-dependent.
- `stretch` — high-risk/high-reward, broad, or likely to need discussion.

## 1. Batch the findings

Start by attempting one landing batch. Combine findings when they share any coherent review narrative, including a product outcome, implementation area, lifecycle, validation suite, root cause, or invariant. Mixed priority tiers do not by themselves justify a split. Keep tests, docs, type adjustments, and local cleanup with the behavior they support.

Treat dependencies as a reason to combine by default. Split dependent work only when separate landing, review, deployment, or revert has clear value.

Split a batch only for one or more of these reasons:

- the findings affect genuinely unrelated subsystems;
- they have independent deployment or revert boundaries;
- some work is speculative while the rest is ready to land;
- the combined diff would be unreviewably large.

For every proposed boundary, answer: **Why can't this batch be combined with an adjacent batch?** If the answer is only priority, finding identity, change type (such as tests or docs), or a soft dependency, combine them. More than three landing batches requires an explicit explanation for why each adjacent pair cannot be combined.

Keep deferred or conditional findings outside the landing stack. State the evidence or decision that would activate them rather than manufacturing placeholder batches. For example, if ready findings form one coherent outcome while cadence work depends on future evidence, emit one landing batch now and list the cadence work as a conditional follow-up.

Done when every ready finding belongs to exactly one landing batch, every deferred or conditional finding is listed separately, and every split has a concrete non-combination rationale.

## 2. Order the batches

After batching for coherence, sort landing batches by priority, most confident first. A mixed-priority batch keeps the tiers of its included findings; do not split it merely to produce single-tier batches. Then reason across all batches about which changes must precede which. When a batch builds on another's change and separate landing has clear value, the prerequisite comes first even if it is lower priority. This is a priority **inversion** — record each one with the dependency that forced it.

Done when the landing batches are in one total order and every case of a lower-priority batch preceding a higher-priority one carries an inversion note naming its cause.

## 3. Emit the plan

Return the ordered batches. For each batch:

- a short kebab **slug suggestion** (not a branch name);
- included finding ids;
- priority tier or mixed-tier profile;
- the shared outcome or review narrative that makes the batch coherent;
- why it cannot be combined with an adjacent batch (omit only for a one-batch plan);
- batches this one depends on;
- any inversion note from step 2;
- areas expected to change;
- validation hints, when the findings carry them.

After the landing stack, list deferred or conditional findings with their activation evidence. If the plan has more than three batches, add an explicit summary explaining why no adjacent batches can combine.

Done when every landing batch appears in order with each applicable element, and non-landing findings are clearly separated from the stack.
