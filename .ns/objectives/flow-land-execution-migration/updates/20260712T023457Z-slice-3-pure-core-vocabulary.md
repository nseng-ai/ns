# Slice 3 pure core vocabulary extracted

## Summary

Completed Slice 3 by extracting pure Graphite operation and worktree-path vocabulary into core land modules without changing command shapes or user-visible text.

`graphite-operations.ts` now owns `LandGraphiteOperation`, its conflict-handling and checkout-conflict types, operation constructors, argument construction and display formatting, submit/restack formatting helpers, ANSI stripping, checked-out-elsewhere parsing, backup ref namespaces, and `LAND_BACKUP_RECOVERY_HINT`. The real Graphite channel and streamed command execution remain in `stack/graphite-command-channel.ts`.

`worktree-paths.ts` now owns managed-slot recognition, slot-name extraction, deduplicated `slot free` arguments, and conflict formatters. The Pi-based worktree loader/detector and filesystem-backed realpath normalization remain in `stack/worktrees.ts`. The duplicate preflight formatter was removed, and the `LandContext`-based `detectWorktreeConflicts` plus its options type are now exported from preflight and the land API.

## Objective Impact

The Slice 3 roadmap row is complete. Pure Graphite operation and worktree-path vocabulary now sits in core modules guarded by the migrated-module import-direction test, while real Graphite execution, Pi worktree discovery, and filesystem normalization remain adapter-owned. No command shape/order, prompt, safety, telemetry, or presentation behavior changed.

## Compatibility

Explicit transitional re-exports preserve the old module surfaces:

- `stack/graphite-command-channel.ts` re-exports the moved Graphite operation vocabulary.
- `stack/worktrees.ts` re-exports the moved path and conflict helpers.
- `stack/backup-refs.ts` re-exports `LAND_BACKUP_RECOVERY_HINT`.
- `stack/constants.ts` re-exports the backup ref namespace constants.
- `preflight.ts` re-exports `formatManualWorktreeConflict`.

Root and stack consumers now import pure symbols from their core owners. No adapter/runtime-dependent helper was forced core-side: `normalizeExistingPath`, worktree loading, the separate Pi conflict detector, Graphite execution, stream normalization, and metadata command construction remain in stack.

## Test Evidence

- Focused Vitest passed: 6 files / 55 tests, covering pure operation formatting/argument order, ANSI stripping and checkout parsing, backup recovery text, managed-slot/path behavior, slot-free argument order/deduplication, conflict formatting, real adapter/channel compatibility, maintenance behavior, and import direction.
- `just ts-check` passed with tsgo.
- `just ts-format-check` and `just ts-lint` passed.
- `pnpm --dir ts --filter @nseng-ai/flow test` passed: 72 files / 618 tests.
- `git diff --check` passed.
- No fake knob was added, so no new paired adapter protocol case was required.

## Scenario Invariant

`git diff --name-only --` across all six permanent scenario/fixture paths produced no output. The invariant diff is empty: no transcript scenario, script fixture, backup-ref fixture, shared land test helper, git-state filesystem support, or topology-guard file changed.

## Follow-Ups

Proceed to Slice 4. Keep the transitional re-exports until the Slice 8 call-site and shim sweep, and keep the separate Pi-based worktree detector until its consumers migrate.
