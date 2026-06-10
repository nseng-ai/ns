# Payload Finalize Helper Parity

## Summary

The payload/finalization branch ported a set of non-GitHub-mutating helpers into `ts/packages/pr-address` with existing golden fixture parity.

TypeScript now directly handles these safe CLI operations:

- `build-resolve-thread-batch-payload`
- `read-feedback-detail`
- `finalize-run`

TypeScript also has fixture-proven pure helpers for payload manifest construction and batch checkpoint calculation:

- get-feedback payload manifest construction
- prepare-run payload manifest construction
- record-batch-checkpoint result calculation

Validation evidence:

- `pnpm --dir ts/packages/pr-address run test` passed with payload/finalization golden parity coverage included.
- `pnpm --dir ts/packages/pr-address run check` passed.
- The parent review tightened raw payload JSON parsing to parse through `unknown` and validate JSON-value shape before detail lookup.

## Objective Impact

This moves the payload/detail/finalization roadmap row to in-progress. It proves several fixture-driven, non-GitHub-mutating helpers in TypeScript, but does not complete the full row because some public CLI operations still depend on artifact-writing or stack-wide contracts.

The following remain intentionally fallback-backed for now:

- `record-batch-checkpoint` as a public CLI operation, because Python currently writes checkpoint artifacts and sets `checkpoint_reference`.
- `read-feedback-details`, because the multi-detail artifact contract is not yet ported.
- `build-stack-resolve-thread-payloads` and stack plan/diff helpers, because they depend on stack-wide artifact or GitHub/Graphite-backed behavior.
- `--json-schema` for newly managed payload/finalization operations, to preserve legacy schema output until schema parity is explicitly handled.

## Follow-Ups

- Port the payload-store/artifact-writing contracts before registering checkpoint and multi-detail operations as TypeScript-managed.
- Keep stack-wide helpers for the read-only stack branch unless they prove to be pure fixture transformations.
- Continue to preserve legacy fallback for unproven operations rather than deleting broad Python paths.
