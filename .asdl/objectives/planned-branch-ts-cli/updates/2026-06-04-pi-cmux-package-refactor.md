# Pi and cmux Package Refactor

## Summary

Refactored the Pi planned-branch extension and cmux planned-branch helpers onto the `@asdl/planned-branch` package contract:

- active Pi commands are now `/planned-branch:write-plan`, `/planned-branch:create`, and `/planned-branch:impl`;
- `@asdl/pi-extensions` depends on and imports deterministic helpers from `@asdl/planned-branch`;
- duplicate deterministic planned-branch core modules were removed from `@asdl/pi-extensions`, leaving Pi-specific slug derivation and orchestration in the Pi layer;
- cmux launch/storage paths now use the new namespaced command and `planned-branch` Branch Memory namespace; and
- tests were updated for the new command names, package imports, namespace, and local plan store path.

## Objective Impact

The Pi/cmux refactor roadmap row is complete for this slice. The final active work is to add public Claude skills and update workflow documentation/reference prose to the new package, CLI, command, namespace, and local-store contract.

Evidence: local branch diff against `planned-branch-ts-cli/package-core-cli`; `cd ts/packages/pi-extensions && bun run check && bun test` passed; `cd ts/packages/planned-branch && bun run check && bun test` passed; `just ts-check` and `just ts-test` passed.

## Follow-Ups

- Final docs/skills slice should update remaining prose references, including `ts/packages/pi-extensions/CONTEXT.md` and docs that still mention `brmem-plans`, `~/.asdl/plans/...`, `/write-plan`, `/create-planned-branch`, or `/impl-planned-branch` as active contracts.
- Confirm final stale-reference search leaves only intentional historical/transition prose.
