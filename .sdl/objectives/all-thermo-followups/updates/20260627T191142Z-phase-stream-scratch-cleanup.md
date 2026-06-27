# Phase Stream and Scratch Cleanup

## Summary

Slice 2 split the flow phase-stream implementation into focused modules for lifecycle, rendering, phase state, transcript tail buffering, and phase specs while keeping the existing public `phase-stream.ts` re-export surface stable. Checkpoint phase definitions are now shared between `flow cp` and submit's folded checkpoint progress. The disposable `ts/scratch/cli-northstar` harness was deleted from live source.

## Objective Impact

This completes the second roadmap slice. The stream cleanup follows the functional Slice 1 fixes, preserving host-resolved caps, minimal append-only non-TTY output, and `runPhaseStream(...)` cleanup while making the remaining implementation easier to review and maintain. No separate design note was needed for the removed scratch harness because the relevant behavior is represented in the shipped clinkr/flow seams and tests.

Validation evidence: parent verification passed `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/unit/phase-stream.test.ts packages/capabilities/flow/test/scenario/cp-command.test.ts packages/capabilities/flow/test/scenario/submit-command.test.ts` and `just ts-check`.

## Follow-Ups

- Continue with Slice 3: harden command tests so command scenarios assert progress/event semantics while exact glyph, spacing, color, and frame expectations live in clinkr/theme-level tests.
- Decide during Slice 3 whether the parked progress-destination and import-boundary notes remain parked or should move into scope.
