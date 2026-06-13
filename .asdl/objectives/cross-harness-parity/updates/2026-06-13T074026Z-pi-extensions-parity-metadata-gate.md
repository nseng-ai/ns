# @asdl/pi-extensions parity metadata gate

## Summary

Implemented a typed parity-accounting contract for `@asdl/pi-extensions` package-owned Pi command/tool surfaces. Package registration modules now export co-located `PiSurfaceParity` metadata, `ts/packages/pi-extensions/src/parity-registry.ts` aggregates the package inventory, and `ts/packages/pi-extensions/test/parity.test.ts` registers the package modules against a fake Pi host to compare live command/tool registrations with the metadata.

The gate fails on missing exact metadata for a live package surface, stale exact metadata for a non-live surface, or duplicate exact metadata keys. It intentionally checks accounting only: it does not parse `parity-table.md`, prove semantic parity, cover ad hoc `.pi/extensions/*.ts` adapters, or enforce direct `@asdl/ccc` command surfaces unless they are exposed through `@asdl/pi-extensions`.

Validation evidence at implementation time:

- `pnpm --dir ts --filter @asdl/pi-extensions run check`
- `pnpm --dir ts --filter @asdl/pi-extensions run test` (56 package test files / 723 tests passed)
- `just ts-check`
- `just ts-test` (150 TypeScript test files / 1911 tests passed)
- `just dprint-check`
- `git diff --check`

## Objective Impact

This closes the v1 machine-checkable gate slice for `@asdl/pi-extensions`: parity accounting is now a typechecked package artifact and a Vitest gate rather than a Markdown-parsed convention. The human parity table remains the broader Objective tracker and semantic review surface.

The roadmap now distinguishes the completed package-local accounting gate from future broadening work such as CI wiring, direct CCC surfaces, ad hoc `.pi/extensions` adapters, or generated table output.

## Follow-Ups

- Decide whether to enforce the same metadata pattern for direct `@asdl/ccc` Pi command surfaces such as `/ccc:workspace:*` and `/ccc:sidebar:*`.
- Decide whether durable ad hoc `.pi/extensions/*.ts` files should migrate into engineered package modules before enforcement.
- Decide whether a future CLI or CI job should reuse `parity-check.ts` helpers.
- Keep semantic parity judgment in the Objective review process; the new gate only proves metadata accounting against live registrations.
