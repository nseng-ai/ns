# Semantic Update: Handoff destructive result blocks

## What changed

- `sdl handoff delete` human success and cancellation output now renders through a Handoff-local destructive result-block helper over `@sdl/cli-theme`.
- `sdl handoff gc` human dry-run, no-op, forced success, cancellation, and per-entry error summaries now render through the same Handoff-local destructive result-block helper.
- `@sdl/handoff` now declares an explicit `@sdl/cli-theme` dependency for this human rendering layer.

## Contracts preserved

- JSON schemas and machine output fields for delete and gc are unchanged.
- Delete still requires `--yes` in non-interactive mode and preserves prompt/cancellation/delete behavior.
- GC still preserves `--dry-run`, `--force`, non-interactive missing-force usage errors, prompt/cancellation behavior, and mutation timing.
- GC per-entry deletion errors remain represented in the ok result data; only the human summary uses the failure-styled result block when `errorCount > 0`.

## Extraction decision

Shared destructive rendering extraction remains deferred. With Slot and Handoff migrated, the duplicated layer is still only a tiny capability-local wrapper around `renderResultBlock(resolveRenderCapabilities(...))`; keeping helpers local avoids cross-capability churn while evidence accumulates.
