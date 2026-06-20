# Compact stdout default branch needs validation

## Summary

The compact-output slice has a concrete implementation branch, but it is not yet complete because the TypeScript gate is failing.

Implemented on branch `compact-default-stdout-pr-address-exec-helpers` against Graphite parent `pr-address-session-resolved-lifecycle-artifacts`:

- shared compact-output infrastructure in `ts/packages/pr-address/src/stdout-mode.ts`;
- `--stdout-mode compact|full` extended across collection, planning, mutation, stack, payload, and summary helpers;
- compact output made the default while preserving full results through payload-session artifacts;
- generated operation schemas and `skills/pr-address/references/cli-collection.md`, `cli-planning.md`, and `cli-reference.md` updated for the compact stdout contract.

Evidence considered: local branch commit `7d293759b`, local diff against Graphite parent `pr-address-session-resolved-lifecycle-artifacts`, and PR #1567 (`Default pr-address exec helpers to compact stdout`). The GitHub checks for PR #1567 show most gates passing, but the `typescript` check is failing. The failure log points at tests and schema guards that still expect old/full inline shapes or old option-choice ordering, plus stack/summarize/schema drift around the new compact result shapes.

## Objective Impact

The roadmap row "Make compact stdout the default across all exec helpers" moves from not-started to in-progress. The code and docs now embody the target contract, but the Objective should not treat the row as complete until the TypeScript validation drift is fixed and the TypeScript gate passes under the compact-default behavior.

The compact-output risk remains active: the implementation changes the observable stdout contract broadly, and the failing tests show that scenario fixtures and schema guards still need to be reconciled with the new compact digests and artifact-backed full outputs.

The Objective remains open. Remaining work still includes stack build/lifecycle parity, complete removal of remaining composed-payload compatibility paths, full skill rewrite, and end-to-end single-PR plus stack runs with zero ad hoc glue.

## Follow-Ups

- Fix the PR #1567 TypeScript failures by updating the affected stack, summarize-feedback, and schema-drift expectations or code paths to the intended compact-output contract.
- Rerun the TypeScript gate after the fix and update this Objective when compact stdout is validated.
- Keep the full skill rewrite separate from the narrower compact-output CLI-reference updates already present on the branch.
