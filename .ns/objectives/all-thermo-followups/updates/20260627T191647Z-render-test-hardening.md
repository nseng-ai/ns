# Render Test Hardening

## Summary

Slice 3 hardened flow command scenario tests so they assert progress ordering, settled-output facts, and hosted-output plainness instead of reconstructing exact clinkr/theme frames. Submit command scenarios now verify hosted output remains plain and that the settled frame reports meaningful phase completion facts without coupling to exact glyph, spacing, or color choices.

## Objective Impact

This completes the third planned stack slice. Command behavior coverage is less brittle, while exact rendering details remain the responsibility of clinkr/theme/stream and focused phase-stream tests. The parked progress-destination policy remains parked because this slice touched assertions rather than the progress routing/API seam; the parked import-boundary enforcement note remains parked because this slice did not change clinkr boundary structure.

Validation evidence: parent verification passed `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test packages/infra/clinkr/test` and `just ts-check`.

## Follow-Ups

- Keep the progress-destination and import-boundary notes parked unless a future implementation touches those seams directly.
- PR submission remains manual; Objective closure is left for user inspection or an explicit closure/update pass after reviewing the completed stack.
