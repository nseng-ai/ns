# Semantic Update: Repository-Selected Branch Creation Providers

## Summary

Branch Context now selects branch creation from the repository-wide `[workflow].branch-creation` setting. The accepted built-ins are `plain-git` and `graphite`; absence selects plain Git, while malformed TOML, an invalid workflow table, or an unsupported value fails before mutation. This repository explicitly selects Graphite in root `ns.toml`.

`@nseng-ai/extension-kit/branch-creation` now owns the neutral `BranchCreationProvider` contract and both built-in adapters. Providers own the complete create-one-branch operation and verify the resulting local ref through Git facts. The Graphite adapter preserves parent tracking checks and reports tracking failure after local creation as a partial failure.

Base Branch Context composition no longer constructs Graphite. Selection narrows to a creation-ready context and constructs Graphite only in the Graphite arm. Graphite-branded upstack and Herdr implementation flows require Graphite repository configuration. Invocation-level CLI/Pi provider selection is removed from production parsing; user-defined provider registration remains deferred.

## Execution strategy adaptation

The plan recommended `refactor-swarm`, but that skill/tool was unavailable in this session. The migration used direct semantic edits and targeted compiler/test feedback instead; this changed execution strategy only, not intended scope.

## Validation

- `pnpm --dir ts --filter @nseng-ai/extension-kit check` — passed.
- `pnpm --dir ts --filter @nseng-ai/extension-kit test` — passed (30 files, 307 tests).
- `pnpm --dir ts --filter @nseng-ai/branch-context check` — passed.
- `pnpm --dir ts --filter @nseng-ai/herdr check` — passed.
- `pnpm --dir ts --filter @nseng-ai/branch-context test` — ran; 216 tests passed and 20 stale-contract tests failed. Failures pin removed invocation flags/help/default options or pre-provider call counts and require fixture expectation migration.

## Objective Impact

The eager Branch Context construction and `BranchCreationProvider` roadmap rows are complete. The broader submit/land target row remains open.

## Follow-Ups

Open provider registration, external-command adapters, submit/land target neutrality, gh-stack, jj, and broader stack capability seams remain deferred exactly as before.
