# Payload cast laundering removed

## Summary

A review-follow-up PR (#1350) removed two remaining unsafe TypeScript cast patterns from the package-local payload/reference and payload-manifest paths:

- `loadOperationPayload` no longer fabricates an empty `TPayload` with `{} as TPayload` when all payload fields are supplied by reference; field-reference-only invocations now start from an explicit `Record<string, unknown>` accumulator and merge validated payload input only when a payload source is present.
- The prepare-run payload manifest parity test no longer launders a Zod-parsed value through `as unknown as Parameters<typeof buildPrepareRunPayloadManifest>[0]`; it consumes the exported `PrepareRunPayloadManifestInput` type directly.
- `PrepareRunPayloadManifestInput` now models `restructured_files` as `readonly unknown[]`, matching the loose manifest schema boundary without forcing an unsafe gateway-specific concrete type.

Evidence: local branch diff against Graphite parent `pr-address-ts/canonical-contracts`; PR #1350 corroborates the same three-file change set. Validation evidence for the implementation batch: `pnpm --dir ts run check` and `pnpm --dir ts run test` passed.

## Objective Impact

This does not change roadmap row status. It strengthens the already-completed Group 2 payload/reference consolidation and canonical-contract typing work by removing review-identified cast laundering from the TypeScript path.

The durable meaning is narrower than a new feature slice: the package-local payload spec remains complete, and this follow-up improves type honesty at the boundary between reference-backed payload resolution, manifest input typing, and parity tests.

## Follow-Ups

- Continue the remaining Group 3 structural/dedup work; do not reopen completed Group 2 rows for this follow-up.
- Preserve the package-local `loadOperationPayload` ownership decision until a second non-pr-address consumer proves a shared clinkr payload/reference seam.
