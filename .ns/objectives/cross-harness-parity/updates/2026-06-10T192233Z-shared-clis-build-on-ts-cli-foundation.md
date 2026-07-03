# Shared CLIs build on ts-cli-foundation

## Summary

The 2026-06-10 objective consolidation merged `asdl-core-ts` and `ts-clinkr-commander` into a single foundation record, `ts-cli-foundation`, owning `@asdl/clinkr` and `@asdl/core`. This record now assumes that new shared CLIs created by its push-down rows — land-stack, cmux dispatch, autobranch, and command-output summaries — build on that layer when implemented in TypeScript (clinkr command shell, core exec/gateway modules) rather than growing bespoke scaffolds.

## Objective Impact

One assumption added to `objective.md`. No roadmap changes: the push-down rows themselves are unchanged; only the implementation substrate expectation is recorded.

## Follow-Ups

- When a push-down row reaches implementation, consult `.asdl/objectives/ts-cli-foundation/` for the current state of the clinkr/core layer.
