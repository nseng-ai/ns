---
name: plan-stack-from-findings
description: "Plan a stack from findings: take a set of findings already in context — review feedback, audit results, architecture recommendations — and group them into independently reviewable batches, order the batches by priority and by dependency, and flag every priority inversion, producing an abstract ordered-batch plan. Use when turning findings or issues into an ordered stack of change batches, or when another skill needs findings converted into a batched, dependency-ordered plan."
metadata:
  internal: true
---

# Plan a Stack from Findings

Turn a loose set of **findings** into an ordered **stack** of **batches** — one independently reviewable change per batch, sequenced so each batch builds only on batches before it.

This skill is one composable step. It runs on findings already in context, whatever produced them, and hands an abstract plan back to the caller. It does **not** rank findings (priority arrives with each finding), and the plan it returns names no branches, gates no approval, and edits no code — naming, approval, and execution belong to the caller.

## Findings it expects

Findings arrive in context as prose. Each should convey roughly: what the issue is, how confidently it should land (a **priority tier**), what it touches, and the gist of the change. Work with whatever detail is present; do not demand a fixed set of fields.

Priority tiers, most-to-least confident. Each source maps its own axis (trunk-acceptance, payoff, reviewer blocking-ness) onto these — you consume the tier and stay agnostic about why it was assigned:

- `high` — low risk, clear evidence, obvious acceptance.
- `medium` — plausible and bounded, with some uncertainty.
- `low` — useful but interpretation- or context-dependent.
- `stretch` — high-risk/high-reward, broad, or likely to need discussion.

## 1. Batch the findings

Group each finding into a batch that is reviewable and revertible on its own. Combine findings into one batch only when they share a root cause, an invariant, an implementation seam, or a hard dependency; otherwise keep them separate.

Done when every finding belongs to exactly one batch.

## 2. Order the batches

Sort batches by priority tier, most confident first. Then reason across all batches about which changes must precede which: when a batch builds on another's change, the prerequisite comes first even if it is lower priority. This is a priority **inversion** — record each one with the dependency that forced it.

Done when the batches are in one total order and every case of a lower-priority batch preceding a higher-priority one carries an inversion note naming its cause.

## 3. Emit the plan

Return the ordered batches. For each batch:

- a short kebab **slug suggestion** (not a branch name);
- included finding ids;
- priority tier;
- why these findings are grouped;
- batches this one depends on;
- any inversion note from step 2;
- areas expected to change;
- validation hints, when the findings carry them.

Done when every batch appears in order with each element it has.
