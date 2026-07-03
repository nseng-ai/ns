# Objective JSON Debt Burned Down

## Summary

PR #1726 / commit `dc225c5de` burned down the Objective-local JSON compatibility debt that was accepted during the TypeScript Objective cutover.

The follow-up changed `objective` machine output from Python-parity/snake_case compatibility projection to TS-native camelCase data emitted through canonical Clinkr result schemas:

- deleted `ts/packages/objective/src/operations/legacy-machine.ts`;
- removed Objective `legacyMachine` hooks from `ts/packages/objective/src/cli.ts`;
- renamed Objective-owned JSON keys to camelCase while preserving snake_case enum/error values such as `missing_slug`, `destination_exists`, and `missing_session_file`;
- promoted `hasOutstandingChanges` into `objective list --format json` data;
- made `objective exec read-objective --format json` include ok-result Markdown bodies under `markdownFiles` while non-ok variants omit that field;
- updated Pi/CCC parser fixtures and `ccc-available-work` skill prose to consume `updatedBranches` and the other camelCase fields.

Verification evidence: `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `just dprint-check` passed before the branch was checkpointed and submitted as PR #1726.

## Objective Impact

The umbrella Objective no longer needs to carry Objective-local legacy machine-output projection as live migration debt. `migration-debt.md` now marks that entry killed, the Objective migration ledger now describes Objective as TS-native/camelCase for JSON output, and the porting playbook now records the lesson that short-lived compatibility projections should be removed promptly once current consumers are migrated.

This does not complete the umbrella migration: remaining active capability work still includes the default next capability sequence beginning with `asdl-dispatcher`, and broader Clinkr/end-of-migration debt remains open.

## Follow-Ups

- Continue the default capability sequence with `asdl-dispatcher` planning/implementation when selected.
- Keep burning down remaining migration-debt entries before closing the umbrella TypeScript migration Objective.
- Restart long-lived Pi sessions after this PR lands so in-memory Objective list parsers do not retain the old snake_case contract.
