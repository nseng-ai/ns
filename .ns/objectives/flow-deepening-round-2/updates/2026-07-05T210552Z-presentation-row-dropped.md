# Parked presentation row dropped after fresh inventory

## Summary

The final parked row, “Unify the land presentation surface” (review #5), was re-inventoried against current trunk and explicitly dropped rather than promoted or re-scoped.

Evidence from the current `@ns/flow` land surface:

- `ts/packages/capabilities/flow/src/land/stack/presentation.ts` owns domain-authored presentation text and notification bridging: landing plans, descendant maintenance text, success summaries, warning formatting, failure formatting, failure/success notifications, print-aware notification helpers, and status updates.
- `ts/packages/capabilities/flow/src/land/stack/land-presentation.ts` is a CLI styling facade over shared finite result-block rendering and structured confirmation-detail rendering. It deliberately preserves domain-authored text from `presentation.ts` instead of re-deciding land behavior.
- `ts/packages/capabilities/flow/src/land/stack/command-stream.ts` owns command execution stream presentation: Pi rich-message construction and rendering, command finish formatting, PR linkification, elapsed-time telemetry emission, live-progress emission, and command-display redaction.
- `ts/packages/capabilities/flow/src/ns/commands/land.ts` owns the CLI phase/progress adapter around `createPhaseStreamController`, including phase routing from land messages and structured live-progress title updates.
- `ts/packages/capabilities/flow/src/land/land.ts` wires CLI-only result-block and confirmation renderers while keeping the Pi command-stream path plain / ANSI-free.

The files are larger than the 2026-07-03 premise (`presentation.ts` 518 lines, `land-presentation.ts` 137, `command-stream.ts` 314), but the growth reflects deliberate edge and mechanism splits rather than duplicated decision logic. Existing comments and context preserve important constraints: CLI result blocks may be styled at the CLI edge, while Pi command-stream output must remain ANSI-free; domain-authored land facts stay in Flow/Land-owned code; command-stream telemetry and rich messages are a separate channel from final outcome text.

## Objective Impact

The Objective’s last closure gate is satisfied by decision: the parked presentation row is complete by explicit drop with rationale. No source-code implementation slice was promoted. Future land UX or presentation work should start from a concrete product requirement or a new Objective, not from this stale review candidate.

`roadmap.md` marks the parked row `[x]` as dropped, `objective.md` records the resolved risk/open question and closure rationale, and `closed.md` marks the Objective complete.

## Follow-Ups

- None for this Objective. If future users want land presentation changes, create a new scoped Objective or issue from the current CLI/Pi/product requirement.
