# Cmux Reshape Slice 3 Inventory Drift

## Summary

Slice 3 stopped before editing because the required deleted-bin
re-enumeration found live callers of `ccc exec cmux-workspace-summary` outside
the ratified plan's caller set. Verified additional consumers are present in:

- `ts/packages/capabilities/cmux/src/core/sidebar.ts`
- `ts/packages/capabilities/cmux/test/ccc-test-harness.ts`
- `ts/packages/hosts/pi/test/runtime/helpers.test.ts`
- `docs/cmux/help-querying.md`
- `docs/sdl-exec/cmux-workspace-summary.md`

These source, fixture, host-test, and command-documentation callers would be
left stale by deleting the standalone bin under the current scope.

## Objective Impact

The plan's volatile-inventory assumption materialized as a STOP condition
rather than an in-scope moved-line or fixture-only delta. Slice 3 remains open
and the Objective is blocked pending human re-ratification of its caller scope.
No implementation changes were kept, and source-dev extension discovery was
not attempted.

## Follow-Ups

Decide whether Slice 3 should expand to migrate the five newly identified
caller locations to `ns cmux exec workspace-summary`. If approved, update the
ratified execution scope before re-running Slice 3; otherwise provide a
different disposition for each caller before the old bin is removed.
