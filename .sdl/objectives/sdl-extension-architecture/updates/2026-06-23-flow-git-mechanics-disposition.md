# Flow Git Mechanics Disposition

## Summary

A2+A8 now has a narrow flow-local Git mechanics seam. `.sdl/extensions/flow/src/shared/git.ts` owns plain `git` execution and porcelain clean-status inspection for the project-local flow extension. The helper is mechanics-only: it copies argv, preserves optional timeout behavior, returns command results, and does not construct user-facing command output or encode push policy.

`push.ts` now routes both `git status --porcelain` and `git push` through the helper while keeping its command-local semantics: clean-worktree preflight, dirty-worktree refusal, submit guidance, two-minute push timeout, and command-evidence formatting. `worktree.ts` routes checkpoint `git add`, `git commit`, and `git log` mechanics through the same helper while retaining the package-owned pending-worktree/checkpoint seams.

## Objective Impact

This completes the A2+A8 Git-ops disposition row for the flow shared-code track:

- Flow-level plain Git mechanics have a project-local shared helper under `.sdl/extensions/flow/src/shared/`.
- Submit, regenerate-pr, pending-worktree, and checkpoint package-owned seams remain accepted boundaries for their package-owned workflows.
- `push` remains deliberately command-policy-local rather than becoming a broad Git gateway consumer.
- Graphite/stack ownership remains A6, and CCC delegation boilerplate remains A7.
- No new public `@sdl/sdl/sdk` surface was added.

Validation/evidence collected:

- `rg` stale-call checks confirmed `push.ts` and `worktree.ts` no longer directly call `ctx.exec("git", ...)`.
- Targeted Vitest passed: `cd ts && ./node_modules/.bin/vitest run packages/sdl/test/scenario/push-cli.test.ts packages/sdl/test/unit/extension-shared-flow-foundations.test.ts packages/sdl/test/unit/extension-shared-git.test.ts` (3 files, 13 tests).
- Full TypeScript validation passed through `just ts-test`, `just ts-check`, `just ts-lint`, `just ts-format-check`, and `just ts-guard`.
- `just dprint-check` passed after `just dprint-fix` formatted the Objective roadmap table.

An initial direct `pnpm --dir ts run test ...` attempt was blocked by pnpm ignored-build approval for `@google/genai` and `protobufjs`; the repository `just` wrappers set the expected pnpm flags and completed successfully.

## Follow-Ups

A5 is now the next planned flow shared-code slice: extract the model generate→validate→repair loop into a flow-shared helper. A6 and A7 remain distinct future rows and should not be pulled into the Git mechanics seam retroactively.
