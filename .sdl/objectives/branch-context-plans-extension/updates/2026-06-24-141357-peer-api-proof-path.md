# Peer API Proof Path

## Summary

Added minimal Peer API subpaths for the branch-context/plans proof path:

- `@sdl/branch-context/api` exports only the `ccc` dispatch-plan branch-context symbols needed for branch-context creation, preview/evidence formatting, implementation-command formatting, session-artifact output, real context construction, and plan-content slug derivation.
- `@sdl/plans/api` exports saved-plan selection/directory symbols for the same dispatch-plan seam, including `resolveSelectedSavedPlanFile` as the paired saved-plan selection Peer API even though the migrated `ccc` file currently uses only latest-session selection and plan-store directory resolution.
- Existing package-root exports stayed unchanged; both new subpaths are additive package export-map entries.
- `ts/packages/ccc/src/cmux/slot-dispatch-plan.ts` now imports from `@sdl/branch-context/api` and `@sdl/plans/api` without behavior changes.

## Objective Impact

This completes the Peer API boundary/export-map target roadmap row for the first proof slice. The surface is intentionally dispatch-plan-minimum and implemented as thin `src/api.ts` re-export façades over existing modules. The slice does not narrow package roots or change saved-plan storage, Branch Memory namespace/key behavior, slug derivation, branch naming, attached-plan selection, cmux/Pi launch behavior, or command behavior.

Validation evidence:

- `pnpm --dir ts --filter @sdl/branch-context run check`
- `pnpm --dir ts --filter @sdl/plans run check`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/ccc run test` (17 files, 284 tests)

## Follow-Ups

- Next roadmap row: extract or identify gateway-injected cores for saved-plan selection and branch-context attachment workflows.
- Deferred exclusions remain: no Pi migration, no broader CCC migration, no root export narrowing, no broader API surface, no storage/slug/Branch Memory semantic changes, and no gateway-core extraction in this slice.
