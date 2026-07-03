# Roadmap

## Work

- [x] Reconfirm the Branch Context → Pi edge inventory before implementation.
  - Policy: direct execution after `objective-stack-impl` preview; this is read-only and should be the first parent/subagent check.
  - Target: verify the current `@sdl/branch-context` package dependency on `@sdl/pi`, the `src/impl-command.ts` import/re-export, API/root exports, current CCC/Pi consumers, Pi command registration surfaces, and style-guard deferred-cycle references.
  - Evidence: before-change search output for `@sdl/pi`, `IMPL_BRANCH_CONTEXT_COMMAND_NAME`, and `formatImplBranchContextCommand` across `ts/packages/branch-context`, `ts/packages/ccc`, `ts/packages/hosts/pi`, and `ts/scripts/typescript-style-guard`; confirmation that there is no material implementation progress already present but unrecorded.

- [x] Move implementation slash-command ownership to Pi/CCC presentation code.
  - Policy: direct execution after preview; steer first only if preserving the current command names conflicts with the package boundary.
  - Target: `@sdl/branch-context/api` and the Branch Context package root stop exporting `IMPL_BRANCH_CONTEXT_COMMAND_NAME` and the Pi-specific `formatImplBranchContextCommand`. Pi-owned code keeps `IMPL_BRANCH_CONTEXT_COMMAND_NAME = "sdl:branch-context:impl-attached-plan"` and owns formatting for `/${command} <attached-key>` either in `@sdl/pi/commands` or a Pi branch-context-local helper. CCC cmux launch code uses presentation-owned formatting when constructing Pi launch commands. Branch Context continues to export attached-plan loading, implementation-prompt content, branch-context creation/attachment, evidence, and existing-branch reuse helpers.
  - Likely files: `ts/packages/branch-context/src/api.ts`, `ts/packages/branch-context/src/index.ts`, `ts/packages/branch-context/src/impl-command.ts` or its deletion, `ts/packages/hosts/pi/src/commands/surfaces.ts`, `ts/packages/hosts/pi/src/branch-context/from-plan-commands.ts`, `ts/packages/hosts/pi/src/branch-context/gt/upstack-impl-launch.ts`, `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts`, and their tests.
  - Evidence: targeted unit tests/assertions still prove `/sdl:branch-context:impl-attached-plan <key>` appears in usage text, follow-up flow text, replacement-session messages, and cmux Pi launch commands; Branch Context package tests no longer assert Pi command-surface ownership.

- [x] Remove the `@sdl/branch-context` → `@sdl/pi` package edge and lock it with guard evidence.
  - Policy: direct execution after preview for source/package/test changes.
  - Target: delete `@sdl/pi` from `ts/packages/branch-context/package.json`; update `ts/pnpm-lock.yaml` if needed; ensure Branch Context source/tests have no `@sdl/pi/*` imports; narrow the `ts-guard` deferred legacy cycle so Branch Context is no longer included in the autobranch/pi/sdl tolerated component.
  - Likely files: `ts/packages/branch-context/package.json`, `ts/pnpm-lock.yaml`, `ts/scripts/typescript-style-guard/config.mjs`, and `ts/scripts/typescript-style-guard/adversarial-review.mjs`.
  - Evidence: clean `rg -n "@sdl/pi" ts/packages/branch-context ts/packages/branch-context/package.json`; clean `just ts-guard`; package check/test for Branch Context; style-guard adversarial tests updated so a new Branch Context cycle is rejected rather than grandfathered.

- [x] Preserve and document the final Branch Context Capability API boundary.
  - Policy: direct execution after preview; steer first before introducing a new public SDK surface or changing saved-plan/Branch Memory compatibility language.
  - Target: `ts/packages/branch-context/CONTEXT.md` (and README if useful) records that Branch Context owns domain/API behavior, while Pi/CCC presentation code owns concrete slash-command surfaces and launch formatting. If Pi docs/context need a small note for the moved formatter, update the nearest applicable context doc. Keep `@sdl/plans/api` and saved-plan storage behavior out of scope unless directly affected by the command-surface cleanup.
  - Evidence: `ts/packages/branch-context/CONTEXT.md` now distinguishes Branch Context Capability API/domain responsibilities from the Pi/CCC presentation boundary and states why `@sdl/branch-context` must not depend on the Pi Presentation Host. `ts/packages/hosts/pi/CONTEXT.md` records the Pi-owned branch-context slash-command surface and implementation launch formatter.

- [x] Record completion and parent tracking.
  - Policy: direct execution after validation passes; use normal Objective update semantics and do not create stack ledgers or Branch Memory state.
  - Target: create a Semantic Update under this Objective with the final API/export decision, validation/stale-edge evidence, and any remaining parked work; update `sdl-extension-architecture` Phase 2 step 4/progress or an update file so the parent can treat Branch Context's de-Pi boundary as complete once the child closes or is ready to close.
  - Evidence: `updates/2026-06-27-boundary-documented.md` records final stale-edge and validation evidence; `sdl-extension-architecture` has a matching parent update and Phase 2 step-4 progress note for the Branch Context de-Pi boundary. Final parent validation passed `just ts-check`, `just ts-test`, and `just ts-guard`.

## Parked

- Reworking saved-plan storage, Branch Memory namespace/key compatibility, branch naming, slug derivation, attached-plan selection, or implementation prompt contract content.
- Re-opening the broader Branch Context + Plans API migration already completed by `branch-context-plans-extension`.
- Dynamic arbitrary Pi mirroring for Branch Context commands.
- Full autobranch/pi/sdl manifest-cycle cleanup after Branch Context is removed from the deferred component.
- Broader CCC clean-consumer conversion across remaining capabilities; this stays with the parent `sdl-extension-architecture` Objective and other child Objectives.
- PR submission, landing, external mutation, or real Branch Memory / branch-context creation validation without explicit user confirmation.
