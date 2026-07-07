---
name: objective-create-autoobjective
disable-model-invocation: true
description: Create an autoobjective ns Objective — roadmap and runner policy deliberately shaped for repeated autonomous Objective Runner steps with parent checkpoints.
---

# objective-create-autoobjective

Create one ns Objective whose roadmap and runner policy are intentionally shaped for repeated Objective Runner steps with parent checkpoints between committed slices. Autoobjective is colloquial shorthand for autonomous-pursuit design — never a schema, type field, or required wording; the product hook (`ns objective exec runner-step <slug>`) verifies preconditions at dispatch time and refuses records that do not satisfy them. This facade owns the autoobjective creation procedure and composes:

- `objective` (umbrella) and `objective-create` (step) own record mechanics: shared vocabulary, slug confirmation and root checks, required headings, Record Frontmatter, the interview, and Verify. Load both first.
- `objective-create`'s `references/execution-friendly-create.md` owns the execution-policy interview: timing, the minimum policy to gather, section placement, and row-level `Policy:`/`Evidence:` examples. Read it before asking policy questions; do not restate it.
- The `objective` skill's `references/execution-policy.md` owns the policy sections' template and interpretation rules, including the autonomy-designed minimum (durable goal, Definition of Progress, load-bearing assumptions and risks, runner boundaries and escalation guidance). Read it before drafting `## Definition of Progress` and `## Runner Policy`.

## Procedure

1. **Confirm autonomous drive is really wanted.** Horizon (bounded ↔ standing) and Drive (human ↔ autonomous) are orthogonal axes: autoobjective is the Drive value, composing with either horizon. If the user wants only execution-after-preview, that is ordinary execution-friendliness — weaker than autonomous pursuit — and needs no autoobjective shaping.
2. **Run the execution-policy interview.** Follow `references/execution-friendly-create.md`; the record must meet the execution-policy reference's autonomy-designed minimum. Never invent permission boundaries — stop and ask when durable policy context is thin.
3. **Shape runner-sized roadmap rows.** Each row is one committable slice the Runner can execute autonomously in a single step: concrete enough to act on without a fresh human decision, with completion evidence statable up front. Decision-bearing work stays out of autonomous rows — word it so the Runner escalates. Add row-level `Policy:`/`Evidence:` prose only where slice-local guidance differs from the Objective-level defaults.
4. **Verify and stop.** Run objective-create's Verify plus the execution-friendly reference's verification list; additionally confirm each roadmap row is runner-sized per step 3 and the autonomy-designed minimum is met.

## Layering

Composes with either horizon: a bounded autoobjective runs to its finish line; a standing autoobjective pairs the standing horizon with autonomous drive. The **steelthread + autoobjective** combination is common — a bounded, concrete, slice-shaped thread is a natural autorun target. Also layers with **wayfinding** only after Crystallization: Question Rows are decisions, not autonomous slices.
