# Usage-Error Schema Composition Reconciled

## Summary

Clinkr's generated machine schema now describes the complete runtime usage-error surface instead of treating `usageErrorSchema` as the sole source of usage data. Command-handler usage data remains governed and runtime-validated by the command's optional schema, while Clinkr-owned Commander failures publish `{ commanderCode }` and request-validation failures publish `{ issues }` as exact internal alternatives. An omitted command usage schema still permits a bodyless handler usage error; it no longer hides framework-owned data-bearing outcomes from `--json-schema`.

Clinkr now exports `confirmationUsageErrorDataSchema` alongside the schema-derived `ConfirmationUsageErrorData` type. Brmem delete adopts that reusable contract for its non-interactive confirmation error. Focused package checks/tests and repository TypeScript format, lint, typecheck, default-test, integration-test, and style-guard gates passed; the lint run reported only pre-existing warnings outside this slice.

## Objective Impact

This corrects the outcome-model reconciliation contract and removes a schema/runtime mismatch discovered through the Brmem caller migration. The README draft and current Objective narrative now distinguish command-owned handler data from framework-owned parser/request-validation data without adding a status, changing exit codes, or weakening handler outcome validation. The broader reconciliation roadmap remains open.

## Follow-Ups

- Audit other confirmation-helper consumers separately before replacing their command-specific usage schemas; this slice intentionally migrated only Brmem delete.
- Continue the remaining clean-cut Clinkr reconciliation and README promotion work already tracked by the roadmap.
