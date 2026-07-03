# Slot free-stack and resize destructive result-block migration

## Summary

`sdl slot gt free-stack` now renders human no-op and freed-stack outcomes through the Slot-local destructive result-block grammar. `sdl slot resize` now renders current successful/no-op grow/shrink outcomes through the same helper, conservatively preserving existing mutation behavior.

## Objective Impact

These are the third and fourth Slot destructive consumers after `sdl slot free` and `sdl slot gc`. The Slot-local `renderSlotDestructiveResultBlock` helper still fits cleanly for both commands with only command-local headline/detail mapping helpers; no shared `@sdl/cli-theme` destructive abstraction was promoted.

Machine JSON shapes, exit codes, Graphite/slot mutations, and resize semantics were preserved. This slice intentionally did not add `--dry-run`, `--force`, `--yes`, interactive confirmation, or preview APIs to `slot gt free-stack` or `slot resize`.

## Follow-Ups

- Keep Handoff delete/gc migration queued as the next destructive-rendering candidates.
- Treat richer resize authorization/preview semantics as a separate product decision if the audit row is later interpreted to require more than conservative result rendering.
- Defer shared extraction until non-Slot destructive consumers prove a stable shape beyond the Slot-local helper.
