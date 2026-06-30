# sdlcc Stack Map Zod Boundary Cleanup

## Summary

Replaced the hand-rolled JSON validation tower in `ts/packages/hosts/sdlcc/src/stack-map-model-loader.ts` with package-local Zod boundary schemas. The loader now validates the machine-output envelope, strict Graphite stack graph payload, and permissive cmux tree shape through schemas, while preserving the existing coarse user-facing diagnostics and normalization behavior.

The old branch/edge/slot parser helpers were removed, `json-fields.ts` became unused and was deleted, the previously retained-but-unread graph `edges` field is now validated at the boundary without being carried into the internal model, and focused stack-map tests now cover malformed graph payloads, top-level cmux failures, nested cmux malformed-sibling skipping, and unknown cmux surface normalization / `tab_ref` fallback.

## Objective Impact

Completes the neutral package-local `sdlcc` cleanup row. The implementation stays within the host package and does not promote package-local parsing helpers into `@sdl/core` or another shared layer. It preserves the intended distinction between strict stack graph parsing and tolerant nested cmux parsing.

Validation passed:

- `pnpm --dir ts --filter sdlcc test -- stack-map`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-deps-check`
- `just ts-test`
- `just ts-test-integration`
- `just ts-test-typescript-style-guard`
- `just dprint-check`

## Follow-Ups

- No immediate `sdlcc` follow-up is required for this row.
