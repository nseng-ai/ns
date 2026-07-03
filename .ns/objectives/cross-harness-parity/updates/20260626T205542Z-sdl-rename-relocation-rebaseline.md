# Workspace rename + relocation rebaseline (sixth parity-rot materialization)

## Summary

Trunk-explicit refresh against current `master`/HEAD ground truth found that the entire TypeScript workspace was renamed and relocated since this record was last authored, while the Objective prose still used the old names. Decisive verified evidence:

- npm scope `@asdl/*` → `@sdl/*` across all `ts/packages/*/package.json` (no `@asdl/`, `asdl`, or `asdl-dev` remain in package bins).
- Model env vars `ASDL_*` → `SDL_*` (`SDL_SLUG_MODEL`, `SDL_CCC_SIDEBAR_MODEL`, `SDL_DEV_CHECKPOINT_MODEL`, plus the broader `SDL_*_MODEL` family; `PI_DRAFT_MODEL` unchanged).
- Pi host package `pi-extensions` → `@sdl/pi` at `ts/packages/hosts/pi/`. The parity gate relocated: `ts/packages/hosts/pi/src/parity/{check,extension,registry}.ts` and `ts/packages/hosts/pi/test/parity.test.ts` (was `ts/packages/pi-extensions/src/parity.ts` + `parity-registry.ts` + `test/parity.test.ts`). The CLI→Pi bridge test is at `ts/packages/hosts/pi/test/cli-command-extension.test.ts`.
- `@sdl/core` → `ts/packages/infra/core/`; `@sdl/clinkr` → `ts/packages/infra/clinkr/`.
- Autobranch core extracted to a standalone `@sdl/autobranch` package (`ts/packages/autobranch/`), with checkpoint/flow still in `ts/packages/ccc/src/autobranch/`; reachable via the hidden `ccc exec autobranch` bin (`ts/packages/ccc/src/cli.ts`, `ClinkrGroup` `isHidden: true`) and the `code-autobranch` skill.
- Model-defaults/model-slug seam moved from `@asdl/plans` to `@sdl/core` (`ts/packages/infra/core/src/model-slug.ts`, `test/model-defaults.test.ts`).
- New harness-neutral `@sdl/capability-kit` (`ts/packages/sdl-capability-kit/`) and `ts/packages/capabilities/` (flow, slot) introduced; CCC is mid-migration onto them (per recent trunk commit "...partial CCC migration").
- Skill drift: `from-plan` → `branch-context-from-plan`; `dev-preview-url`, `sdl-submit`, and `objective-current` are no longer present under `skills/` (rename/fold vs regression not cheaply determinable — flagged for full sweep).

Verified still-true: `@sdl/ccc` carries `land.ts` + `land-stack/` (no land bin/skill → `/code:land` stays PARTIAL); cmux dispatch orchestration is extracted into `ts/packages/ccc/src/cmux/` (dispatch-from-trunk, dispatch-prompt, slot-dispatch-plan, slot-open-branch) but has no bin/skill → dispatch rows stay NONE; `code-workflows` skill with the `parity-review` route exists (`skills/code-workflows/references/parity-review.md`).

## Objective Impact

This is the **sixth** parity-table-rot materialization. Rebaselined `objective.md` (thesis, scope, completion criteria, assumptions, risks, open questions) and `roadmap.md` to the verified `@sdl/*` names, relocations, and the standalone `@sdl/autobranch` package; recorded the autobranch push-down row as done and added a roadmap row to reconcile the parity table. Added a STALE banner and corrected the machine-checkable header paths in `parity-table.md`; the table's per-row binary/skill/package names were NOT re-verdicted in this trunk rebaseline (that is the parity-review full-sweep's job per this Objective's governance). The CI-parity-gate promotion trigger has now fired a second time (fifth and sixth materializations). The Capability Kit migration is added as a new "shared TS ≠ shared CLI" risk instance and an open question about the future push-down substrate.

Provenance: objective-refresh basis target=HEAD from=34317d617

## Follow-Ups

- Run a parity-review full sweep to reconcile every `parity-table.md` row with `@sdl/*` naming and re-confirm verdicts, including re-verifying the now-missing `dev-preview-url` / `sdl-submit` / `objective-current` skill rows.
- Decide whether to promote the parked machine-checkable CI parity gate to active work (trigger fired twice).
- Resolve whether land/dispatch push-down lands as ccc subcommands or as Capability Kit capabilities.
