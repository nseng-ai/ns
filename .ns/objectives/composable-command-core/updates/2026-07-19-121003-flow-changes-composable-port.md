# Semantic Update: `flow changes` composable port complete

## Summary

`ns flow changes` is the first simple gradient port after the `flow cp` steel thread. The command moved from the legacy flat `commands/changes.ts` module to `commands/changes/command.ts` and now uses `defineFirstPartyCommand(...)` with a directly branded clinkr handler.

The handler takes invocation facts from the clinkr bundle and first-party services from capability-kit. Pending-worktree inspection uses `loadPendingWorktreeSnapshot(...)` with the Git gateway and command runner; model policy uses `resolveFlowModelRefAt(...)`; summary generation uses `draftChangesSummary(...)`. The migrated command has no `NsExtensionApi`, command-IO adapter, `ClinkrIo`, dynamic caps, or author-owned output sink dependency.

The result is now a bounded clean/dirty discriminated union. Dirty results expose plain summary strings, raw/index/worktree status fields, normalized labels, the first 50 files, total file count, and omitted count. `renderHuman` preserves the established clean message and outstanding-changes report. Three SDK phases preserve worktree inspection, model-policy resolution, and summary generation; clean worktrees explicitly settle the latter two as `not required` without calling the model.

## Objective Impact

The `flow changes` roadmap row is complete. Both ns CLI audiences are covered through the real checked-in extension loader: ordinary human rendering remains compatible, JSON emits structured data, and JSON Schema publishes the real output contract. The existing Pi `ns:flow:changes` route continues to delegate through the generic ns CLI path, so no command-specific Pi adapter was added.

Before the port, the command was one 154-line file. After the port, it remains one command file at 262 lines. The increase buys the structured machine contract, pure human renderer, explicit service wiring, and semantic phase model. Shared scenario host mechanics were generalized for both `cp` and `changes` rather than duplicated.

Validation evidence: focused changes/cp/model-generation scenarios, the real-loader and Pi-path tests, the Flow package check and test suite, integration and TypeScript style-guard lanes, bounded stale-path and forbidden-dependency searches, `git diff --check`, and the repository `just` entrypoint pass.

## Follow-Ups

- Port `flow pull-trunk` as the mid-weight gradient point.
- Port `flow submit` as the maximal gradient point, including matrix progress and an honest resolution of ambient filesystem/current-directory reach.
- Keep the aggregate migration verdict and three-port measurement comparison open until those remaining ports land.
