# Shared Source File Walker for Guardrail Tests

## Summary

The import-boundary and RunEngine app-contract tests now share recursive TypeScript source-file discovery through `test/support/source-files.ts`. The helper preserves the existing behavior: recursively scan from the supplied root, include `.ts` files only, and return deterministic sorted paths.

The same landed change also removed the direct mutation of the `collectLocalSpecifiers` parameter in the import-boundary test while preserving the sorted, de-duplicated local specifier result.

## Objective Impact

No roadmap row changed state. This hardens already-completed guardrails by reducing duplicated traversal logic between the import-boundary test and the app contract test, making future guardrail drift less likely while preserving the current static contracts.

Evidence: local branch diff against `pr-address-run-engine-facade-contract`; package-local TypeScript check/test passed before Objective tracking was updated. PR #1652 corroborates the same three-file test-support change.

## Follow-Ups

- Continue with the core-carve roadmap rows next; this was review-driven hardening of existing guardrails, not new production RunEngine behavior.
- Keep the shared walker limited to test support unless production code develops an independent need for source traversal.
