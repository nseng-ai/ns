# Graphite Semantic Gateway Implemented

## Summary

The Graphite semantic gateway slice is implemented for `@asdl/planned-branch`. Planned-branch create now uses a planned-branch-owned `PlannedBranchGraphiteGateway` for Graphite tracking instead of constructing and executing raw `gt` commands in core create logic.

## Objective Impact

This completes the roadmap row, "Semantic gateway boundary for planned-branch core." The implementation preserves user-visible planned-branch behavior while moving Graphite protocol ownership behind a narrow adapter boundary:

- `RealPlannedBranchGraphiteGateway` owns the exact `gt track <branch> --parent <parent> --no-interactive` subprocess protocol, 30-second timeout, optional `AbortSignal`, startup failures, nonzero failures, and killed/timeout failure formatting;
- planned-branch core still owns local Git branch creation, source-branch resolution, and the partial-failure policy when local branch creation succeeds but Graphite tracking fails;
- `CreatePlannedBranchFromFileOptions` and `PlannedBranchContext` now accept an optional Graphite gateway, and the real context wires the real adapter;
- planned-branch CLI scenario tests use semantic Git, Branch Memory, and Graphite fakes for Graphite create behavior, including the failure path that keeps the local branch and skips Branch Memory attachment;
- real gateway tests preserve the exact `gt` command protocol and structured failure codes for successful, nonzero, killed, and startup-failure outcomes.

Evidence considered: local uncommitted branch diff on `graphite-gateway-planned-branch-create` with Graphite parent `planned-branch-brmem-semantic-gateway`. The diff is limited to `ts/packages/planned-branch` source/tests plus this Objective update, with no Objective slug-directory moves. No PR exists for this branch yet; PR evidence was unavailable and not required.

Verification: `cd ts/packages/planned-branch && bun test`, `cd ts/packages/planned-branch && bun run check`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue with the remaining public skills and docs accuracy pass. The Objective remains open because that row still needs completion.
