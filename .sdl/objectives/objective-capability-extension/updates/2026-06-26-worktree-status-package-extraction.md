# Extracted worktree status into `@sdl/worktree-status`

## Summary

The worktree-status slice of the Pi→CCC cycle-break row is now extracted into a standalone private package:

- Created `ts/packages/worktree-status` as `@sdl/worktree-status` with `src/status.ts`, `src/extension.ts`, footer/activity/refresh modules, package exports, package tests, and package-local tsconfig/scripts.
- Moved the former `@sdl/ccc/worktree-status` implementation into `@sdl/worktree-status` and removed the `./worktree-status` export from `@sdl/ccc`.
- Moved the Pi worktree-status lifecycle/footer implementation out of `@sdl/pi` and into `@sdl/worktree-status`; `.pi/extensions/worktree-status.ts` now imports the new package source adapter directly.
- `@sdl/pi` no longer imports `@sdl/ccc/worktree-status` or a Pi-owned worktree-status implementation. It keeps only Pi-local static parity metadata for `pi:worktree-status-refresh`, with source ownership recorded as `@sdl/worktree-status`, to avoid a package cycle.
- `ts/packages/hosts/pi/src/flow/sdl-extension.ts` no longer directly imports `requestWorktreeStatusRefresh`; command-completion refresh relies on the existing Pi command event bus consumed by the extracted extension.
- Added neutral `@sdl/pi/commands/events` and `@sdl/pi/shared/timers` exports for the extracted package.

## Stale-edge evidence

Targeted worktree-status grep after extraction:

```bash
rg "@sdl/ccc/worktree-status" ts/packages .pi/extensions
```

Result: no matches.

Old Pi implementation import grep:

```bash
rg "from \"\.\./worktree-status/extension\.ts\"|src/worktree-status/extension" ts/packages/hosts/pi/src ts/packages/hosts/pi/test
```

Result: no matches.

Remaining broader Pi→CCC edge grep:

```bash
rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json
```

Result: still reports non-worktree edges in `ts/packages/hosts/pi/package.json`, focused cmux terminal-tab, land/trunk-pull, handoff-tab, branch-context upstack, Objective stack registration, and prose in parity metadata. Worktree-status no longer appears in the match set.

## Validation

Passed:

- `pnpm --dir ts --filter @sdl/worktree-status test` — 5 files, 56 tests.
- `pnpm --dir ts --filter @sdl/worktree-status check`.
- `pnpm --dir ts --filter @sdl/pi test` — 71 files, 909 tests.
- `pnpm --dir ts --filter @sdl/pi check`.
- `pnpm --dir ts --filter @sdl/ccc test` — 16 files, 264 tests.
- `pnpm --dir ts --filter @sdl/ccc check`.
- `just ts-deps-check`.
- `just ts-format-check`.
- `just ts-lint`.
- `just ts-check`.
- `just ts-guard`.
- `just ts-test` — 354 files, 3412 tests.

## Objective Impact

The Objective remains open and the Pi→CCC cycle-break row remains `[~]`: this removes the worktree-status-specific edge only. `@sdl/pi` still depends on `@sdl/ccc` for other command/orchestration surfaces, and final acyclicity guard/context documentation remain parked until the wider graph is actually acyclic.
