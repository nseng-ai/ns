# Roaster nested read/list command-face migration

Completed the low-risk read/list migration slice for Roaster.

## Implemented

- SDL extension command discovery now supports structured nested manifest paths while preserving existing `{ group, name }` manifests. Command catalog keys use full segment keys such as `roaster/review/list`, and CLI selection resolves the longest matching command path.
- The project-local Roaster extension now contributes true nested SDL leaves:
  - `sdl roaster review list`
  - `sdl roaster review ls`
  - `sdl roaster review log [key]`
  - `sdl roaster roast list`
- Standalone `roaster review list` / `ls`, `roaster review log [key]`, and `roaster roast list` remain wired through the existing standalone command groups.
- Roaster read/list/log operations now have domain-result builders (`buildReviewListResult`, `buildReviewLogResult`, `buildRoastSkillListResult`) with thin Clinkr wrappers for CLI use.
- `@sdl/roaster/api` read/list methods now consume domain results directly via `RoasterResult<T>` and no longer convert `ClinkrExit` for these surfaces.
- Added Roaster SDL command modules and extension shims for the nested leaves, plus package exports for the new command modules.

## Compatibility evidence

- SDL command scenarios cover side-effect-light top-level and group help, selected schema/help, JSON execution for `review list`, `review ls`, `review log [key]`, and `roast list`, plus review-log namespace/key semantics for the `roaster` Branch Memory namespace and `reviews/<review-key>/...` entries.
- Existing standalone Roaster scenario tests remain green for `review list`/`ls`, `review log`, and `roast list` behavior.
- API unit tests remain green against fake gateways and the read/list API failure mapping now routes through domain-result mapping rather than Clinkr exit conversion.

## Validation run

- `pnpm --dir ts --filter @sdl/sdl run check`
- `pnpm --dir ts --filter @sdl/roaster run check`
- `pnpm --dir ts --filter @sdl/sdl run test -- packages/sdl/test/scenario/roaster-extension-cli.test.ts` (package script currently runs the SDL package test suite: 19 files / 124 tests)
- `pnpm --dir ts --filter @sdl/roaster run test -- packages/roaster/test/unit/api.test.ts packages/roaster/test/scenario/review-cli.test.ts packages/roaster/test/scenario/roast-cli.test.ts` (package script currently runs the Roaster package test suite: 25 files / 247 tests)
- `just ts-format-check`
- `just ts-lint` (passed with pre-existing warnings in `packages/sdl/test/scenario/handoff-cli-contract.test.ts`)
- `just ts-check`
- `just ts-test` (367 files / 3603 tests)

## Follow-up

The old flattened `sdl roaster review-list` proof surface is removed from the project-local Roaster manifest. Later roadmap rows still own `review run`, hidden findings recording/publication, public docs/skills alignment, and the standalone `roaster` binary disposition.
