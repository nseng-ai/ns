# Brmem CLI Runner Relocated

## Summary

Moved the brmem-specific subprocess helper surface out of `@sdl/core/brmem-cli` and into `@sdl/brmem/cli-runner` with no compatibility shim. The new brmem-owned subpath preserves the existing helper symbols (`runBrmem`, `runAvailableBrmemCommand`, `checkBrmemEntry`, `putBrmemEntryFromFile`, `listBrmemEntries`, parsing helpers, and related result/error types) while importing pure command/primitives helpers from `@sdl/core`.

The old private workspace-root marker-walk copy was deleted. `@sdl/brmem/cli-runner` now imports `findWorkspaceRootByMarkers` from `@sdl/capability-kit/workspace-root`, which is available from brmem's existing dependency set.

Live consumers were repointed from `@sdl/core/brmem-cli` to `@sdl/brmem/cli-runner`:

- `ts/packages/ccc/src/cmux/dispatch-prompt.ts`
- `ts/packages/roaster/src/gateways/review-log.ts`
- `ts/packages/worktree-status/src/status.ts`

Direct package dependencies on `@sdl/brmem` were added for `@sdl/ccc`, `@sdl/roaster`, `@sdl/worktree-status`, and `@sdl/branch-context-pi` (for test support).

Moved brmem-specific test support out of the broad `@sdl/core/testing` aggregate: `brmemCheckJson` now lives at `@sdl/brmem/cli-runner/testing`. The CCC test harness and branch-context Pi extension test support now import/re-export it from the brmem-owned test helper subpath. Generic core testing helpers such as `ScriptedQueue`, temp repo helpers, clocks/timers, and GitHub fixtures were intentionally left in `@sdl/core/testing` for the later memberwise split.

## Objective Impact

This removes the residual `@sdl/core/brmem-cli` door identified by the neutral-infra gateway consolidation objective. Core no longer exports or contains the brmem CLI runner source/test, and no shim remains.

Source-search evidence after the move:

- `rg -n '@sdl/core/brmem-cli' ts/packages ts/scripts --glob '*.ts' -S` returned no matches.
- `rg -n '"\\./brmem-cli"' ts/packages/infra/core/package.json` returned no matches.
- `test ! -f ts/packages/infra/core/src/brmem-cli.ts` passed.
- `test ! -f ts/packages/infra/core/test/brmem-cli.test.ts` passed.
- `rg -n 'findWorkspaceRootByMarkers|brmem-cli is a deferred core residual' ts/packages/infra/core/src ts/packages/infra/brmem/src -S` showed only the new `@sdl/brmem/cli-runner` import/use of the Capability Kit workspace-root helper; the old core residual comment/private copy is gone.

Validation passed:

- `pnpm --dir ts --filter @sdl/brmem run check`
- `pnpm --dir ts --filter @sdl/brmem run test`
- `pnpm --dir ts --filter @sdl/core run check`
- `pnpm --dir ts --filter @sdl/core run test`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/roaster run check`
- `pnpm --dir ts --filter @sdl/worktree-status run check`
- `just ts-deps-check`
- `just ts-format-check` (after `just ts-format-fix` corrected `ts/packages/infra/brmem/src/cli-runner.ts` formatting)
- `just ts-lint`
- `just ts-check`
- `just ts-test`
- `just ts-test-typescript-style-guard`

## Follow-Ups

The broad `@sdl/core/testing` aggregate split remains open. This slice only moved the brmem-specific `brmemCheckJson` helper and did not move unrelated testing infrastructure.

After the broad testing split and any remaining residual cleanup, run the final core purity proof and capability package cleanup for the objective.
