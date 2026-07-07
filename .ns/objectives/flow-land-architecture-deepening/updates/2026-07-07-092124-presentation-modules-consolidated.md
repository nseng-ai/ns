# Presentation Modules Consolidated

## Summary

Candidate 4 is implemented: the three Flow land presentation surfaces — `stack/presentation.ts` (517 lines), `stack/land-presentation.ts` (137 lines), and `land-matrix-progress.ts` (144 lines) — are folded into one root presentation module at `ts/packages/capabilities/flow/src/land/land-presentation.ts` (820 lines). The module is organized as one presentation surface in four sections: result-block and confirmation rendering, plan/warning/failure/success formatting, presentation/notification helpers that write through command contexts, and the live matrix progress types/controller. All exported symbol names were kept stable, so the fold is a structural refactor with no behavior change.

Production imports were updated at twelve sites (`stack/command-stream.ts`, `stack/landing-plan-execution.ts`, `stack/landing-operations.ts`, `stack/pre-merge-submit.ts`, `stack/landing-coordination.ts`, `stack/graphite-maintenance.ts`, `isolated-fast-path.ts`, `land-stack.ts`, `land.ts`, `landing-dispatch.ts`, `post-landing-slot-cleanup.ts`, and `src/ns/commands/land.ts`, which the plan's import graph had missed) and the three unit test files (`land-presentation.test.ts`, `land-matrix-progress.test.ts`, `land-stack-helpers.test.ts`) now import through the consolidated root seam. The old split modules are deleted.

## Evidence

- Stale-import sweep over `src/land`, `src`, and `test` finds no imports of `stack/presentation.ts`, `stack/land-presentation.ts`, or `land-matrix-progress.ts`; the only remaining mentions are an intentional provenance comment in the new module header.
- `just ts-check` passes.
- `pnpm --dir ts --filter @nseng-ai/flow test` passes (54 files, 485 tests) with zero test-expectation edits, so command output, prompt text, status labels, matrix columns, and progress rendering are preserved.
- `oxlint` and `oxfmt --check` pass.
- The anticipated cycle risk (`stack/command-stream.ts` importing `LandMatrixProgressSink` from the consolidated module while the module imports `commandStreamDetailsForLanded` from `command-stream.ts`) is a type-only import on the command-stream side, which is erased at runtime; no facade was needed.

## Objective Impact

Candidate 4 — the last open roadmap row — is complete. All four candidates are now landed, command shapes and telemetry-facing expectations were preserved throughout (scenario suites unedited), and the perf-rollout handback was already recorded. The Objective's completion criteria appear fully satisfied and it is ready for the objective-close workflow.

## Follow-Ups

Run the objective-close workflow for `flow-land-architecture-deepening` as a separate explicit step. No code follow-ups: the 820-line single module is accepted per the Candidate 4 disposition, and no new abstraction layer or public package export was introduced.
