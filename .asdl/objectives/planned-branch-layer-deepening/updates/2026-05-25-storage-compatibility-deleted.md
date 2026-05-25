# Storage Compatibility Deleted

## Summary

- Deleted the stale direct Branch Memory `plans` storage path from the planned-branch Pi extension: `PLAN_NAMESPACE = "plans"`, `storeBrmemPlanFromFile`, `BrmemPlanStorage*` types, storage parameter parsing, success formatting, and storage-detail builders are gone.
- Deleted deprecated local plan-store archive compatibility names and options, including `archiveRoot`, `sourcePlanArchiveRoot`, `defaultPlanArchiveRoot`, `resolveSourceBranchPlanArchiveDirectory`, and `SourceBranchPlanArchiveDirectoryEvidence`.
- Renamed the active repo-key helper from `buildRepoArchiveKey` to `buildRepoPlanStoreKey` and updated tests to use plan-store vocabulary without adding compatibility coverage for removed aliases.
- Remaining planned-branch Branch Memory references are limited to the explicit `brmem-plans` attachment/read contract, recovery diagnostics, active entrypoint names, or unrelated brmem extension surfaces.
- Verification: `bun run --cwd ts check`, `bun run --cwd ts test`, `git diff --check`, and `just dprint-check` passed. Evidence: local working-tree diff on `delete-planned-branch-storage-compatibility` against Graphite parent `resolve-branch-memory-adapter-overlap-boundary`; PR evidence was not required because local branch evidence was sufficient.

## Objective Impact

- The local plan store Module is now separated from Branch Memory persistence for this workflow: `/write-plan` writes only to the local plan store, and the deleted direct-storage API can no longer imply a second Branch Memory-backed saved-plan path.
- The Branch Memory attachment seam is clearer because Branch Memory behavior remains only where the planning layer attaches or reads the canonical implementation-branch plan under namespace `brmem-plans`.
- The Objective is closer to closure, but remains open for final human agreement and any last naming decision about whether current module or entrypoint names still need a broader planned-branch rename.

## Follow-Ups

- Decide whether remaining module/path/entrypoint names such as `brmem-plans` and `create-brmem-plan-branch` are acceptable as active contract names or should be renamed before closure.
- Ask for explicit human closure once the remaining naming question is resolved.
