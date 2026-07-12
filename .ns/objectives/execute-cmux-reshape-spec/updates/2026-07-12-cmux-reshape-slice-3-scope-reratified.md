# Cmux Reshape Slice 3 Scope Re-ratified

## Summary

The user re-ratified Slice 3 to migrate all five caller locations discovered by
the stopped pre-edit inventory. The attached `cmux-reshape-execution-stack`
plan now explicitly includes:

- `ts/packages/capabilities/cmux/src/core/sidebar.ts`
- `ts/packages/capabilities/cmux/test/ccc-test-harness.ts`
- `ts/packages/hosts/pi/test/runtime/helpers.test.ts`
- `docs/cmux/help-querying.md`
- `docs/sdl-exec/cmux-workspace-summary.md`

Each location is in scope for migration from `ccc exec
cmux-workspace-summary` to `ns cmux exec workspace-summary` as part of deleting
the old standalone bin.

## Objective Impact

The Slice 3 inventory-drift blocker is resolved. The Objective's Blocked
Sentence is cleared, while the prior inventory-drift update remains immutable
history. Slice 3 may resume under the expanded caller inventory; all other
slice boundaries and STOP conditions remain unchanged.

## Follow-Ups

Resume Slice 3 implementation, retaining the no-registration-edit constraint
and stopping if `ns cmux exec workspace-summary` does not resolve through
kernel source-dev discovery.
