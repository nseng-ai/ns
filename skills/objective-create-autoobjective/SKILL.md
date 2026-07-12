---
name: objective-create-autoobjective
disable-model-invocation: true
description: Create an autoobjective ns Objective — roadmap and runner policy deliberately shaped for repeated autonomous Objective Runner steps with parent checkpoints.
---

# objective-create-autoobjective

Create one ns Objective whose roadmap and runner policy are intentionally shaped for repeated Objective Runner steps with parent checkpoints between committed slices. Autoobjective is colloquial shorthand, never a schema; recognition lives in the `objective` skill's patterns catalog (`references/objective-patterns.md`). This facade owns the autoobjective creation procedure and composes:

- Load `objective` (umbrella) and `objective-create` (step) first; they own all record mechanics.
- `objective-create`'s `references/execution-friendly-create.md` owns the execution-policy interview: timing, the minimum policy to gather, section placement, and row-level `Policy:`/`Evidence:` examples. Read it before asking policy questions; do not restate it.
- The `objective` skill's `references/execution-policy.md` owns the policy sections' template and interpretation rules, including the autonomy-designed minimum (durable goal, Definition of Progress, load-bearing assumptions and risks, runner boundaries and escalation guidance). Read it before drafting `## Definition of Progress` and `## Runner Policy`.

## Procedure

1. **Confirm autonomous drive is really wanted.** Autoobjective is the Drive-axis value (axes: the patterns catalog). If the user wants only execution-after-preview, that is ordinary execution-friendliness — weaker than autonomous pursuit — and needs no autoobjective shaping.
2. **Run the execution-policy interview.** Follow `references/execution-friendly-create.md`; the record must meet the execution-policy reference's autonomy-designed minimum. Never invent permission boundaries — stop and ask when durable policy context is thin.
3. **Shape runner-sized roadmap rows.** Each row is one committable slice the Runner can execute autonomously in a single step: concrete enough to act on without a fresh human decision, with completion evidence statable up front. Decision-bearing work stays out of autonomous rows — word it so the Runner escalates. Add row-level `Policy:`/`Evidence:` prose only where slice-local guidance differs from the Objective-level defaults.
4. **Verify and stop.** Run objective-create's Verify plus the execution-friendly reference's verification list; additionally confirm each roadmap row is runner-sized per step 3 and the autonomy-designed minimum is met.

## Layering

Composition facts live in the patterns catalog. Procedure-affecting here: layers with **wayfinding** only after Crystallization — Question Rows are decisions, not autonomous slices.
