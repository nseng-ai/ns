# Planned Branch Naming Finalized

## Summary

- Audited the remaining `brmem` names in the planned-branch Pi extension surface and decided to rename planning-layer module, shim, test, type, and exported function names rather than carry them to closure.
- Renamed the project-local shim and engineered TypeScript entrypoints to planned-branch vocabulary, including `.pi/extensions/planned-branch.ts`, `ts/packages/pi-extensions/src/planned-branch-extension.ts`, `ts/packages/pi-extensions/src/planned-branch/`, `test/planned-branch-extension.test.ts`, and `test/planned-branch-creation.test.ts`.
- Renamed planning-layer exported names such as `createPlannedBranchFromFile`, `CreatePlannedBranchFromFileParams`, `PlannedBranchEvidence`, `PlannedBranchExtensionOptions`, and `PlanCommandExecApi`.
- Retained `brmem-plans` as the explicit persisted Branch Memory attachment namespace and retained `brmem` names only for command discovery/execution helpers, JSON parsers, recovery diagnostics, historical Objective evidence, or unrelated Branch Memory extension surfaces.
- Verification: `bun run --cwd ts check`, `bun run --cwd ts test`, `git diff --check`, and `just dprint-check` passed for the completed naming slice.
- Evidence: local working-tree diff on `delete-planned-branch-storage-compatibility` with Graphite parent `resolve-branch-memory-adapter-overlap-boundary`; PR evidence was not required because local branch and working-tree evidence were sufficient.

## Objective Impact

- The planning-layer vocabulary and target module-shape roadmap item is complete: the main module paths and exported Interfaces now use planned-branch terminology.
- The validation roadmap item is complete for the accepted implementation slices.
- The remaining `brmem` names now identify the lower Adapter contract rather than the planning domain, so the naming risk is de-risked.
- The Objective appears ready for explicit human closure.

## Follow-Ups

- Ask for explicit human closure.
