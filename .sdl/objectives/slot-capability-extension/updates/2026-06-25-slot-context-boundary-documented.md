# Semantic Update — Slot context boundary documented

## Summary

Added `ts/packages/slot/CONTEXT.md` to make the Slot above-SDK boundary durable. The context defines the Slot pool/inventory language, canonical Slot Checkout Target, `sdl slot ...` Command Face, `@sdl/slot/api` Peer API, checkout side-effect policy, SDL-owned parent-shell navigation and shell mount boundary, and `sdl slot gt` command/helper dispositions.

Updated `CONTEXT-MAP.md` to move `@sdl/slot` from planned to present and to adjust relationship and ambiguity wording from stale `slot gt` language to the current `sdl slot gt` command-face boundary.

## Objective Impact

- Completes the final non-parked roadmap row: Slot vocabulary/context and above-SDK boundary documentation.
- Resolves the open question about the durable context document shape for future Slot implementers.
- Supports Objective closure because all completion criteria now have durable implementation, disposition, and documentation evidence.

## Follow-Ups

- Keep timeout/abort behavior as separate follow-up design work if future Slot Peer API callers need cancellation semantics.
- Update `ts/packages/slot/CONTEXT.md` deliberately if future work changes the Slot command face, Peer API, shell/navigation boundary, or `sdl slot gt` disposition.
