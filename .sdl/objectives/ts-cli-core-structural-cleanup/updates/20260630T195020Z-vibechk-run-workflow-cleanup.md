# Vibechk Run Workflow Cleanup

## Summary

Re-probed and completed the neutral/tool-local `@sdl/vibechk` cleanup row for the current code shape:

- Kept `normalizeRunsFormatArgs` because the `runs --format` alias is documented in code as compatibility behavior and is covered by existing read-only operation tests.
- Replaced the inline duplicate `diff.patch` writes in `workflow.ts` with named `writeDiffArtifact` and `writeBestEffortDiffArtifact` helpers, preserving both normal artifact capture and best-effort post-run-error capture.
- Removed the unnecessary `parsed.git.remotes as Record<string, string>` cast in `models.ts`; Zod already provides the honest parsed record type.
- Left persisted bundle provenance/type fields intact as compatibility surface.

## Objective Impact

Marked the `@sdl/vibechk` row complete. The remaining items from the old review are either addressed or intentionally preserved compatibility behavior rather than live cleanup debt.

## Follow-Ups

None for this row. Any future run-bundle schema changes should be framed as a compatibility/persistence decision, not incidental cleanup.

## Validation

- `pnpm --dir ts --filter @sdl/vibechk test` — passed.
- `just ts-format-check` — passed.
- `just ts-lint` — passed.
- `just ts-check` — passed.
