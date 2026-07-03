# Slot Graphite Stack Metadata Remediation

## Summary

Re-probed and fixed three Slot Graphite findings from `references/capabilities.md`:

- `stack-walk.ts` no longer duplicates the ancestor/current/descendant stack path shape between branch and edge collection; `selectStackPath` owns that selection.
- Stack fork warning text is now rendered by one `renderStackFork` helper in `exec/metadata-warnings.ts` and reused by stack integrity and stack-map branches.
- `resolveRepoAndCurrentBranch` now returns flattened `repoRoot` and `mainRepoRoot` fields so Slot Graphite exec/navigation callers no longer drill through `resolved.repoCtx.repo.*` for common repository roots.

Validation passed after formatting: `pnpm --dir ts --filter @sdl/slot run check`, `pnpm --dir ts --filter @sdl/slot run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` on 2026-07-01. An initial `just ts-format-check` failure in `shared.ts` was corrected with `just ts-format-fix` before rerunning.

## Objective Impact

This reduces the open `capabilities` cluster by disposing the Slot Graphite stack metadata sub-slice as fixed while preserving existing Slot CLI/Graphite behavior. The broader capabilities row remains partially open for Flow, land, and larger Slot command/shell findings.

## Follow-Ups

Continue the `capabilities` cluster with a separate coherent slice. Do not fold the larger Slot command-table extraction or Flow land-stack cleanup into this small Slot Graphite helper remediation.
