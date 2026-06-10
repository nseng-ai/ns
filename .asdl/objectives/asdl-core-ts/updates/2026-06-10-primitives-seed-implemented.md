# Primitive-only `@asdl/core` seed implemented

## Summary

The first implementation slice of the foundation package has landed as a deliberately narrow primitive seed:

- `ts/packages/asdl-core` now exists as package `@asdl/core` with curated root exports and a `./primitives` subpath export.
- `@asdl/core/primitives` owns the shared `isRecord` and `formatErrorMessage` helpers.
- `@asdl/plans` and `@asdl/planned-branch` depend on `@asdl/core` and import those helpers from `@asdl/core/primitives`.
- The duplicate package-local primitive files in `plans` and `planned-branch` were removed rather than retained as shims.

Validation evidence: targeted checks/tests for `asdl-core`, `plans`, and `planned-branch` pass, and the full TS test suite passes. Full TS check is currently blocked in untouched `@asdl/pr-address` test code (`outsideCheckout` vs `isOutsideCheckout`), not by the primitive extraction.

## Objective Impact

The seeding roadmap row is now marked `[~]` instead of complete. This branch proves the workspace/package/export mechanics and removes the byte-identical primitive duplication, but it intentionally does **not** move CLI entrypoint detection, `ParseResult`, `parseFlagValue`, or `parseFormat`.

Those CLI helpers should remain tracked with the CLI scaffolding work, not retroactively folded into this primitive-only branch. `brmem-cli.ts` also remains deferred behind the exec-runtime row per the earlier slicing decision.

## Follow-Ups

- Complete the CLI scaffolding row by moving entrypoint detection and argv parsing helpers into `@asdl/core` when that broader CLI layer is ready.
- Resolve or separately track the unrelated `@asdl/pr-address` type-check failure so full `pnpm --dir ts run check` can return green.
