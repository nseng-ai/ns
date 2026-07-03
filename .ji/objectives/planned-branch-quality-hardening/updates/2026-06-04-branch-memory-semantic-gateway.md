# Branch Memory Semantic Gateway Implemented

## Summary

The Branch Memory semantic gateway slice is implemented for `@asdl/planned-branch`. Planned-branch create and load-plan workflows now use a planned-branch-owned `PlannedBranchBrmemGateway` for attachment presence checks, plan attachment, attached-plan listing, and attached-plan retrieval.

## Objective Impact

This advances the roadmap row, "Semantic gateway boundary for planned-branch core," while intentionally leaving Graphite tracking as the remaining gateway follow-up. The implementation preserves the planned-branch namespace/key contract and user-visible create/load behavior while moving Branch Memory protocol ownership behind a focused adapter boundary:

- `RealPlannedBranchBrmemGateway` owns the exact `brmem check`, `put`, `list`, and `get` subprocess protocols, timeout, candidate selection, unavailable-command formatting, exit-code semantics, machine-envelope parsing, and operation-specific body validation;
- `createPlannedBranchFromFile` no longer constructs raw `brmem check` or `brmem put` arguments and maps typed gateway failures back to the existing partial-failure messages;
- `loadAttachedPlan` no longer constructs raw `brmem list` or `brmem get` arguments and keeps plan selection, key normalization, prompt rendering, and no-entry recovery text at the planned-branch domain layer;
- Branch Memory parser ownership moved into the gateway module while compatibility exports preserve existing package consumers;
- planned-branch CLI scenario tests now use an in-memory semantic Branch Memory fake instead of scripting raw subprocess calls;
- real gateway tests preserve exact Branch Memory command protocol expectations, check exit-code conventions, timeout behavior, unavailable-command handling, and malformed/mismatched envelope handling.

Evidence considered: local branch diff against Graphite parent `wipe-brmem-plans-namespace`, commit `b08384cf` (`[cp] Extract brmem gateway`), and PR #892. The diff is limited to `ts/packages/planned-branch` source/tests plus this Objective update, with no Objective slug-directory moves.

Verification: `cd ts/packages/planned-branch && bun test`, `cd ts/packages/planned-branch && bun run check`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue the semantic gateway row with the remaining Graphite tracking gateway slice. The Objective remains open because Graphite tracking and the public skills/docs accuracy pass remain active work.
