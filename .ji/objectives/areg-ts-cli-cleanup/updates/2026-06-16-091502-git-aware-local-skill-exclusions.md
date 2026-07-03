# Semantic Update: Git-aware local skill exclusions

Batch 1 finding F is complete. `@asdl/core` now exposes `GitGateway.gitPath`, with `RealGitGateway` resolving repository-local Git paths via `git rev-parse --path-format=absolute --git-path <relativePath>` and `InMemoryGitGateway` supporting deterministic fake paths and call logging.

`RealAregProjectGateway.readLocallyExcludedSkillNames` now asks the injected Git gateway for `info/exclude` instead of reading `<project>/.git/info/exclude` directly. `createRealAregContext` shares one `RealGitGateway` between `ctx.git` and the project gateway. The areg boundary remains best-effort: git-path failure, missing files, and unreadable paths still produce no local exclusions rather than failing `areg check`.

Regression coverage now includes a linked-worktree-shaped project where `.git` is a file and the actual exclude file lives in a separate Git directory path returned by `InMemoryGitGateway.gitPath`; that fixture would not work with the old direct `.git/info/exclude` read.

Validation evidence:

- `pnpm --dir ts run test -- ts/packages/asdl-core/test/git-gateway.test.ts ts/packages/asdl-core/test/git-testing.test.ts`
- `pnpm --dir ts run test -- ts/packages/areg/test/gateways/real-gateways.test.ts`
- `pnpm --dir ts run check`
- `pnpm --dir ts run test`
