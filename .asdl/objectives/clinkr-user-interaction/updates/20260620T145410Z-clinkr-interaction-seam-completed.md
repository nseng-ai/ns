# Clinkr Interaction Seam Completed

## Summary

The confirmation prototype has been replaced with the Clinkr-owned semantic interaction seam planned for this Objective. `@asdl/clinkr` now exposes `ClinkrInteraction`, confirmation request/result types, and `createClinkrInteraction`; the real adapter owns prompt formatting, yes/no parsing, defaults, invalid-answer reprompting, stderr prompt/error output, and EOF abort results over an injected one-line stdin reader. `@asdl/clinkr/testing` now exposes `createFakeClinkrInteraction`, which queues semantic confirmation results, records confirmation requests, throws on unexpected prompts, and detects unused queued answers.

`slot gc`, `slot free`, `handoff gc`, `handoff delete`, and `packagechk claim-*` now route confirmation through package context interaction objects instead of importing `confirmFromStdin` or passing raw confirmation stdin/stderr into operations. Package `runCli` functions construct or overlay the real interaction from resolved Clinkr IO and `readStdinLine`, preserving prompt capture on stderr while leaving full-stream `readStdin()` separate for payload use cases. The public root export of `confirmFromStdin` has been removed.

Verification evidence: targeted Clinkr/slot/handoff/packagechk tests passed; full TypeScript tests passed; `just ts-check`, `just ts-lint`, and `just ts-guard` passed; stale greps found no migrated operation/context confirmation stdin wiring. Changed-file formatting passed. The full `just ts-format-check` gate is blocked by an unrelated pre-existing format issue in `ts/packages/pr-address/src/download-feedback.ts`, which was not changed for this Objective.

## Objective Impact

All active roadmap rows are complete: the API name/boundary is settled, the real and fake seams exist, the known TypeScript confirmation users are migrated, and the Clinkr-facing API comment documents the boundary between `ClinkrInteraction`, `ClinkrIo`, and stdin payload readers. The Closure Gate is clear, so the Objective is closed with completion evidence in `objective.md`.

## Follow-Ups

- Keep richer prompts, select menus, and wizard/TUI surfaces parked until a concrete command needs them.
- Treat any future interactive confirmation in TypeScript CLIs as a `ClinkrInteraction.confirm(...)` use case, not a raw stdin or full-stream payload read.
- Resolve the unrelated `ts/packages/pr-address/src/download-feedback.ts` formatting drift separately if a full TS format gate is required before landing.
