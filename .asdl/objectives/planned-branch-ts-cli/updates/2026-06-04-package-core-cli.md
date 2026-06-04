# Package Core CLI Slice

## Summary

Implemented the first planned stack slice by adding a publishable TypeScript workspace package, `@asdl/planned-branch`, with bin `planned-branch` and hidden `planned-branch exec` operations for:

- writing saved plan files;
- resolving explicit or latest source-branch plan files;
- creating planned branches and attaching plans through Branch Memory; and
- loading an attached plan with a rendered implementation prompt.

The package uses the new `planned-branch` Branch Memory namespace and the `~/.asdl/planned-branch/plans/...` local saved-plan store path, and it does not import Pi SDK/model code.

## Objective Impact

The package/core/CLI roadmap row is complete for this slice. The remaining active work is to refactor Pi/cmux surfaces onto the new package contract, then add public Claude skills and update workflow documentation.

Evidence: local branch diff against `add-planned-branch-ts-cli-package`; `cd ts/packages/planned-branch && bun run check && bun test` passed; `just ts-check` and `just ts-test` passed.

## Follow-Ups

- Refactor `@asdl/pi-extensions` and cmux planned-branch surfaces to import/use `@asdl/planned-branch` and the namespaced command/storage contract.
- Keep the final validation slice responsible for stale-reference cleanup across docs, skills, prompts, tests, and status renderers.
