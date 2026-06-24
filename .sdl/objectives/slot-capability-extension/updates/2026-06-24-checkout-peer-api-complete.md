# Checkout Peer API Complete

## Summary

Completed the bounded checkout Peer API slice. `@sdl/slot/api` exposes typed checkout operations for current-branch and named-branch Slot checkout, and CCC checkout flows consume that Peer API through a small adapter/injection seam rather than invoking `slot checkout --format json` for machine decisions.

## Objective Impact

- `@sdl/slot/api` remains exported from `@sdl/slot` and provides `checkoutCurrentSlot` / `checkoutBranchSlot` with typed success and failure results.
- CCC checkout entrypoints route through `ts/packages/ccc/src/slot-checkout.ts` and the shared cmux Slot helpers, with command tests injecting the Peer API seam instead of scripting `slot` subprocess JSON output.
- `ts/packages/slot/README.md` now documents `@sdl/slot/api` as the first-party in-process checkout Peer API for sibling packages, while preserving the standalone `slot` command as the default public command surface.
- Validation evidence: `pnpm --dir ts --filter @sdl/slot test`, `pnpm --dir ts --filter @sdl/slot check`, `pnpm --dir ts --filter @sdl/ccc test`, and `pnpm --dir ts --filter @sdl/ccc check` passed. Stale-reference search found no CCC production checkout subprocess JSON path; remaining `parseMachineEnvelopeData` hits are unrelated objective-sidebar/worktree-status parsing and remaining `slot checkout` text is human-facing README wording.

## Follow-Ups

- Define the future Slot command-face strategy separately.
- Decide and migrate any `slot gt` Peer API needs separately.
- Continue auditing non-checkout Slot subprocess/deep dependencies in later Objective rows.
- Add fuller Slot vocabulary/context documentation in the planned documentation slice.
