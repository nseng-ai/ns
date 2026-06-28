# Flow branch-latest-commit result block

## Summary

`sdl flow branch-latest-commit` has migrated to the signed-off CLI house style for finite
side-effect results (`house-style.md`), the first command port that cites the consolidated spec
rather than reverse-engineering the four prior renderers.

What changed:

- New flow-local renderer `ts/packages/capabilities/flow/src/shared/workflow-result-block.ts` for
  **multi-step workflow** side effects whose outcome is a domain-authored summary string rather than a
  single git/Graphite `ExecResult`. `branch-latest-commit` runs an ordered transaction (recovery
  branch, source reset, `gt create`, branch reset, HEAD verify, cleanup) and reports one settled
  outcome — new branch, moved commit, source reset, cleanliness — so per house style §7.1 the body is
  a "direct domain message" with no transcript to mine. The renderer applies the same headline grammar
  (bold + intent-paint + leading glyph, §3) and success-concise / failure-detailed tiers (§4) as
  `git-result-block.ts`, and appends dimmed `Cwd:` evidence.
- `branch-latest-commit.ts` now resolves caps via `resolveFlowStreamCaps(ctx)` and renders:
  - **success** → `workflow-result-block` success on stdout (`ok`): concise headline + the transaction
    summary at normal weight + dimmed cwd; no transcript dump.
  - **flow failure** → `workflow-result-block` failure on stderr (`failed`): the domain cause/recovery
    string (e.g. "Recovery branch: …", "Deleted incomplete branch …") at normal weight.
  - **dirty-worktree refusal** → `git-result-block` `refusal` (warn) on stderr: it is a real
    `git status` guardrail, identical in shape to `flow push`, so it honestly reuses that renderer and
    surfaces the dirty porcelain status as the actionable detail, pointing at `sdl flow autobranch`.
  - **snapshot probe failure** → `git-result-block` `failure` on stderr with the failed git probe as
    `Command:` and marker-extracted cause lines.
- No command semantics changed: clean worktree still required, dirty worktree still points to
  `sdl flow autobranch`, warnings still go to stderr, exit codes unchanged (`failed` defaults to 1),
  no machine contract or raw exit added.
- Tests: new `test/unit/workflow-result-block.test.ts` (success/failure tiers + truecolor/mono/ascii
  caps degradation) and `test/scenario/branch-latest-commit-command.test.ts` (success on stdout, dirty
  refusal on stderr without running the flow, snapshot failure, Graphite-create failure surfacing
  recovery guidance), plus a `runFlowBranchLatestCommitCommandWithFakes(...)` helper and a full
  happy-path subprocess script in `flow-command-fakes.ts`.

## Objective impact

- `cli-surface-audit.md` now marks `sdl flow branch-latest-commit` as Done.
- The finite side-effect surface now has two reference shapes: `git-result-block.ts` for
  single-`ExecResult` git/Graphite results, and `workflow-result-block.ts` for domain-summary
  multi-step workflows. Both stay **flow-local** — the user's standing decision is no extraction in
  this plan; record any future clinkr/core promotion as parked, not in-plan.
- The side-effect workflow/progress roadmap row remains open for `autobranch`, `autoslot`,
  `regenerate-pr`, and `land`.

## Follow-ups

- `createLatestCommitAutobranchFlow` (and the shared `AutobranchFlowResult`, also consumed by CCC
  `autobranch/flow.ts`) flattens **domain guardrail refusals** — pushed-HEAD, Graphite child branches,
  root/merge commit — into the `{ ok: false, error }` string. These currently render as `failure`
  (error/red) instead of first-class `warn` refusals (house style §7.3). Threading a
  `refusal`/`failure` discriminator up belongs with the shared `autobranch` migration (PR for
  `sdl flow autobranch`), since the type is shared across packages; doing it flow-locally would mean
  brittle string sniffing, which the spec forbids. Captured here so the next slice settles it.
- `workflow-result-block.ts` is intentionally success+failure only. `flow autobranch` should decide
  whether it grows a `refusal` kind or keeps reusing `git-result-block` for its clean-worktree
  guardrail.

## Evidence

Validation run after implementation:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow packages/autobranch`
  — passed (165 tests).
- `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-guard`,
  `just dprint-check`, `just ts-deps-check` — see commit/PR for the recorded run.
