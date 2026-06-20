# Runtime Schema Seams

## Summary

The first managed-stack branch established the local TypeScript runtime/schema seams needed before porting full `classification-template` behavior.

The TypeScript `@asdl/pr-address` package now has a local exec operation registry with per-operation legacy fallback, a stdin injection seam for managed operation tests, JSON input-source helpers for stdin/inline/file payloads with conflict and validation errors, Clinkr-compatible machine-envelope helpers with exit-code mapping, and local Zod-backed schema emission for `classification-template --json-schema`. Unported operation behavior remains delegated to the legacy Python path.

Validation evidence:

- `pnpm --dir ts/packages/pr-address run test` passed.
- `pnpm --dir ts/packages/pr-address run check` passed.
- `pnpm --dir ts/packages/pr-address exec pr-address exec classification-template --json-schema` and `uv run --project . pr-address exec classification-template --json-schema` produced matching top-level schema structure for the smoke-probed header.

## Objective Impact

This moves the `classification-template` roadmap row to in-progress rather than complete. The runtime, input, envelope, fallback, and schema-emission seams are now implemented locally in TypeScript, but full `classification-template` output construction and golden fixture parity remain for the next branch.

The branch also confirms the grilling decision to add Zod locally in `ts/packages/pr-address` without extracting a shared runtime/schema package.

## Follow-Ups

- Port full `classification-template` behavior on top of these seams and compare against the existing golden fixtures byte-for-byte where practical.
- Reuse the registry, input, envelope, and schema helpers for `validate-feedback-classification` and `plan-feedback` after `classification-template` parity is proven.
- Keep legacy fallback active for operations whose TypeScript parity is not yet proven.
