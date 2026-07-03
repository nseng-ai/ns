# Candidates 6 and 11 Implemented

## Summary

The accepted in-family candidates 6 and 11 are now implemented as concise Saved plan authoring guidance. The repo-level `plans-write` prompt asks plans to sequence a first implementation slice that establishes or documents a credible one-command validation baseline before risky implementation work when the target repo lacks one, while preserving the decision that planners are not required to run every validation command before saving. The same prompt also asks for a compact trust-nothing closeout check: rerun declared done criteria/gates, compare changed files against scope, inspect documented deviations, and read changed tests/assertions rather than trusting green output alone.

The `enriched-plan-save` skill carries the same policy in its compact workflow step without changing command syntax, saved-plan slug behavior, recovery, storage boundaries, Branch Memory behavior, runtime attachment behavior, or the rollback boundary around the prototype. Prompt-surface tests in Python and TypeScript now assert stable policy phrases for the new guidance.

## Objective Impact

This completes the remaining accepted in-family implementation row for candidates 6 and 11. Candidate 6 lands as authoring-primary closeout/review guidance rather than a broad executor-prompt rewrite, because existing branch-context implementation guidance already covers runtime scope, gate, and deviation behavior. Candidate 11 lands as conditional sequencing guidance for weak validation baselines, not as a plan-write-time prevalidation gate.

The Objective remains open because its completion criteria require human agreement that the outcome has been reached. The parked CLI drift checker, generalized protocol expansion, and severity/drift-kind work remain explicitly parked.

Evidence: local branch `trust-nothing-verification-baseline-plans` diff against Graphite parent `triage-planned-branch-candidates-6-11` includes `.asdl/prompts/plans-write.md`, `skills/enriched-plan-save/SKILL.md`, `packages/asdl-core/tests/unit/prompts/test_resolver.py`, and `ts/packages/pi-extensions/test/branch-context-extension-helpers.test.ts`. Validation passed: `git diff --check`, `dprint check`, `uv run pytest packages/asdl-core/tests/unit/prompts/test_resolver.py`, `pnpm --dir ts --filter @asdl/pi-extensions run test`, `pnpm --dir ts run check`, and `pnpm --dir ts run test`. A review-only TypeScript-style subagent reported no actionable findings and confirmed the TypeScript assertions check semantic policy phrases rather than incidental long prose.

## Follow-Ups

Ask for explicit human agreement before closing this Objective. Continue preserving the prototype rollback boundary until the trial is accepted, and defer CLI drift-check push-down until there is evidence that manual excerpt comparison is useful or being skipped.
