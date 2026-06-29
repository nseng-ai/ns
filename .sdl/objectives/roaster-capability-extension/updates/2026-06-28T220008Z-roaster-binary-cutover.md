# Roaster standalone binary cutover

## Summary

The standalone `roaster` binary has been hard-cut now that the SDL command face has parity. Repo-local inventory found no active compatibility blocker after `.github/workflows/roaster.yml` and public Roaster skills had already moved to `sdl roaster ...`.

Implementation removed the package `bin.roaster` entry, deleted the standalone `ts/packages/roaster/src/cli.ts` entrypoint, removed CLI-only root exports (`runCli`, `CliDeps`), deleted the repo-local `just install-roaster` source shim target, and retired standalone CLI/runtime scenario tests that only exercised the removed binary. Roaster Domain Core, command modules, `@sdl/roaster/api`, package root non-CLI exports, review definitions, Branch Memory review-log storage, and GitHub publication semantics were preserved.

Active context and audit docs now treat `sdl roaster ...` as the canonical command face and record the former standalone raw-exit publication exception as resolved by removal. No live GitHub publication validation was performed.

## Objective Impact

This completes the roadmap row “Decide and execute standalone `roaster` binary cutover.” The durable user-facing command face in this repository is now `sdl roaster ...`; no long-lived duplicate standalone public implementation remains.

Validation evidence:

- `pnpm --dir ts --filter @sdl/roaster run check`
- `pnpm --dir ts --filter @sdl/sdl run check`
- `pnpm --dir ts --filter @sdl/sdl run test -- packages/sdl/test/scenario/roaster-extension-cli.test.ts`
- `pnpm --dir ts --filter @sdl/roaster run test`
- `just ts-format-check`
- `just ts-lint` (exited successfully with unrelated warnings in `packages/sdl/test/scenario/handoff-cli-contract.test.ts`)
- `just ts-check`
- `just ts-test`
- `just dprint-check` after `just dprint-fix`

## Follow-Ups

- Reassess whether the broad `@sdl/roaster` package root export should later be narrowed in favor of `@sdl/roaster/api`; this cutover intentionally left non-CLI root exports in place.
- Continue the next roadmap row: close out the Roaster capability migration and update the parent `sdl-extension-architecture` Objective.
- Address remaining non-binary CLI conformance follow-ups, such as structured `data` on Roaster failures or `review log` continuation/bound state, under the appropriate CLI conformance work rather than this binary cutover.
