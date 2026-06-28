# Flow pull-trunk result block

## Summary

`sdl flow pull-trunk` has migrated to the signed-off CLI house style for finite git/Graphite side-effect results.

What changed:

- `@sdl/ccc/trunk-pull` now exposes additive structured result facts (`runTrunkPullDetailed`) while preserving the existing plain-text `runTrunkPull` / `runTrunkPullCli` compatibility path.
- `sdl flow pull-trunk` renders success and failure through the flow-local `git-result-block.ts`, returning success on stdout and failures on stderr through the normal `ok(...)` / `failed(...)` path.
- The flow CCC bridge now has `runFlowCccOperation(...)` so commands can reuse the scoped/trusted exec boundary without forcing stdout/stderr text formatting.
- The result block is now a git/Graphite subprocess block and has targeted cause-line promotion for `not fast-forward` / `denied` in addition to the original push markers.
- Live review of the happy path refined the generalized recommendation: successful side-effect blocks should stay concise (headline, human guidance, dimmed command/cwd evidence). Exit/killed facts and stdout/stderr transcripts are failure/debug evidence, not routine success UI.

## Objective impact

- `cli-surface-audit.md` now marks `sdl flow pull-trunk` as Done.
- `git-result-block.ts` has its second consumer, but remains flow-local. The evidence supports the primitive's usefulness, not yet extraction into clinkr/core; another command such as `flow autobranch` or `flow branch-latest-commit` should prove the next shape before promotion.
- The side-effect workflow/progress roadmap row remains open for the other P0 flow/workflow commands.

## Evidence

Validation run after implementation:

- `pnpm --dir ts run test -- packages/ccc/test/trunk-pull.test.ts packages/capabilities/flow/test/unit/extension-shared-ccc-cli.test.ts packages/capabilities/flow/test/unit/git-result-block.test.ts packages/capabilities/flow/test/unit/extension-shared-flow-foundations.test.ts packages/capabilities/flow/test/scenario/pull-trunk-command.test.ts packages/capabilities/flow/test/scenario/push-command.test.ts` — passed.
- `just ts-format-check` — passed after `just ts-format-fix` formatted touched files.
- `just ts-lint` — passed.
- `just ts-check` — passed.
- `just ts-test` — passed.
- `just ts-guard` — passed.
- `just dprint-check` and `just ts-deps-check` — passed after `just dprint-fix` aligned the audit table.
- `just` — passed as full repo closure evidence.
