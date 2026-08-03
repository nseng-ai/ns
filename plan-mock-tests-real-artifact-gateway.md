# Handoff: Plan mock-based tests for the real artifact gateway

Continuation focus: Plan focused mock-based tests for `RealArtifactGateway`, especially git command construction, batched blob parsing, errors, and edge cases that real-repository integration tests do not isolate.

## Context

Branch `gitplane-real-artifact-gateway` owns PR #4070, which replaces `NodeArtifactGateway` with a cwd-confined, git-backed `RealArtifactGateway`. During an accountability interview, the PR gained deterministic working-tree inventory ordering and one-process blob reads through `git cat-file --batch`. The next session should plan mock-based tests rather than immediately implement them.

## Current State

- Branch is clean at `b35d6d32db243dcc4d58df25c8ae2b5ecb915716`; PR #4070 is live at https://github.com/nseng-ai/ns/pull/4070 with title `[accountable] [cp] Add canonical real artifact gateway`.
- `RealArtifactGateway` exposes an injectable `GitCommandExecutor`. Its `execute(args, options?)` method returns buffered stdout/stderr and now accepts optional string stdin.
- Existing `real-artifact-gateway.test.ts` is integration-only: it creates real git repositories and validates working-tree/commit-tree behavior, symlinks, marker-directory filtering, ancestry, diffs, and gitlinks.
- Existing artifact-creation integration tests inject only `beforePublish` hooks. No focused fake/mock tests currently pin git argv, stdin, batch protocol parsing, executor failures, or malformed output.
- Validation before submission passed: native TypeScript typecheck; 56 integration files / 281 tests; 7 focused unit, gateway, and scenario files / 80 tests; format and lint (one unrelated pre-existing lint warning elsewhere).

## Decisions / Findings

- Keep the broad git substrate in this PR. Four methods (`resolveCommit`, `readCommitFacts`, `isAncestor`, `diffCommits`) match the existing `ArtifactGateway`; `inventoryCommitTree` and `readCommitTreeCandidate` become private helpers farther upstack.
- Symlink non-following is deliberate safety policy. Working-tree confinement resolves against cwd; commit-tree confinement rejects absolute paths and `..` because those paths remain git pathspecs.
- `readCommitTreeCandidate` batches regular-file reads through one `git cat-file --batch` invocation. Newline-containing paths fall back to individual `git show` calls. The accepted bound is 64 MB total buffered output per candidate.
- Working-tree traversal sorts sibling entries by name for deterministic inventory.
- Mock-based tests should use the existing `GitCommandExecutor` seam, not module mocking or real process mutation. Follow repo fake-driven testing guidance and avoid shared Vitest module-state mocks.
- A prior upstack scan found the immediate `gitplane-check-cli` child appeared temporarily type-inconsistent, while farther upstack the gateway implements both contracts and the commit helpers become private. This is context only unless planning reveals stack-sensitive test placement.

## Next Steps

1. Read the TypeScript testing/style instructions and the `typescript-fake-driven-testing` skill before planning.
2. Inspect `RealArtifactGateway`, existing integration tests, and nearby in-memory gateway/fake conventions.
3. Define the smallest fake `GitCommandExecutor` test harness that records ordered invocations and supplies buffers/errors without `vi.mock`.
4. Build a test matrix prioritizing behavior not isolated by integration tests: exact argv and stdin, multi-blob binary parsing and ordering, malformed/truncated/missing `cat-file` records, newline fallback, zero regular files, executor failures, ancestry exit-code handling, path guards, and commit-output parsing.
5. Decide whether tests belong under `test/unit`, `test/gateways`, or another existing lane; avoid duplicating real-repository coverage.
6. Produce a reviewed implementation plan, including any small production seam changes required for testability. Wait for explicit direction before implementation.

## Investigation Sources

- Source session ID: 019fc599-d300-7fca-84e3-43aee413a1df
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-04--/2026-08-03T03-10-20-416Z_019fc599-d300-7fca-84e3-43aee413a1df.jsonl
- Related files:
  - `ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts` — production gateway, injectable git executor, batch parser, path confinement, and working-tree traversal.
  - `ts/packages/incubating/infra/gitplane/test/integration/real-artifact-gateway.test.ts` — current real-git coverage and baseline behavior.
  - `ts/packages/incubating/infra/gitplane/test/integration/node-artifact-creation.test.ts` — artifact-creation and hook-injection coverage retained for the new gateway.
  - `ts/packages/incubating/infra/gitplane/src/core/gateways.ts` — `ArtifactGateway` and `CorpusCheckGateway` contracts.
  - `ts/packages/incubating/infra/gitplane/src/testing/artifact-gateway.ts` — nearby in-memory gateway conventions worth comparing.
  - `ts/packages/incubating/infra/gitplane/src/testing/corpus-check-gateway.ts` — focused fake for the narrower corpus-check contract.
  - `ts/AGENTS.md` — test-lane, TypeScript validation, and no-module-mocking rules.
  - `.agents/skills/typescript-fake-driven-testing/SKILL.md` — required guidance for fake-driven gateway tests.
  - `.agents/skills/ns-typescript/SKILL.md` and `.agents/skills/typescript-style/SKILL.md` — required TypeScript overlays.
- No child/subagent session logs, plans, reports, or saved command-output files were created for this investigation.

## Useful Commands / Files

- `gh pr view 4070`
- `git diff $(git merge-base HEAD origin/gitplane-config-loading)...HEAD`
- `just ts-check`
- `just ts-test-integration`
- `just ts-test-typescript-style-guard`
- PR: https://github.com/nseng-ai/ns/pull/4070
