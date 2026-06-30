# Review Remediation: XDG, Brmem CLI, and Text Repair

## Summary

Implemented the direct remediation slice from the two-axis review of the core-split stack:

- `thermo-council` now reuses the canonical `@sdl/capability-kit/text-repair` `prepareRepairedText` helper instead of carrying a local duplicate repair loop. Validation exposed an existing tier-policy tension (`local-pi-tool` packages cannot normally depend on Capability Kit), so this slice records an explicit debt edge rather than re-forking the helper.
- Pure XDG path resolution now lives in lower-tier `@sdl/core/xdg-path`, with `@sdl/capability-kit/xdg` delegating/re-exporting those pure helpers while retaining side-effectful private-directory creation.
- The kernel extension registry now resolves global extension roots through `@sdl/core/xdg-path` and no longer carries a local XDG data-path copy.
- The brmem CLI runner/testing helper moved from `@sdl/brmem/cli-runner` to `@sdl/capability-kit/brmem-cli` with atomic consumer repointing and no brmem compatibility shim.
- Timer docs now point concrete adapters to `@sdl/time` and manual fakes to `@sdl/time/testing`.
- The GitHub check-run fixture optional fields now use omission-style `?: string` instead of `?: string | undefined`.

This is a corrective follow-up to the prior brmem-cli placement update: the brmem package, CLI binary, state model, and domain behavior remain in `@sdl/brmem`; only the exec-derived CLI helper surface moved to Capability Kit.

## Objective Impact

This narrows the residual helper placement to match the four-bucket rule:

- Core owns only pure XDG path construction and XDG error/result types under the explicitly pure `@sdl/core/xdg-path` subpath. It does not own filesystem directory creation.
- Capability Kit owns side-effectful XDG directory creation, the brmem CLI subprocess helper surface, and the canonical text-repair loop. The thermo-council local-pi-tool dependency is explicitly allowlisted as placement debt until that tier policy is reconciled.
- Kernel can share XDG path behavior without depending on Capability Kit, preserving tier direction.
- `@sdl/brmem` no longer exposes the `./cli-runner` or `./cli-runner/testing` subpaths.

Source-search evidence after the move:

- `rg -n '@sdl/brmem/cli-runner' ts/packages ts/scripts --glob '*.ts' -S` returned no matches.
- `rg -n '"\\./cli-runner"|"\\./cli-runner/testing"' ts/packages/infra/brmem/package.json` returned no matches.
- `test ! -f ts/packages/infra/brmem/src/cli-runner.ts && test ! -f ts/packages/infra/brmem/src/cli-runner-testing.ts` passed.
- `rg -n 'function resolveSdlDataPath|bootstrap-only XDG_DATA_HOME resolver local' ts/packages/kernel/src/extension-registry.ts -S` returned no matches.
- `rg -n 'systemTimerScheduler.*@sdl/core/timers|createManualClock\\(\\).*@sdl/core/testing|createManualTimerScheduler\\(\\).*@sdl/core/testing' ts/AGENTS.md .agents/skills/sdl-typescript/SKILL.md -S` returned no matches.

Validation run during the slice:

- `pnpm --dir ts --filter @sdl/core run check`
- `pnpm --dir ts --filter @sdl/capability-kit run check`
- `pnpm --dir ts --filter @sdl/kernel run check`
- `pnpm --dir ts --filter @local-pi-tools/thermo-council run check`
- `pnpm --dir ts --filter @sdl/core run test`
- `pnpm --dir ts --filter @sdl/capability-kit run test`
- `pnpm --dir ts --filter @sdl/brmem run check`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/roaster run check`
- `pnpm --dir ts --filter @sdl/worktree-status run check`
- `pnpm --dir ts --filter @sdl/branch-context-pi run check`
- `just ts-deps-check`
- `just ts-format-check` after `just ts-format-fix`
- `just ts-lint`
- `just ts-check`
- `just ts-test`
- `just ts-test-integration`
- `just ts-test-typescript-style-guard`
- `just dprint-check`
- `just`

## Follow-Ups

- Run the broad TS validation lane before landing this branch.
- Continue to leave `@sdl/brmem` itself parked for its separate follow-up Objective; this slice intentionally did not re-tier the brmem domain package.
- Final objective cleanup still needs the broad testing aggregate split and the final core purity proof.
