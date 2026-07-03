# Unified Branch Memory Envelope Parsing Implemented

## Summary

The unified Branch Memory machine-envelope parsing slice is implemented. `@asdl/planned-branch` now routes `brmem put`, `brmem list`, and `brmem get` JSON output through the shared `parseMachineEnvelopeData` helper, while preserving focused body validators for each operation's domain fields.

## Objective Impact

This completes the roadmap row, "Unified Branch Memory envelope parsing." The implementation reduces duplicated JSON/envelope handling in attached-plan loading and keeps strict, consistent failure semantics across Branch Memory operations:

- `brmem put` continues to validate planned-branch namespace, key, branch, ref, commit, and source-file fields after shared envelope parsing;
- `brmem list` now uses the same envelope parser before validating list entries and canonical namespace/branch matches;
- `brmem get` now uses the same envelope parser before validating requested namespace, branch, key, content, and ref data;
- the new parser suite exercises valid put/list/get behavior plus malformed JSON, missing or invalid `exit_code`, nonzero command envelopes, malformed `data`, and namespace/branch/key mismatches.

Evidence considered: local branch diff against Graphite parent `planned-branch-cmux-operation-model`, with changes limited to `ts/packages/planned-branch/src/attached-plan.ts`, `ts/packages/planned-branch/test/brmem-envelope-parsing.test.ts`, and this Objective update. PR #884 corroborates the same file set and completion evidence.

Verification: `cd ts/packages/planned-branch && bun test`, `just ts-check`, and `just ts-test` passed.

## Follow-Ups

Continue with the remaining hardening rows: CLI/type-contract cleanup, shared content-slug derivation, semantic gateway boundaries, and public skills/docs accuracy. The Branch Memory parsing work does not close the Objective because those rows remain active.
