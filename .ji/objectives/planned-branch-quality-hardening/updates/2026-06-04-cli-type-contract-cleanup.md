# CLI Type-Contract Cleanup Implemented

## Summary

The planned-branch CLI/type-contract cleanup slice is implemented. `@asdl/planned-branch` now models resolve-plan evidence as explicit discriminated variants and returns expected CLI flag-value parse failures as parser errors instead of throwing through the missing-value helper.

## Objective Impact

This completes the roadmap row, "CLI and type-contract cleanup." The implementation keeps the planned-branch CLI's existing human and JSON output behavior stable while making the core contracts more honest:

- explicit and latest `resolve-plan` evidence are represented as distinct `source` variants rather than one optional-field bag;
- `resolvePlanJson` switches on the evidence variant, so latest-only fields are required by type when serializing latest plan evidence;
- `formatResolvePlanEvidence` no longer casts latest evidence to `LatestSourceBranchPlanFileEvidence`;
- expected missing-value parse failures now return `ValueParseResult` errors through `parseFlagValue` instead of throwing through `requireValue`;
- scenario tests cover missing flag values and malformed arguments in both human and JSON modes and assert no command gateway calls occur for those parse failures.

Evidence considered: working-tree diff on `planned-branch-cli-type-contract-cleanup` against Graphite parent `unify-branch-memory-envelope-parsing`, with changes limited to `ts/packages/planned-branch/src/cli.ts`, `ts/packages/planned-branch/test/scenario/cli.test.ts`, and this Objective update. The branch had not been submitted when this update was written, so PR evidence was unavailable and not required.

Verification: `cd ts/packages/planned-branch && bun test`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue with the remaining hardening rows: shared content-slug derivation, semantic gateway boundaries, and public skills/docs accuracy. This slice does not close the Objective because those rows remain active.
