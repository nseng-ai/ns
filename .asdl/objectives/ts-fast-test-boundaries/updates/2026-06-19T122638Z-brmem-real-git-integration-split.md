# Brmem Real-Git Split Completed

## Summary

The brmem real-Git test boundary is now split: the default Vitest suite keeps fast fake-driven and injected-command coverage, while tests that create throwaway Git repositories or wire public scenarios through `RealGitBrmemGateway` run under the explicit TypeScript integration suite.

Moved retained temp-Git coverage into `packages/brmem/test/integration/`:

- `real-git-gateway.test.ts`
- `prompt-resolution.test.ts`
- `copy-operation-real-git.test.ts`
- `export-operation-real-git.test.ts`

Default-path changes:

- `packages/brmem/test/gateways/real-git-gateway.test.ts` now keeps injected `CommandExecApi` real-adapter sanity coverage for current branch command execution and Git output parsing.
- `packages/brmem/test/gateways/prompt-resolution.test.ts` now injects a fake GitGateway for repository-root success/failure behavior and uses only ordinary temp files for `fileExists` coverage.
- `packages/brmem/test/scenario/copy-operation.test.ts` and `packages/brmem/test/scenario/export-operation.test.ts` remain fake-driven for user-visible scenario behavior; their public real-Git wiring cases moved to integration.

## Objective Impact

- Completed the roadmap row to split brmem real-Git coverage into default fake-driven gateway tests and integration tests.
- Removed temp-repository Git subprocess coverage from default brmem gateway/scenario tests without deleting the existing behavior coverage.
- Preserved real Branch Memory System Git-ref adapter behavior, prompt repository-root behavior, copy dry-run mutation behavior, export Base Namespace filtering, and remote config behavior under the intentional integration command.
- The Objective remains open for the separate sqlite/worktree-status split.

## Validation

- `pnpm --dir ts exec vitest list --config vitest.config.ts --filesOnly | rg 'packages/brmem/test/integration' || true` produced no default integration-file matches.
- `pnpm --dir ts exec vitest list --config vitest.integration.config.ts --filesOnly | rg 'packages/brmem/test/integration'` listed the four new brmem integration files.
- `rg -n "createTempGitRepo|new RealGitBrmemGateway\(repo\.path\)" ts/packages/brmem/test/gateways ts/packages/brmem/test/scenario` produced no matches.
- `pnpm --dir ts run test packages/brmem/test/gateways/real-git-gateway.test.ts packages/brmem/test/gateways/prompt-resolution.test.ts packages/brmem/test/scenario/copy-operation.test.ts packages/brmem/test/scenario/export-operation.test.ts` passed after the split with 4 files / 28 tests.
- `pnpm --dir ts run test:integration packages/brmem/test/integration` passed with 4 files / 10 tests.
- `pnpm --dir ts run fmt:check` passed after `pnpm --dir ts run fmt` fixed formatting.
- `pnpm --dir ts run lint` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run check:legacy` passed.
- `pnpm --dir ts run test` passed with 260 files / 2702 tests.
- `pnpm --dir ts run test:integration` passed with 10 files / 31 tests.
- `just ts-guard` passed.
- `just ts-deps-check` passed.

## Performance evidence

- Baseline measured command:
  - `/usr/bin/time -p pnpm --dir ts run test packages/brmem/test/gateways/real-git-gateway.test.ts packages/brmem/test/gateways/prompt-resolution.test.ts packages/brmem/test/scenario/copy-operation.test.ts packages/brmem/test/scenario/export-operation.test.ts`
- Baseline affected-default timing: 4 files / 37 tests passed; Vitest duration 3.46s; `/usr/bin/time` real 4.01s.
- Post-change affected-default timing for the same command: 4 files / 28 tests passed; Vitest duration 302ms; `/usr/bin/time` real 0.86s.
- Integration timing for moved brmem real-Git coverage:
  - `/usr/bin/time -p pnpm --dir ts run test:integration packages/brmem/test/integration` passed with 4 files / 10 tests; Vitest duration 3.46s; `/usr/bin/time` real 3.97s.
- Repetition/noise notes: baseline and post-change timings are single local samples in the same worktree with warm dependencies. They should be read as boundary-shift evidence, not a precise benchmark.
- Cost handling: the change moves temp-Git subprocess cost from the default command to the explicit integration command; it does not claim that real-Git coverage is free.
- Coverage retention: the moved integration files preserve prior temp-Git cases for real gateway snapshot read/write/check/list, delete preserving siblings and empty snapshots, full-snapshot copy, key-glob copy, glob-conflict handling, invalid branch / detached current branch mapping, remote config read/write, prompt repo-root behavior, public copy dry-run mutation behavior, and public export Base Namespace filtering.

## Follow-Ups

- Continue the Objective with the separate sqlite-backed Graphite/worktree-status default-path split.
- Consider consolidating brmem integration cases only if later measured integration cost becomes unreasonable.
