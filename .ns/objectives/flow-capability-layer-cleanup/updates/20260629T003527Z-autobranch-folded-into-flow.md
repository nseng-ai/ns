# Autobranch Folded Into Flow

## Summary

Moved the former `@sdl/autobranch` dirty-worktree and latest-commit implementation into Flow-owned private internals under `ts/packages/capabilities/flow/src/autobranch/`, relocated the package's unit tests into Flow test space, and removed the standalone `ts/packages/autobranch` workspace package.

Flow commands and `sdl-flow/api` now import the moved internals relatively. CCC retains consumer-level coverage through the `sdl-flow/api` seam and no longer carries raw autobranch-internal unit tests. The kernel source-checkout jiti aliases for stale `@sdl/autobranch/*` specifiers were removed rather than mapped to Flow internals.

Package manifests, the pnpm lockfile, and style-guard extension graph configuration no longer list `@sdl/autobranch`; the style-guard synthetic cycle case now uses an active Flow/capability-style package name instead of treating autobranch as a live graph member.

Validation evidence:

- `rg -n '@sdl/autobranch|"@sdl/autobranch"' ts/package.json ts/pnpm-lock.yaml ts/packages -g 'package.json' -g '*.ts' -g 'pnpm-lock.yaml'` returned no matches.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test` passed: 25 files / 185 tests.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/ccc/test` passed: 12 files / 218 tests.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/kernel/test/unit/sdk-module-loader.test.ts` passed: 1 file / 2 tests.
- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/infra/core/test/integration/typescript-style-guard.test.ts` passed: 1 file / 56 tests.
- `just ts-format-check` passed.
- `just ts-lint` completed with pre-existing warnings in kernel tests only.
- `just ts-check` passed.
- `just ts-test` passed: 372 files / 3610 tests.
- `just ts-test-integration` passed: 29 files / 158 tests.
- `just ts-deps-check` passed.

Minimal adaptation: the broad `AUTOBRANCH_` inventory still finds legitimate command/test constant names such as `AUTOBRANCH_DESCRIPTION`, `AUTOBRANCH_SUMMARY`, and `AUTOBRANCH_CHECKPOINT_MESSAGE`; the stale package specifier and kernel alias references are gone.

## Objective Impact

Completes the autobranch fold slice: implementation/tests are now Flow-owned, stale runtime/test imports and jiti aliases are removed, and the old neutral-infra package/tier/style-guard surface is gone. The roadmap autobranch row can move from `[~]` to `[x]` based on the validation above.

## Follow-Ups

Remaining Objective work is unchanged:

- Move submit and PR-description policy from `@sdl/core/submit` into Flow ownership.
- Move Graphite submit orchestration from `@sdl/graphite/submit` into Flow ownership.
- Move shared capability gateway result/error substrate into `@sdl/capability-kit`.
- Rebaseline remaining package tiers, import guards, docs, and context after those slices land.
