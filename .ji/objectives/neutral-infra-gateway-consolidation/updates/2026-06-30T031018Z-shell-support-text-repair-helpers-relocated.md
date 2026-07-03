# Shell Support and Text Repair Helpers Relocated

## Summary

Moved the shell marker/wrapper helpers from `@sdl/core/shell-support` to `@sdl/capability-kit/shell-support`, and moved the text repair orchestration helper from `@sdl/core/text-repair` to `@sdl/capability-kit/text-repair`. Live consumers in kernel, Slot, Flow, and the thermo-council local Pi tool now import the Capability Kit subpaths directly. The former core source files and `./shell-support` / `./text-repair` package exports were deleted in the same slice.

No separate target home was needed: both helpers fit the Objective's straightforward gateway-helper default for Capability Kit, and validation found no dependency-cycle or tier-boundary blocker.

Validation and source-search evidence:

- `rg -n '@sdl/core/(shell-support|text-repair)' ts/packages ts/scripts -S --glob '*.ts'` returned no matches.
- `rg -n '"\\./(shell-support|text-repair)"' ts/packages/infra/core/package.json` returned no matches.
- `test ! -f ts/packages/infra/core/src/shell-support.ts && test ! -f ts/packages/infra/core/src/text-repair.ts` passed.
- Targeted checks passed: `pnpm --dir ts --filter @sdl/capability-kit run check`, `pnpm --dir ts --filter @sdl/capability-kit run test`, `pnpm --dir ts --filter @sdl/core run check`, `pnpm --dir ts --filter @sdl/core run test`, `pnpm --dir ts --filter @sdl/kernel run check`, `pnpm --dir ts --filter @sdl/slot run check`, `pnpm --dir ts --filter sdl-flow run check`, `pnpm --dir ts --filter @local-pi-tools/thermo-council run check`, and `just ts-deps-check`.
- Broad TS lane passed: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test`.

## Objective Impact

This completes the `shell-support` and `text-repair` portion of the runtime-harness/residual roadmap row and removes two more helper doors from `@sdl/core`. After the residual helper slices in this stack, core no longer exports `temp-files`, `xdg`, `workspace-root`, `shell-support`, or `text-repair`.

## Follow-Ups

Continue with the remaining residual order: `model-slug` split, `clock`/`timers` concrete-adapter extraction, `brmem-cli` and `@sdl/core/testing` memberwise cleanup, then final purity proof/capability cleanup. This slice intentionally did not move those unrelated residuals.
