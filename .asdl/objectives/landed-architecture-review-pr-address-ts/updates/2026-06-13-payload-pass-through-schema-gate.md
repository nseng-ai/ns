# Payload Store, Pass-Through Deletion, and Schema Gate Resolution

## Summary

The remaining implementation slice is complete. `payload-store.ts` now owns the payload store/factory contract, node-backed behavior, in-memory fake behavior, JSON artifact lookup/pointer resolution, and payload manifest builders. `PrAddressContext` carries a high-level payload store factory; production uses the node factory and tests can inject the in-memory factory through scenario support. `payload-lookup.ts` and `payload-manifest.ts` are deleted.

The shallow pass-through modules `array-values.ts`, `operation-support.ts`, `string-values.ts`, and `reply-formatting.ts` are deleted. Their behavior moved into owning operation/domain modules or into `exec-operation.ts` where the concept belongs to exec command handling. Existing golden tests continue to cover byte-sensitive Python-like string/reply formatting.

The schema-collapse row is resolved as still gated rather than forced: `@asdl/pr-address` operation specs currently have no clinkr `resultSchema` coverage, so derived documents would produce empty output schemas and fail parity against the existing fixtures. The pinned `operation-schemas/` mirror remains intentionally in place until result schemas can be added and derived parity passes.

Verification: full `pnpm --dir ts run check` passed; full `pnpm --dir ts run test` passed; `git diff --check` passed.

## Objective Impact

Marks the payload-store seam row and pass-through absorption row complete. Marks the schema-collapse row complete as an explicit gate resolution: no schema surface change was landed, and the remaining mirror is intentional rather than forgotten work.

With all non-parked roadmap rows complete or explicitly resolved, the Objective is closed with the schema mirror retained as a future-gated cleanup.

## Follow-Ups

- Future schema work should add operation `resultSchema` coverage and compare clinkr-derived documents against the existing parity fixtures before deleting `operation-schemas/`.
- Keep real node-fs payload tests for filesystem-specific semantics; use the in-memory payload factory for future semantic payload scenarios where practical.
