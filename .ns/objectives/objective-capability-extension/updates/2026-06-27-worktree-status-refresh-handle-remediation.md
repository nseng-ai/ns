# Removed Worktree Status Refresh Handle During Thermonuclear Remediation

## Summary

The current branch `remove-worktree-status-refresh-handle` (PR #2213, open) removes the exported `WorktreeStatusExtensionHandle` from `@sdl/worktree-status` and changes `worktreeStatusExtension(...)` to return `void` instead of a programmatic `requestRefresh()` handle.

Refresh behavior remains reachable through real extension-facing paths: session lifecycle/message completion and the registered manual refresh command. The refresh lifecycle tests now exercise those paths instead of calling the removed handle.

Evidence considered:

- Graphite parent: `objective-stack-list-launch-remediation`.
- Branch diff: `ts/packages/worktree-status/src/extension.ts` and `ts/packages/worktree-status/test/refresh.test.ts` only.
- PR evidence: PR #2213, `Remove worktree status refresh handle and use command-based refresh`, open against `objective-stack-list-launch-remediation`.
- Stale seam grep: `rg "WorktreeStatusExtensionHandle|requestRefresh" ts/packages/worktree-status` produced no matches.
- Validation: `pnpm --dir ts --filter @sdl/worktree-status test` passed; `pnpm --dir ts --filter @sdl/worktree-status run check` passed.

## Objective Impact

The thermonuclear review/remediation pass is now active rather than parked. This branch addresses a boundary hazard left by the extracted worktree-status capability: a direct imperative refresh handle would make downstream tests or callers depend on an extension return value instead of the command/lifecycle surfaces that users actually exercise.

The core Objective remains open. The Pi→CCC manifest cycle break and `just ts-guard` acyclicity criterion are already recorded as complete; this update records one concrete thermonuclear remediation before final context documentation and closure.

## Follow-Ups

- Finish the thermonuclear review/remediation pass and record any accepted follow-ups or remaining hazards before closure.
- After the review pass is complete, write the final `ts/packages/objective/CONTEXT.md` and `CONTEXT-MAP.md` documentation for the finalized Objective capability boundary and acyclicity invariant.
