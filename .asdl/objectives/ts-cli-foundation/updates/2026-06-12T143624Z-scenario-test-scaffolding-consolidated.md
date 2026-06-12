# Scenario-test scaffolding consolidated

## Summary

The final provider-owned test-scaffolding row is complete. `@asdl/core` now exposes a narrow `@asdl/core/testing` subpath for non-shell test helpers, without adding anything to the root package barrel. The subpath provides `describeNodeRuntimeCliEntrypoint` for Node-runtime CLI smoke tests and `createTempDirTracker` for explicit async temp-dir fixture cleanup.

The repeated non-pr-address node-runtime CLI tests in `@asdl/plans`, `@asdl/planned-branch`, and `asdl-dev` now declare package-specific behavior as data while preserving the same shebang, help, hidden-`exec`, and exact `--runtime` assertions. The clean async temp-dir fixtures in the `plans` and `planned-branch` scenario tests now delegate to the shared tracker while keeping local domain-specific default prefixes. No `pr-address` harness files were changed.

Evidence: local branch `consolidate-ts-cli-scenario-test-scaffolding` against Graphite parent `master`. Targeted tests passed for `@asdl/core`, `@asdl/plans`, `@asdl/planned-branch`, and `asdl-dev`; full `pnpm --dir ts run check` and `pnpm --dir ts run test` passed.

## Objective Impact

The last active roadmap row is complete. The `@asdl/core` monolith risk remains mitigated because testing helpers are isolated behind an explicit test-only subpath and the production root barrel is untouched. The remaining pr-address package-specific harness/layout work stays outside this Objective under `pr-address-typescript-port`.

With this row complete, the Objective's active provider-owned scope is done and the record is closed as completed. Remaining envelope/raw-exit and TS-native machine-envelope redesign items are intentionally parked umbrella migration debt, not active work for this record.

## Follow-Ups

- Route future `pr-address` test-harness consolidation through `pr-address-typescript-port` unless a second non-pr-address consumer proves a reusable foundation seam.
- Keep `@asdl/core/testing` narrow; if future helpers introduce heavier test dependencies or broader lifecycle policy, revisit the subpath-vs-sibling-package decision before expanding it.
