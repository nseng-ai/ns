# Slot Graphite test metadata options

## Summary

Narrowed ten test-only slot Graphite gateway metadata/helper optional properties from raw optional-undefined to omission-only optional properties:

- `MetadataRow.parent_branch_name`, `children`, and `validation_result` in `test/gateways/real-gt-gateway.test.ts`
- `gatewayWithMetadata` helper options `exists` and `schema`
- `MetadataRow.parent`, `children`, and `validation` in `test/integration/real-gt-gateway.test.ts`
- `FakeDirectiveFilesystem` constructor options `existingParents` and `writeFailure`

Scorecard:

- Repo-wide typed optional-undefined property count (`rg --glob '*.ts' '\?:[^\n;=]*\| undefined' ts`): `123 -> 113`.
- Scoped typed optional-undefined property count (`ts/packages/capabilities/slot/test`): `10 -> 0`.
- Repo-wide undefined-normalization/check count (`rg --glob '*.ts' '=== undefined|!== undefined|== null|!= null' ts`): `2733 -> 2733`.
- Scoped undefined-normalization/check count (`ts/packages/capabilities/slot/test`): `11 -> 11`.

Validation:

- `pnpm --dir ts exec vitest run packages/capabilities/slot/test/gateways/real-gt-gateway.test.ts packages/capabilities/slot/test/integration/real-gt-gateway.test.ts packages/capabilities/slot/test/unit/cd-directive.test.ts` passed: 2 files, 30 tests.
- `pnpm --dir ts run check` passed.

## Objective Impact

This advances the standing cleanup loop by clearing the slot test scoped typed optional-undefined inventory. The changed shapes are test fixture/helper contracts where omission already models the default or absent row/option state; no caller needed present-key `undefined`, and construction already omits absent values. SQL metadata row `null` unions were preserved because null remains the meaningful database value for absent parent/children/validation columns.

The normalization/check metric stayed unchanged because no new omission-building adapter code was needed.

## Follow-Ups

- Continue to preserve production/public Graphite option surfaces unless a separate normalized internal boundary justifies narrowing.
- Treat test metadata rows that mirror database records as safe to narrow for explicit `undefined` only when `null` remains available for SQL null semantics.
