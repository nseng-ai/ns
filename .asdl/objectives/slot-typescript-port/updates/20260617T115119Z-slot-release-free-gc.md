# Semantic Update: slot release free/gc TypeScript port

## Summary

Implemented the TypeScript `slot free` and `slot gc` release slice in `ts/packages/slot`.

- Added `free` and `gc` CLI registrations with the planned Python-compatible option surfaces.
- Added shared release target, cleanup, free, gc, and release wrapper lifecycle modules.
- Added package-local `SlotPrGateway` with a fake-backed test seam and a real `gh` adapter.
- Added local-branch deletion to the slot git gateway and fake operation logs.
- Added scenario/unit coverage for release command safety gates, dry-run non-mutation, cleanup ordering, PR cleanup, local branch cleanup, and GC classification/execution.

## Objective Impact

This completes the `Port release: free and gc` roadmap row for the TypeScript slot port. The commands preserve the durable user contract for selectors, JSON envelopes, exit classifications, worktree detach behavior, cleanup ordering, and fake-backed PR behavior.

Intentional compatibility decision: JSON-mode destructive GC now requires `--force` instead of reading interactive stdin. `free --all --format json` remains gated on `--yes`. Dry-run JSON remains allowed for both commands.

Validation run:

- `pnpm --dir ts/packages/slot run test`
- `pnpm --dir ts/packages/slot run check`
- `pnpm --dir ts run check`
- `pnpm --dir ts run test`
- `just dprint-check`

## Follow-Ups

- Real `gh` adapter behavior is unit-shaped and fake-backed in this slice; avoid real PR close validation except in a deliberate manual/throwaway context.
- Human rendering is intentionally idiomatic TypeScript rather than byte-for-byte Python Rich/Click parity.
