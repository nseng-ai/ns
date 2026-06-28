# Slot gc destructive result-block migration

## Summary

`sdl slot gc` now renders human dry-run output, interactive pre-confirmation previews, cancellation/refusal, final success/no-op, and cleanup-error outcomes through the Slot-local destructive result-block grammar.

## Objective Impact

This is the second Slot destructive consumer after `sdl slot free`. The Slot-local `renderSlotDestructiveResultBlock` helper still fits cleanly: `gc` only needed command-local mapping helpers for its candidate/kept/skipped/error entry details and reused the existing cleanup-line renderer. No shared `@sdl/cli-theme` destructive abstraction was promoted.

Machine JSON shape, exit codes, mutation behavior, confirmation defaults, and prompt wording were preserved. Cleanup-error human output now uses the destructive failure block via the `negative(..., { human })` override while JSON negative output remains structured.

## Follow-Ups

- Continue the destructive row with adjacent Slot surfaces: `slot gt free-stack` and `slot resize`.
- Keep Handoff delete/gc migration queued after more Slot evidence.
- Defer shared extraction until additional destructive consumers prove a stable shape beyond the Slot-local helper.
