# Shared Objective Command Selection Tests

## Summary

The engineered Objective Pi extension keeps the grouped-changed-Objective picker introduced for `objective-next` in PR #567 — including `selectChangedObjectivesOrOther`, the `compactDiffSuggestion` spec flag, the `View other open Objectives…` escape, and the multi-slug `ObjectiveDiffSelection` type. That UX remains the chosen Objective-selection experience for picking among multiple changed open Objectives.

What is new in this slice is characterization-test coverage that codifies the parts of the Objective-selection rule that are genuinely *shared* across `objective-next`, `objective-current`, and `objective-update`:

- explicit slug or path arguments bypass candidate loading and git diff;
- empty arguments load open candidates with `objective list --format json`;
- zero open Objectives notify and send no prompt;
- picker cancellation sends no prompt; and
- the selected slug is embedded as an explicit selection in the generated skill prompt.

These are expressed as a parametrized `describe("objective command shared selection policy", ...)` block iterating `OBJECTIVE_COMMAND_NAMES` via a new `runObjectiveCommand` harness with `SELECTION_TITLES`, `ACTION_PROMPTS`, `expectListOpenObjectivesCall`, and `expectPromptSelectsObjective` helpers. A small `describe("objective command prompt details", ...)` block additionally pins down the `objective-update`-only post-selection evidence reminder.

The existing `describe("objective picker suggestion", ...)` block — which exercises the grouped picker behavior end-to-end via `runObjectiveNext` — is preserved unchanged. The two helpers coexist intentionally: command-specific grouping assertions go through `runObjectiveNext`; cross-command shared-policy assertions go through `runObjectiveCommand`.

Evidence: working-tree diff touching `ts/packages/pi-extensions/test/objective.test.ts`; `bun run --cwd ts check` and `bun run --cwd ts test` passed (74 tests, 411 expect calls).

## Objective Impact

This resolves candidate 3 for Objective selection deepening by codifying the shared selection rule across all three Objective commands while preserving the grouped picker UX from PR #567 as the chosen experience. The Objective-selection rule is now both visibly characterized and protected against accidental drift across `objective-next`, `objective-current`, and `objective-update`.

The selection logic remained inline in `objective.ts`. A dedicated `objective-selection.ts` extraction was not introduced because this slice did not reveal a clearer pure module boundary than the existing command-local code; Pi command registration, UI calls, skill expansion, and prompt construction remain closely coupled.

The broader Objective remains open for the `land-stack` internal module split, the `/submit` layer decision, and shared skill-invocation mechanics.

## Follow-Ups

- Continue with candidate 4, candidate 5, or candidate 6 as separate slices.
- Revisit an `objective-selection.ts` extraction only if future Objective command work creates a larger pure selection surface with better locality than the inline implementation.
