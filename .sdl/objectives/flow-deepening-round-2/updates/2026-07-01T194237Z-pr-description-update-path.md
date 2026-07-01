# PR Description Update Path Slice Completed

## Summary

Submit and regenerate now share the PR-description update preparation/apply path in `submit/pr-description-orchestration.ts`. The regenerate command calls the unified path, then handles confirmation and editing from the typed decision instead of running a duplicate regenerate-specific resolve/generate/edit sequence. The duplicate `shared/pr-description.ts` orchestration file was deleted; regenerate-specific adaptation now lives under `submit/pr-description-regenerate.ts` and delegates to the unified update module. The regenerate overwrite bug is covered by a scenario regression: when the existing SDL-managed region fingerprint matches the current stable patch ID, prompt hash, and generator version, `sdl flow regenerate-pr` exits successfully as an already-current no-op before confirmation, model generation, PR commit lookup, or `gh pr edit`.

Validation evidence:

- Slice-local targeted validation passed during implementation: `pnpm --dir ts --filter sdl-flow test -- test/unit/pr-description.test.ts test/unit/pr-description-orchestration.test.ts test/scenario/regenerate-pr-command.test.ts test/scenario/submit-command.test.ts`, `pnpm --dir ts --filter sdl-flow run check`, `pnpm --dir ts run fmt:check`, and `pnpm --dir ts run lint`.
- Combined targeted Flow validation later passed: 36 files / 361 tests covering land-stack, autobranch, and PR-description scenarios.
- Full TS validation later passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-test-integration`, `just ts-test-typescript-style-guard`, and `just ts-deps-check`.

## Objective Impact

Completes the roadmap row "Unify the PR-description update path and close the fingerprint overwrite bug". Regenerate's already-current behavior is the one intended product behavior change for this Objective, submit's existing managed-region skip behavior remains covered, and the old shared duplicate path is gone.

## Follow-Ups

None for this slice before review. Objective close can be considered in a separate lifecycle step after code review if the checked roadmap state remains accepted.
