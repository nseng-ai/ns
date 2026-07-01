# GitHub CLI / Git Exec Env-Map and Abort-Signal Option Narrowing

## Summary

Followed up on the prior update's recommendation to investigate `ts/packages/infra/github`
(`cli.ts`, `github-cli.test.ts`, `pr-feedback/types.ts`, 8 combined raw properties).
Classification showed these fields are exec/DI option bags for invoking the `gh` CLI and
internal git helpers, not GitHub API/GraphQL response mirrors, so this slice converted
them to this Objective's established typed contract (or plain omission-only optionals)
instead of deferring them:

- `ts/packages/infra/github/src/cli.ts`: `RunGitHubCliBaseOptions.env` →
  `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>`, `.signal` →
  `ExplicitUndefined<"abort-signal", AbortSignal>`, `.timeoutMs` → plain `number` optional
  (dropped `| undefined`).
- `ts/packages/infra/github/src/pr-feedback/types.ts`: `GithubPrFeedbackOptions.env` →
  `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>`, `.signal` →
  `ExplicitUndefined<"abort-signal", AbortSignal>`.
- `ts/packages/infra/brmem/src/real-git-gateway.ts`: private `runGit` helper's inline
  `{ cwd; env; stdin }` param dropped both `env`/`stdin` to plain omission-only optionals.
- `ts/packages/infra/git/src/testing.ts`: `TempGitRepoRunOptions.env` dropped to plain
  omission-only optional, matching the sibling `input` field already narrowed in this same
  interface by an earlier commit (`d932891c5`).

Semantic claim: every converted field is an exec/DI-seam option (`env`, `signal`,
`timeoutMs`, `stdin`) consumed via `?? default` or an `=== undefined` conditional spread;
present-key `undefined` carries no distinct meaning from omission in any of these call
paths, and no caller anywhere in the repo passes `env:`, `signal:`, `timeoutMs:`, or
`stdin:` as an explicit `undefined` value. `env`/`signal` were converted to the established
`ExplicitUndefined<Reason, T>` typed contract (matching `env-map`/`abort-signal` usage
already present elsewhere in the repo, including two files away in this same package's
`gateway.ts`/`schemas.ts` for `external-mirror` fields) because they are cross-package
production option bags consumed by `roaster`, `slot`, `flow`, `address`, and
`worktree-status`. `timeoutMs`, the `real-git-gateway.ts` helper params, and
`TempGitRepoRunOptions.env` were dropped to plain omission-only optionals instead, since
they are internal/private/test-helper surfaces without a cross-package compatibility
story, matching this Objective's established "drop to plain optional for internal
helpers" precedent (`2026-06-30T161602Z-core-utility-helper-options-narrowing.md`).

**Preserved, not touched:** the 3 remaining raw candidates in
`ts/packages/infra/github/test/github-cli.test.ts` are a local
`options?: ExecOptions | undefined` array-element type that directly captures a
`CommandRunner` callback's `options` parameter (typed `ExecOptions | undefined` by
`CommandRunner`'s own signature) for test assertions. Removing `| undefined` there would
be a real `exactOptionalPropertyTypes` type error, not a redundant-undefined cleanup,
because the captured parameter's static type genuinely includes `undefined` even though
this codebase's actual `runGitHubCli` call path never invokes the runner with `undefined`
in practice. This is explicitly classified unsafe/unrelated to this slice's boundary.

Scorecard using `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs`:

| Scope                                                                                                                                   | Raw optional-undefined properties | Typed explicit-undefined contracts | Legacy preserve markers | Undefined-normalization/check lines |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------: | ---------------------------------: | ----------------------: | ----------------------------------: |
| `ts` before                                                                                                                             |                                50 |                                 81 |                       0 |                                2298 |
| `ts` after                                                                                                                              |                                42 |                                 85 |                       0 |                                2298 |
| scoped (`ts/packages/infra/github` + `ts/packages/infra/brmem/src/real-git-gateway.ts` + `ts/packages/infra/git/src/testing.ts`) before |                                11 |                                  3 |                       0 |                                  88 |
| scoped after                                                                                                                            |                                 3 |                                  7 |                       0 |                                  88 |

The undefined-normalization/check count is unchanged in both scopes: all consumption code
already used `=== undefined`/`!== undefined` conditional spreads or `?? default` fallback
before this change; no new normalization debt was introduced, and none was removed (the
same conditional-spread expressions type-check unchanged against the narrowed/typed
declarations).

## Objective Impact

Reduces repo-wide raw optional-undefined debt by 8 (50 → 42) with zero normalization-debt
cost, while growing the typed `ExplicitUndefined` contract count by 4 (81 → 85) for the
cross-package `env`/`signal` DI-seam fields. This also resolves the prior update's explicit
follow-up: the `infra/github` cluster turned out to be a safe internal DI-seam boundary
(not a GitHub API/GraphQL response mirror needing deferral), consistent with the two
already-typed `external-mirror` fields elsewhere in the same package that confirm the
package already distinguishes DI-seam options from response mirrors.

Preserved/deferred categories:

- `ts/packages/infra/github/test/github-cli.test.ts` — 3 fields left untouched; genuinely
  necessary capture of a `CommandRunner`-typed callback parameter, not a redundant
  optional-undefined declaration. See rationale above.
- `ts/packages/sdl-sdk/src/{execution,command}.ts` — public SDK tier; deferred per
  Non-Goals (unchanged from prior updates).
- `ts/packages/sdl-capability-kit/src/{git,sdl-command,sdl-context}.ts` — capability-kit
  tier; deferred per Non-Goals (unchanged from prior updates).
- `ts/packages/roaster/src/{api,project-config}.ts` — previously flagged deferred
  public/API/schema-facing residual; not touched in this slice.

## Validation

- `pnpm --dir ts --filter @sdl/github run check` and `run test`: passed (48 tests).
- `pnpm --dir ts --filter @sdl/brmem run check` and `run test`: passed (112 tests).
- `pnpm --dir ts --filter @sdl/git run check` and `run test`: passed (26 tests).
- Downstream consumer sanity typechecks: `@sdl/address`, `@sdl/plans`, `@sdl/roaster`,
  `@sdl/worktree-status`, `sdl-flow`, `@sdl/slot`, `@local-pi-tools/pr-feedback-watch`
  — all `run check` passed.
- `just ts-format-check`: passed.
- `just ts-lint`: passed.
- `just ts-check`: passed (full repo-wide typecheck).

## Follow-Ups

- Remaining repo-wide raw candidates worth investigating next are scattered single-field
  files: `ts/packages/infra/cli-theme/src/report.ts`,
  `ts/packages/infra/clinkr/src/confirmation.ts`,
  `ts/packages/kernel/src/extension-registry.ts`,
  `ts/packages/sdl-capability-kit/src/sdl-context.ts` (likely public-tier, likely
  deferred), `ts/packages/tools/areg/src/gateways/github-gateway.ts`, and
  `ts/packages/worktree-status/test/test-support.ts`. Each is currently a lone 1-field
  candidate; classify individually before deciding whether to batch into one coherent
  cluster or handle per-package.
- Do not reopen `sdl-sdk` or `sdl-capability-kit` mechanically; only narrow those if a
  separate compatibility review explicitly approves tightening the public
  SDK/capability-kit tier surfaces.
