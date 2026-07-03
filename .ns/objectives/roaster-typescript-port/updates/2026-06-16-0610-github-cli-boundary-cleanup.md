# GitHub CLI Boundary Cleanup Landed

## Summary

Review feedback on the shared GitHub CLI helper removed the unnecessary dual executor path. `runGitHubCli` now requires `CommandExecApi`, calls `execApi.exec` directly, and no longer dispatches between a `CommandRunner` and an exec API. Roaster's real GitHub gateway passes its injected exec API directly, aligning the helper with sibling real gateway patterns such as the TS Git and branch-context Graphite gateways.

Evidence: local branch diff against Graphite parent `roaster-review-cleanups`; PR #1658 (`Route GitHub CLI execution through execApi`) corroborates the same file set. Verification: `pnpm --dir ts --filter @asdl/core run test`, `pnpm --dir ts --filter @asdl/core run check`, and `pnpm --dir ts --filter @asdl/roaster run check` passed.

## Objective Impact

This does not complete the roaster TypeScript port, but it keeps the in-progress roaster-local GitHub gateway and shared helper extraction closer to the intended TypeScript boundary style. The gateway still depends on the roaster-owned GitHub surface, but the command-execution seam is now simpler and avoids a redundant adapter abstraction that only existed to preserve a non-production runner path.

The broader GitHub gateway risk remains open until the TS roaster CI flow exercises changed-file loading, batched inline review creation, and summary-comment create/update on a real PR.

## Follow-Ups

- Continue the next Objective work at CI verification and Python deletion only after the TS roaster workflow is proven green on a real PR.
- Keep the roaster-local GitHub gateway row in progress until all comment paths are exercised by the TS CI flow.
- Do not reintroduce runner-vs-exec dual support for `runGitHubCli` unless a real production caller needs it.
