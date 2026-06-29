# Semantic Update: Submit and PR Description Policy Moved Into Flow

## Summary

Flow now owns the submit and PR-description policy that previously lived in neutral infra packages.

## Changes

- Moved PR-description prompt/model policy, generated-region handling, prompt hashing, parsing/repair, `GithubPrGateway`, and PR-description orchestration into `ts/packages/capabilities/flow/src/submit/`.
- Moved Graphite submit/restack orchestration, PR metadata prewrite, submitted-PR parsing/formatting, and submit failure transcript shaping into `ts/packages/capabilities/flow/src/submit/`.
- Updated Flow shared seams (`src/shared/pr-description.ts`, `src/shared/submit.ts`) and Flow scenario/unit tests to import the Flow-owned implementation.
- Removed `@sdl/core/submit` and `@sdl/graphite/submit` package exports and deleted the old `ts/packages/infra/core/src/submit/` and `ts/packages/infra/graphite/src/submit/` implementation trees.
- Repointed the one incidental Address `ErrorInfo` import to `@sdl/core/result`.
- Removed kernel jiti aliases for `@sdl/core/submit` and `@sdl/graphite/submit`.
- Kept Graphite-neutral command mechanics (`runGraphiteCommand`, `GRAPHITE_COMMAND_NAME`) in `@sdl/graphite/branch`; Flow submit imports those neutral helpers directly.

## Stale Edge Searches

All required searches are clean for live package references and module-loader aliases:

```bash
rg -n '@sdl/core/submit|@sdl/graphite/submit' ts/package.json ts/pnpm-lock.yaml ts/packages -g 'package.json' -g '*.ts' -g 'pnpm-lock.yaml'
rg -n 'CORE_SUBMIT_SPECIFIER|GRAPHITE_SUBMIT_SPECIFIER|CORE_SUBMIT_MODULE_PATH|GRAPHITE_SUBMIT_MODULE_PATH' ts/packages/kernel/src ts/packages/kernel/test -g '*.ts'
rg -n 'ts/packages/infra/core/src/submit|ts/packages/infra/graphite/src/submit' ts/packages -g '*.ts'
```

## Validation

- Targeted moved/consumer tests: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/unit/pr-description.test.ts packages/capabilities/flow/test/unit/pr-description-orchestration.test.ts packages/capabilities/flow/test/unit/github-pr-gateway.test.ts packages/capabilities/flow/test/unit/submit.test.ts packages/capabilities/flow/test/scenario/regenerate-pr-command.test.ts packages/capabilities/flow/test/scenario/submit-command.test.ts` — 92 tests passed.
- `just ts-format-check` — passed after `just ts-format-fix`.
- `just ts-lint` — passed with pre-existing warnings only.
- `just ts-check` — passed.
- `just ts-test` — 372 files / 3610 tests passed.
- `just ts-test-integration` — 29 files / 158 tests passed.
- `just ts-deps-check` — passed.

## Roadmap Impact

The submit/PR-description row and Graphite submit orchestration row are complete: Flow owns the implementation and tests, while neutral infra no longer exports the old submit subpaths.

The shared capability gateway result/error substrate row remains open. This slice removes submit-specific core aliases; Flow currently uses Flow-local submit helpers plus generic `@sdl/core/result` where needed. A future slice should still decide whether capability-oriented gateway helpers belong in `@sdl/capability-kit`.
