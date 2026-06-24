# Semantic Update: Flow-only modules relocated into `@sdl/flow`, ending their internal-migration-export seam

## Summary

Five command-author modules that were consumed **only** by the flow group — and never imported internally by `@sdl/sdl` once the dead `default-commands/changes.ts` orphan is removed — were physically relocated out of `@sdl/sdl` into the standalone `@sdl/flow` package under `ts/packages/flow/src/shared/`:

- `changes-model-summary.ts`, `checkpoint.ts`, `pr-description.ts`, `submit.ts` (previously `@sdl/sdl/src/*.ts`)
- `command-runner.ts` (previously `@sdl/sdl/src/default-commands/command-runner.ts`; only ever imported by `submit.ts` + `pr-description.ts`, never exported)

The flow-only `selectSubmitFailureModelRef` selector was **inlined** into `ts/packages/flow/src/shared/submit-model.ts` rather than moved, because its siblings (`selectCheckpointModelRef`, `selectChangesModelRef`) in the genuinely shared `sdk/text-generation.ts` are still used by `ccc`/`sdl`. The original copy in `@sdl/sdl/src/sdk/text-generation.ts` is now dead and flagged for a follow-up deletion.

After relocation, the moved modules reach back into `@sdl/sdl`'s genuinely shared seams via the existing `@sdl/sdl/*` subpaths (`checkpoint-flow`, `pending-worktree`, `text-generation`, `sdk`) and into `@sdl/core`/`@sdl/graphite` via deep subpaths.

Mechanics that landed with the move:

- `@sdl/sdl` `package.json` dropped 4 `exports` and 4 `sdl.internalMigrationExports` entries (`./checkpoint`, `./changes-model-summary`, `./pr-description`, `./submit`). The shared seams keep their subpath exports.
- The jiti module-loader (`@sdl/sdl/src/sdk/module-loader.ts`) dropped those 4 `INTERNAL_MIGRATION_MODULE_PATHS` entries and gained explicit aliases for the deep subpaths the relocated files import (`@sdl/core/git`, `@sdl/core/submit`, `@sdl/core/text-normalization`, and `@sdl/graphite/submit` via a new `GRAPHITE_SRC_DIR`), keeping jiti resolution explicit rather than relying on native node fallback from flow's directory.
- `@sdl/flow` `package.json` gained `@sdl/graphite: workspace:*` (required by the relocated `submit.ts`). `@sdl/sdl` still does **not** depend on `@sdl/flow`; the dependency direction is preserved.

## Objective Impact

This **supersedes the "keep behind internal-migration-export subpaths" disposition for these specific flow-only modules** — the decision recorded in the flow shared-code consolidation track (`updates/2026-06-23-flow-shared-code-track.md`) and Scope/Assumptions. It does **not** change the disposition for genuinely shared code: `@sdl/core/submit`, `@sdl/graphite/submit`, and the shared `@sdl/sdl` seams remain where they are, and no new `@sdl/sdl/sdk` author API was promoted.

Concretely, this reshapes the still-open consolidation-track rows:

- **A3 (GitHub-PR access seam):** the planned `@sdl/sdl/github-pr` internal-migration-export subpath is no longer the mechanism for flow. Flow's gh-PR access now lives inside `@sdl/flow` (`shared/pr-description.ts`, `shared/submit.ts`) importing `RealGithubPrGateway` directly from `@sdl/core/submit`.
- **A4 (PR-description consolidation):** the planned "widen the `@sdl/sdl/pr-description` subpath" is superseded — that subpath was **removed** and `pr-description.ts` relocated into `@sdl/flow`, which now owns flow's PR-description adapter directly over `@sdl/core/submit`.
- **Submit-bundle rewrite row:** the runtime submit wrapper (`createSdlSubmitRuntime`/`runSubmitCommand` re-export) now lives in `@sdl/flow` (`shared/submit.ts`) delegating to `@sdl/core/submit` + `@sdl/graphite/submit`, rather than in an `@sdl/sdl` migration-export module.

The maturity-ladder framing still holds for genuinely shared areas; for flow-**only** adapter code the accepted ceiling is now "owned by `@sdl/flow`," not "internal-export from `@sdl/sdl`."

## Verification

- `just ts-check` (tsgo) — green; types resolve across the move including flow's new `@sdl/sdl/*`, `@sdl/core/*`, and `@sdl/graphite` imports and the removed sdl exports.
- `just ts-test` — 3237 tests / 317 files pass, including the decisive `sdl` scenario/integration CLI tests (`submit-cli`, `regenerate-pr-cli`, `changes-cli`, `cp-cli`, `flow-extension-cli`) and flow scenario tests (`submit-command`, `cp-command`) that load the relocated modules through jiti end-to-end — proving the alias rewiring and `@sdl/core`/`@sdl/graphite` resolution work.
- Full `just` — syncpack `deps:check` confirms `@sdl/graphite` pinned `workspace:*`; style guard, oxfmt, oxlint all green.

Evidence base: working-tree changes on `relocate-flow-only-modules` (branch currently at `master`; `gt parent` = `master`); no separate PR required for this update. Landed-state authoring assumes these working-tree changes merge to trunk.

## Follow-Ups

- Delete the now-dead `selectSubmitFailureModelRef` (and its private `SUBMIT_FAILURE_MODEL_ENV` / `DEFAULT_SUBMIT_FAILURE_MODEL_REF` constants if unused) from `@sdl/sdl/src/sdk/text-generation.ts`.
- When A2/A3/A4 are next picked up, scope them to the modules that are **still** genuinely shared or still in `@sdl/sdl`; the flow-only pr-description/submit/checkpoint adapters are already resolved by this relocation.
