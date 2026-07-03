# Model Slug Split

## Summary

Split the old mixed `@sdl/core/model-slug` surface into two homes:

- `@sdl/core/model-slug` now contains only pure model-reference parsing, provider-family inference, default model constants, `SLUG_MODEL_ENV`, and pure predicates.
- New `@sdl/capability-kit/model-slug` owns the process/env-backed slug derivation runner: `deriveSlugWithModel`, `buildSlugModelArgs`, `formatSlugModelFailure`, runner result/failure/evidence types, retry/timeout behavior, and `pi` command construction.

Production and test consumers that use runner symbols now import `@sdl/capability-kit/model-slug`; pure/default consumers stay on `@sdl/core/model-slug`. Runner tests moved from core to Capability Kit.

## Objective Impact

This completes the `model-slug` residual split described by ADR 0018/0019 and the neutral-infra residual roadmap. `@sdl/core/model-slug` no longer imports `@sdl/core/command`, reads `process.env`, constructs `pi` subprocess arguments, formats subprocess output, or owns retry/timeout behavior.

Source-search evidence:

- `rg -n "deriveSlugWithModel|buildSlugModelArgs|formatSlugModelFailure|SlugModelEvidence|SlugModelFailure|SlugModelDerivationResult|SlugModelCommandResult|SlugModelExecOptions" ts/packages/infra/core/src/model-slug.ts ts/packages/infra/core/test -S` returned no matches.
- `rg -n "process\.env|\bpi\b|buildSlugModelArgs|deriveSlugWithModel|formatOutputSection|formatCommand" ts/packages/infra/core/src/model-slug.ts -S` returned no matches.
- `rg -n "@sdl/core/model-slug" ts/packages ts/scripts -S --glob '*.ts'` shows remaining core imports are pure/default/parser/provider-family uses plus the Capability Kit runner importing pure constants/types.
- `rg -n "@sdl/capability-kit/model-slug" ts/packages ts/scripts -S --glob '*.ts'` shows runner consumers/tests on the new kit subpath.

Validation evidence:

- `just ts-deps-check` passed.
- `pnpm --dir ts --filter @sdl/core run check` passed.
- `pnpm --dir ts --filter @sdl/core run test` passed: 17 files, 179 tests.
- `pnpm --dir ts --filter @sdl/capability-kit run check` passed.
- `pnpm --dir ts --filter @sdl/capability-kit run test` passed: 12 files, 78 tests.
- Targeted checks/tests passed for touched consumers: `sdl-flow`, `@sdl/plans`, `@sdl/handoff-pi`, `@sdl/branch-context-pi`, `@sdl/branch-context`, `@sdl/ccc`, and `@sdl/kernel`.
- `just ts-format-check`, `just ts-lint`, and `just ts-check` passed.
- `just ts-test` passed: 379 files, 3671 tests.
- `just ts-test-integration` passed: 28 files, 101 tests.

Known validation caveat:

- `just ts-test-typescript-style-guard` still fails on a pre-existing package-tier violation in `ts/packages/local-pi-tools/thermo-council/package.json` (`@local-pi-tools/thermo-council` depends on `@sdl/capability-kit`). During implementation an intermediate kernel dependency on Capability Kit was rejected by this gate and removed; the rerun reports only the thermo-council violation.

## Follow-Ups

- Continue residual order with `clock`/`timers` concrete-adapter extraction.
- Resolve or explicitly allowlist the unrelated `@local-pi-tools/thermo-council` style-guard tier violation so the style-guard gate can return to green.
