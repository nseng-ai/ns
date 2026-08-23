# Semantic Update: Flow string rendering reconciled at the command boundary

## Summary

The native Flow migration exposed a caller mismatch in Clinkr's intentional rendering fallback: presentation-ready string results without a command renderer were serialized as JSON string literals in human output, escaping newlines and ANSI bytes. The Flow command audit classified eleven public string-result commands as presentation-ready and added command-level human renderers to their definitions. Markdown intentionally inherits the same renderer, while JSON continues to carry the original string as typed envelope data.

The hidden `flow exec read-graphite-branch-metadata` command remains unrendered because its string is serialized JSON payload data rather than presentation-ready prose. Clinkr's generic fallback and tests were not changed, and no renderer helper was introduced.

## Objective Impact

This materially advances the caller-migration portion of the open reconciliation roadmap row. A bounded command contract test inventories the eleven public Flow definitions and verifies byte-for-byte newline and ANSI preservation. Real checked-in-extension coverage proves the SDK/Clinkr host emits human and Markdown strings verbatim, strips ANSI only when sink capabilities require it, preserves ANSI-capable terminal bytes, and leaves JSON envelope data unchanged.

The repair also migrated Flow's stale lower scenario harness from the removed `command.run` API to schema parsing plus command handlers, and aligned its lower CLI-runner outcome data with the declared string schemas. Full Flow package tests and package typecheck pass; the SDK real-host integration test passes. Workspace typecheck remains blocked by unrelated in-progress clean-cut typing errors outside Flow, and workspace format check remains blocked by pre-existing formatting in `ts/packages/public/sdk/test/unit/extension-loader.test.ts`.

## Follow-Ups

- Continue the remaining SDK/caller clean cut under the existing reconciliation roadmap row.
- Do not mark the full reconciliation row complete until the remaining caller migration, deletion, and verification work is independently complete.
