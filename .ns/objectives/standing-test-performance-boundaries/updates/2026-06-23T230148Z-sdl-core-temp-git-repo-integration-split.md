# Sdl-Core Temp Git Repo Smoke Integration Split

## Summary

Moved the `@sdl/core/testing` real `createTempGitRepo` behavior smoke out of the default Vitest lane and into `ts/packages/sdl-core/test/integration/testing-create-temp-git-repo.test.ts`.

The default `ts/packages/sdl-core/test/testing-export.test.ts` still verifies that `createTempGitRepo` is exported through `@sdl/core/testing`, but it no longer creates a temporary Git repository or invokes real Git. The integration test preserves the behavior smoke that `createTempGitRepo` initializes a committed `main` branch with a clean status and `initial` HEAD commit.

## Performance evidence

- Measured command: `pnpm exec vitest run --config vitest.config.ts packages/sdl-core/test/testing-export.test.ts` from `ts/`, sampled after one warm-up run.
- Baseline timing: samples `0.793s, 0.814s, 0.834s, 0.808s, 0.838s, 0.806s`; mean `0.816s`, min `0.793s`, max `0.838s`.
- Post-change timing: samples `0.701s, 0.704s, 0.702s, 0.704s, 0.705s, 0.708s`; mean `0.704s`, min `0.701s`, max `0.708s`.
- Repetition/noise notes: small local targeted samples, so this is placement and targeted-file evidence rather than a full-suite speedup claim.
- Cost handling: shifted real temporary Git repository setup and real Git subprocess work from default discovery/execution into the TypeScript integration lane.
- Coverage retention: default export-shape coverage remains in `testing-export.test.ts`; real `createTempGitRepo` behavior coverage is retained in the new integration test.

## Discovery and validation evidence

- Default discovery for `packages/sdl-core/test/testing-export.test.ts` no longer lists `temp git repo helper initializes a committed main branch`.
- Integration discovery for `packages/sdl-core/test/integration/testing-create-temp-git-repo.test.ts` lists `temp git repo helper initializes a committed main branch`.
- `rg -n "createTempGitRepo\(" ts/packages/*/test -g '*.test.ts' -g '!**/integration/**'` returns no default-lane call sites.
- Targeted default test: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl-core/test/testing-export.test.ts` passed.
- Targeted integration test: `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl-core/test/integration/testing-create-temp-git-repo.test.ts` passed.
- Broader validation passed: `just dprint-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-test-integration`, and `just ts-guard`.

## Objective Impact

This applies the documented `ts/TESTING.md` standard for tests that create temporary repositories by invoking real Git commands. The standing Objective should no longer treat the `@sdl/core/testing` temp Git repo helper smoke as pending default-lane cleanup.

## Follow-Ups

- Future rebaseline work should choose a different candidate instead of re-opening this completed temp-Git helper split.
- Keep distinguishing inert temporary filesystem fixtures from tests that exercise real external tools such as Git.
