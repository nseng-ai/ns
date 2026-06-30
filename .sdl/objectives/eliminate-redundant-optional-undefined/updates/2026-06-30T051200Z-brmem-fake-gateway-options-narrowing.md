# Brmem Fake Gateway Options Narrowing

## Summary

Narrowed a cohesive `@sdl/brmem` fake-gateway helper cluster from explicit-undefined optional properties to omission-only optional properties in `ts/packages/infra/brmem/src/fake-gateway.ts`.

Scoped single-line inventory:

```bash
rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/infra/brmem/src/fake-gateway.ts
```

Before editing, the scoped inventory found 15 candidates. After editing, it finds 7 candidates.

Changed omission-only fields:

- `FakeEntrySeed.headSha`, `headDate`, `blobSha`, and `updatedAt`.
- `FakeBrmemGatewayOptions.currentBranch`, `entries`, `remotes`, and `operationErrors`.
- Private helper shapes for `resolveSnapshot(...).at` and `collectEntries(...).namespace`, `key`, and `branch`.

Public `BrmemGateway` method option shapes remain intentionally loose where they mirror the real gateway contract. Forwarding into narrowed private helpers now omits absent `key`, `branch`, and `at` values with conditional spreads / `snapshotLookup` normalization.

## Objective Impact

This advances the standing optional-undefined cleanup loop with a package-local fake/test-support slice. The semantic claim is that present-key `undefined` has no domain, compatibility, input, or external-conformance meaning for these fake seed/options and private helper shapes: constructors and helper methods already treat absence through defaults, optional checks, or generated fake values.

Preserved/deferred categories:

- Public `BrmemGateway` method parameter surfaces in `fake-gateway.ts` remain loose to satisfy the gateway contract.
- The new `snapshotLookup` normalization helper accepts the public loose `at?: string | undefined` input and returns an omission-only internal shape.
- Real Brmem gateway contracts, operation request surfaces, source-reader/dependency options, and environment-like value maps outside this file were not tightened in this slice.

Validation passed:

- `pnpm --dir ts --filter @sdl/brmem run check`
- `pnpm --dir ts --filter @sdl/brmem test`
- `pnpm --dir ts run fmt:check` after `pnpm --dir ts run fmt`
- `pnpm --dir ts run check`
- `pnpm --dir ts run lint`

## Follow-Ups

Continue treating fake-builder/helper option bags as good omission-only candidates when construction evidence shows defaults are omission-based. Preserve real gateway contracts and operation input/dependency surfaces unless a future slice introduces a normalized internal boundary or stronger compatibility analysis.
