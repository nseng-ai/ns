# Objective Integration Contract Check

## Summary

Candidate 11 has been completed as a focused contract/disposition slice.

- Confirmed Python `objective list` result models and scenario tests use `parent_branch` and `slice_commits` for branch entries.
- Confirmed TypeScript `objective-list.ts` maps those fields to `parentBranch` and `sliceCommits`, and `objective-picker.ts` presents `max +N slice commits` in picker labels.
- Confirmed `objective-list.ts` already reuses `parseMachineEnvelopeData(...)` for Clinkr Machine-envelope parsing while keeping Objective-list domain payload validation local.
- Added a focused TypeScript regression test rejecting legacy `ahead_base` branch fixtures.

Verification: targeted Objective extension tests passed; `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

Candidate 11 is complete. The TS/Python Objective-list contract is current, and the old `ahead_base` vocabulary remains intentionally unsupported.

No broad Objective command extraction is accepted in this slice. `objective-list.ts` and `objective-picker.ts` already pass the deletion test; splitting `objective.ts` further would mostly move UI selection, skill prompt handoff, and command-registration choreography into shallow pass-through modules.

This de-risks Objective integration enough for the roadmap to proceed without additional Objective-list architecture work.

## Follow-Ups

- Keep future Objective-list schema changes covered by parser/contract tests before changing Pi extension behavior.
- Keep Machine-envelope parsing limited to framework facts; Objective-list payload fields stay local unless another repeated contract appears.
- Continue remaining candidate triage or `/submit` promotion; Candidate 11 no longer blocks either path.
