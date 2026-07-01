# Flow Autobranch Completion Summary Remediation

## Summary

Re-probed and fixed the Flow autobranch duplicated-code finding from `references/capabilities.md`:

- `summarizeAutobranchCompletion` now owns the shared post-branch `git status --porcelain=v1` cleanliness probe, unavailable-base-slug suffix rendering, and clean/dirty completion line selection.
- Dirty-worktree and latest-commit autobranch flows now call that helper while preserving their existing summary text and branch/commit/source-reset lines.
- Autoslot now uses the shared `AUTOBRANCH_CLEAN_WORKTREE_LINE` constant instead of duplicating the clean-summary literal for its follow-up slot-move guardrail.

Validation passed after formatting: `pnpm --dir ts --filter sdl-flow run check`, `pnpm --dir ts --filter sdl-flow run test`, `just ts-format-check`, `just ts-lint`, and `just ts-check` on 2026-07-01. An initial `just ts-format-check` failure in `dirty-worktree.ts` was corrected with `just ts-format-fix` before rerunning.

## Objective Impact

This reduces the open `capabilities` cluster by fixing the Flow autobranch completion-summary duplication without changing observable CLI/API behavior. The broader capabilities row remains partially open for the larger Flow land/submit, land package, and Slot command/shell findings.

## Follow-Ups

Continue the `capabilities` cluster as separate coherent slices; do not fold Flow land-stack failure presentation or submit gateway formatting into this autobranch completion-summary remediation.
