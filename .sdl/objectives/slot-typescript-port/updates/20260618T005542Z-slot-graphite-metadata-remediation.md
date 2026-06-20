# Slot Graphite Metadata Remediation

## Summary

Recorded the landed-state meaning of PR #1756 / branch `graphite-metadata-slot-stack-remediation` for the TypeScript `slot` port.

The branch centralizes Graphite private metadata parsing, topology walking, fork detection, trunk-marker evaluation, and schema diagnostics in the curated `@asdl/core/graphite-metadata` subpath. The slot `RealSlotGtGateway` and the ccc worktree-status / land-stack adapters now consume the shared helpers instead of carrying separate hand-rolled readers. Slot's Graphite dependency remains confined to the `slot gt` boundary.

The same remediation also removes speculative slot stack fields, factors shell/completion marker-block show/install scaffolding, hoists ordered string de-duplication, and standardizes GitHub CLI runner plumbing. These are code-quality and review-readiness changes for already-ported surfaces rather than new user-facing command coverage.

Evidence considered:

- Graphite parent: `update-typescript-shell-completion-tests`.
- Local committed diff against that parent: one remediation commit touching `ts/packages/asdl-core`, `ts/packages/ccc`, `ts/packages/slot`, and `ts/packages/roaster`.
- PR #1756, `Extract Graphite metadata helpers and unify stack/shell gateway adapters`, corroborates the same file set.
- Validation reported for the branch: package checks/tests for `asdl-core`, `ccc`, and `slot`; full TypeScript workspace check/test; package-filtered import smoke for `@asdl/core/graphite-metadata`; `just dprint-check`.

## Objective Impact

This de-risks the completed Graphite subgroup row by reducing private Graphite metadata coupling from duplicated package-local readers to one shared parser/walk module with consumer-specific adapters. It preserves the Objective boundary that plain `slot` commands do not depend on Graphite and that Graphite topology must not come from human-facing Graphite display output.

This does not complete the deferred `slot gt exec stack-map-branches` row, does not complete the OS-coupled row's required real-shell parity check, and does not advance distribution cutover or Python fallback retirement.

## Follow-Ups

- Keep `slot gt exec stack-map-branches` deferred unless a live consumer appears or a future slice explicitly revives it.
- Continue to treat Graphite's private metadata DB schema as an accepted drift risk, now guarded centrally in `@asdl/core/graphite-metadata`.
- The OS-coupled row still needs the deliberate real-shell parity check before it can be marked complete.
