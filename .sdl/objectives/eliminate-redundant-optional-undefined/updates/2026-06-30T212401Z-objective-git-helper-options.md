# Objective/Git Helper Option Narrowing

## Summary

Narrowed six omission-only internal helper option properties across `@sdl/objective` and `@sdl/git`:

- `ReadLocalBranchRefsOptions.fs?: LocalBranchRefReaderFs`
- `TempGitRepoRunOptions.input?: string`
- `createRealObjectiveContext` options `cwd?: string` and `git?: GitGateway`
- `BuildObjectiveBranchAttributionParams.maxBranchWalks?: number`
- `emptySummary` helper option `errorLine?: number`

Repo-wide typed optional-undefined count in `ts`: 169 → 163.
Scoped typed optional-undefined count in `ts/packages/objective ts/packages/infra/git`: 10 → 4.
Repo-wide undefined-normalization/check count in `ts`: 2299 → 2299.
Scoped undefined-normalization/check count in `ts/packages/objective ts/packages/infra/git`: 31 → 31.

Validation passed:

- `just ts-check`
- `pnpm --dir ts --filter @sdl/objective test -- --runInBand`
- `pnpm --dir ts --filter @sdl/git test`

## Objective Impact

This slice removes redundant `| undefined` from internal result/helper/config shapes where omission already carries the absent state. `TempGitRepoRunOptions.input` required one construction-path normalization: `createTempGitRepo().runGit` now omits the `spawnSync` `input` key with `optionalEntry("input", runOptions.input)` instead of materializing `input: undefined`.

Preserved/deferred categories:

- Env-map surfaces remain explicit-undefined-capable (`TempGitRepoRunOptions.env` and Objective API env options) because environment maps routinely model key values as `string | undefined`.
- Objective selection UI callback return/value contracts remain unchanged because `string | undefined` is callback data, not optional-property widening.
- Public/capability Objective API compatibility shapes were not narrowed in this slice.

## Follow-Ups

The remaining scoped candidates are intentional preserves/defer items in Objective API env/UI contracts and the `@sdl/git` test env option. Future cleanup should only narrow them after producer normalization or an explicit compatibility decision for those public/input-like surfaces.
