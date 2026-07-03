# objective-autorun wrapper skill shipped as the Claude Code entry point

## Summary

Shipped `skills/objective-autorun/SKILL.md`, an invoke-only parent orchestration skill that drives one Objective through repeated `sdl objective exec runner-step` invocations. The user asked for the Claude Code entry point to be a wrapper skill orchestrating multiple runner-step invocations; this was not a planned slice, so a roadmap Work row was added alongside the existing single-step parent playbook row.

The design decision worth recording: this is **not** the parked "batch/multi-step mode." That parked row names a lower-agency machine loop inside the runner — the pattern ADR 0022 rejected because it sidelines parent-LM judgment. `objective-autorun` is the opposite construction: the loop lives entirely in the parent agent's judgment, with a mandatory read-checkpoint-and-decide gate between every step, stop/ask boundaries consumed from Objective prose (per the autonomous-objective lessons in `eliminate-redundant-optional-undefined`), and hard boundaries against unattended re-invocation, submission, and silent tracking writes. The runner itself remains strictly one-step.

Companion changes: `objective-runner-step` and `objective-autorun` are now both listed in the `objective` umbrella skill family (runner-step had been missing), and `docs/pi/authoring-remediation-autoobjectives.md` Step 6 now points at the runner-step/autorun surface instead of the frozen `/objective:autopilot`.

## Objective Impact

- The parent-side consumer surface is now two-tier: `objective-runner-step` (one step) and `objective-autorun` (the loop), both invoke-only, both deferring to the same Runner Checkpoint contract.
- The parked batch-mode and automatic-supervisor rows are unchanged and remain parked; the wrapper skill does not weaken the evidence gate on either.
- The dogfooding slice gains a natural harness: invoking `objective-autorun` on a real Objective exercises `runner-step` end-to-end including the between-step judgment loop.

## Follow-Ups

- Dogfood `objective-autorun` on a real Objective (candidate: `flow-deepening-round-2`) and record findings here, especially evidence bearing on the parked automatic-supervisor question.
- If dogfooding shows the loop degrading into rubber-stamp continuation, tighten the skill's judgment-gate language rather than adding machine control.
