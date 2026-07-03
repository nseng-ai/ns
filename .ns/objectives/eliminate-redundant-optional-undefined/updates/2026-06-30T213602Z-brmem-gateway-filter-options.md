# brmem Gateway Filter Options

## Summary

Narrowed the brmem gateway filter/address option bags to omission-only optional fields across the gateway seam, fake gateway, and real git gateway:

- `BrmemReadGateway.listEntries`: `key` and `branch`
- `BrmemReadGateway.getEntry` / `checkEntry`: `at`
- `BrmemGateway.listAllEntries`: `key` and `branch`
- `BrmemGateway.copyEntries`: `keyGlob`
- `BrmemGateway.listSnapshots`: `namespace`
- matching fake/real implementation method and helper option shapes, including internal `destSha` / `expectedOldSha` copy/update helpers

Construction sites that previously forwarded present-key `undefined` now omit optional keys with `optionalEntry` or conditional spread. The remaining brmem real-git command helper `env` / `stdin` option shape was preserved because process environment and command input surfaces are outside this filter-address cleanup.

Scorecard:

| Scope                                                      | Metric                                       | Before | After |
| ---------------------------------------------------------- | -------------------------------------------- | -----: | ----: |
| `ts`                                                       | Raw optional-undefined properties (net debt) |    145 |   115 |
| `ts`                                                       | Undefined-normalization/check lines          |   2357 |  2365 |
| `ts/packages/infra/brmem/src ts/packages/infra/brmem/test` | Raw optional-undefined properties (net debt) |     42 |    12 |
| `ts/packages/infra/brmem/src ts/packages/infra/brmem/test` | Undefined-normalization/check lines          |     98 |   106 |

## Objective Impact

This removes redundant explicit `undefined` from a coherent brmem gateway filter cluster where present-key `undefined` had no domain meaning: every narrowed field already behaved as an omitted filter, snapshot selector, glob, or optional compare SHA. The scoped raw optional-undefined count dropped by 30 while runtime behavior stayed omission-equivalent through construction normalization.

The undefined-normalization/check count rose by 8 because the slice normalized producers before narrowing the gateway contracts, which matches the Objective's metric policy for temporary boundary-building code.

Validation:

- `pnpm --dir ts run fmt:check` passed after `pnpm --dir ts run fmt` fixed formatter output.
- `pnpm --dir ts run lint` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts exec vitest run packages/infra/brmem/test packages/handoff/test` passed (25 files, 151 tests).

## Follow-Ups

- Continue preserving command/process option surfaces such as env maps unless a separate normalized internal contract justifies narrowing.
- Future brmem cleanup can classify the remaining scoped raw candidates separately; this slice deliberately did not widen into process/command input semantics.
