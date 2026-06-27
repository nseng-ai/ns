# Hosted Caps and Stream Cleanup

## Summary

Slice 1 landed the capability/lifecycle contract. `@sdl/clinkr` now exposes a settled non-interactive capability policy for hosted or callback sinks, command IO can carry full resolved `Caps`, objective list rendering uses host/IO caps instead of process-global terminal facts, and SDL flow commands thread host-resolved caps into streaming. `flow submit` and `flow cp` now run phase streaming through `runPhaseStream(...)`, which restores the cursor and stops the stream in a `finally` path when core work throws.

## Objective Impact

This completes the first roadmap slice: callback/override sinks default to non-interactive, no ANSI/cursor control should leak into hosted output, direct terminal execution still falls back to `resolveProcessCaps()`, and non-TTY behavior remains minimal append-only output without adding a title/header line. The functional blockers are resolved before the planned `phase-stream.ts` structural cleanup.

Validation evidence: parent verification passed `pnpm --dir ts exec vitest run --config vitest.config.ts packages/infra/clinkr/test packages/capabilities/flow/test/unit/phase-stream.test.ts packages/objective/test/unit/list-objectives.test.ts packages/objective/test/scenario/list-objectives-cli.test.ts packages/capabilities/flow/test/scenario/cp-command.test.ts` and `just ts-check`.

## Follow-Ups

- Continue with Slice 2: remove or archive `ts/scratch/cli-northstar`, split `phase-stream.ts` responsibilities, and consolidate checkpoint phase specs where practical.
- Preserve the new host/IO caps seam and `runPhaseStream(...)` lifecycle ownership while refactoring.
