# TypeScript style codifies subpath-export convention

## Summary

The TypeScript style guide now records the package-surface convention proven by the `asdl-dev` public-surface work. Internal package export maps are the deliberate public surface; cross-package consumers should import declared entries rather than `pkg/src/*` private paths. Multi-module packages should prefer explicit grep-able subpaths such as `@org/workflows/checkpoint-flow`, while wildcard export-map entries and root-only catchall barrels are discouraged as default public-surface patterns. Small curated root entries remain acceptable for genuine package-level primitives, and any remaining barrel should use named exports plus `export type {}`.

Evidence: Graphite parent `asdl-dev-public-surface-package-exports`; PR #1318 modifies only `skills/typescript-style/core-rules.md` and `skills/typescript-style/checklist.md` to codify this guidance.

## Objective Impact

The `asdl-dev` public-surface row is now aligned with its completed durable meaning: the package-boundary change landed as explicit subpath exports, and the repo-local TypeScript style guide preserves the same greppability rule for future agent and contributor work.

This partially mitigates the package-boundary drift risk, but it does not add enforcement. Mechanical lint or dependency-boundary checks remain optional future work.

## Follow-Ups

- Continue the remaining provider-owned row for reusable non-`pr-address` scenario-test scaffolding.
- Consider mechanical enforcement only if future work shows documentation alone is insufficient to prevent cross-package `src/*` imports, wildcard export maps, or root-only catchall barrels.
