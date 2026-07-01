# Handoff Destructive and GC Remediation

## Summary

Remediated the `handoff` code-smell cluster's four confirmed findings without changing handoff CLI/SDL command behavior:

- Removed the package-local destructive-presentation middle-man and now call `renderDestructiveResultBlock` from `@sdl/cli-theme` directly in delete and gc rendering.
- Added one GC action metadata table that keeps each domain action's wire value, render label, candidate-display flag, and count bucket together, deriving counts, the Zod schema, result conversion, candidate filtering, and label formatting from that table.
- Added `confirmDestructiveAction` in `operations/shared.ts` so delete and gc share the same destructive confirmation gate/prompt/abort result shape while preserving `--yes`, `--force`, and `--dry-run` behavior.
- Replaced hand-rolled optional override spreads in `sdl/context.ts` with `optionalEntry`.

Validation passed: `pnpm --dir ts --filter @sdl/handoff run check`, `pnpm --dir ts --filter @sdl/handoff run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

The four `references/handoff.md` findings now have fixed dispositions in `roadmap.md`:

- Middle Man in `operations/destructive-presentation.ts`: fixed by deleting the wrapper and direct-importing the shared cli-theme renderer.
- Repeated Switches in `gc-core.ts` and `operations/gc.ts`: fixed by consolidating action count/presentation metadata.
- Duplicated destructive confirmation in delete/gc operations: fixed by the shared confirmation helper.
- Duplicated optional-entry spreading in `sdl/context.ts`: fixed by reusing `optionalEntry`.

This reduces the open, no-disposition finding count by 4.

## Follow-Ups

No handoff-specific follow-up is known. Future destructive handoff operations should use `confirmDestructiveAction` for prompt flow and the shared cli-theme destructive result renderer for output blocks.
