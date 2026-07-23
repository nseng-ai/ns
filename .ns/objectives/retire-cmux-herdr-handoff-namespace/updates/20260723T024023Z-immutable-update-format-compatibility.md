# Immutable Semantic Update Format Compatibility

## Summary

Added the generic `ns objective check <slug> --skip-update-format-checks` option. It omits Semantic Update title and required-heading checks only when explicitly requested, while preserving update inventory and readability checks. Repository agent guidance limits use to otherwise-failing immutable updates timestamped at or before the inclusive `20260719T181812Z` cutoff; later updates and newly authored updates remain subject to the current format contract.

The historical update `20260719T181812Z-reference-based-herdr-handoff-launch.md` was preserved byte-for-byte.

## Objective Impact

This removes the Objective's sole closure blocker without embedding ns repository identity, this Objective slug, or a timestamp classifier in the published Objectives capability. Focused tests cover strict default behavior, explicit format omission, retained readability failures, and rejection with `--all`. Package typecheck/tests, TypeScript formatting/lint/style guard, the per-record compatibility check, the edge sweep, and repository `just` pass.

## Follow-Ups

None for this Objective. The compatibility option is not permission to omit required structure from future Semantic Updates.
