# objective-stack-impl retired into objective-autorun; Pi wrapper unparked

## Summary

The pre-runner `objective-stack-impl` skill (hand-rolled dispatch, validation, and commits, predating ADR 0022/0024) was retired on 2026-07-05, per a user decision during the objective system docs/skills audit. `objective-autorun` absorbed its two surviving values — the multi-slice launch preview/confirm step and the end-of-run digest with `runner-subagent-usage` telemetry (now `skills/objective-autorun/references/run-digest.md`) — and took over the command-backed picker slot: the `stack-impl` entry in `objective-command-specs.ts` became an `autorun` spec surfacing `/ns:objective:autorun`, and `areg` applied command-backed to `objective-autorun`.

## Objective Impact

- The formerly parked "Pi command wrapper over the runner" row is now landed work: cross-harness parity's precondition (CLI + skill land first) was already satisfied by `runner-begin`/`runner-finish` and the autorun/runner-step skills, so the Pi wrapper is additive presentation as designed.
- Stacking as a first-class use is now explicit in autorun's contract: each committed runner step stacks on the last, making autorun the path for implementing one Objective as a small Graphite stack.
- No runner core, CLI, or gate behavior changed; this was a skill/surface consolidation.

## Follow-Ups

- The legacy-machinery deletion row (final slice, ADR 0024) is untouched and still open.
- Dogfooding the preview + digest additions to autorun on a real run would be natural evidence for the still-open dogfooding row.
