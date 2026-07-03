# Roaster Fake Context Options Narrowing

## Summary

Narrowed `FakeRoasterContextOptions` in `ts/packages/roaster/test/support/fake-roaster-context.ts` from explicit-undefined optional properties to omission-only optional properties.

Scoped Roaster test inventory:

- Before: 15 `?: ... | undefined` candidates under `ts/packages/roaster/test`.
- After: 5 candidates remain under `ts/packages/roaster/test`.

Changed fields:

- `execApi`, `gitGateway`, `localDiff`, `reviewCatalog`, `reviewLog`, `github`, `reviewRunner`
- `cwd`, `env`, `signal`
- `stdin`, `stdout`, `stderr`

Semantic claim: this is a test-support fake context override bag. The helper defaults every omitted dependency/value with `??` or intentionally omits `signal` via object spread when absent; explicit present-key `undefined` has no separate test, domain, external payload, or compatibility meaning for these fields.

Validation:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts --filter @sdl/roaster test` passed (22 files, 223 tests).

## Objective Impact

This advances the standing cleanup loop with a coherent Roaster test-helper slice and removes 10 scoped candidates without touching production Roaster API, runtime, gateway, environment, or signal surfaces.

Reusable classification findings:

- Safe: test-only fake context override bags whose construction path substitutes defaults with nullish coalescing and spreads optional fields only when present can use omission-only optional properties.
- Deferred: Roaster gateway-test callback `options?: ExecOptions | undefined` signatures remain because they may mirror command-runner contracts.
- Deferred: Roaster API test request shapes (`localOnly`, `stdin`) remain because they exercise API/input behavior rather than fake-context construction.

## Follow-Ups

Continue choosing coherent package/subsystem clusters. Production Roaster options and API/input surfaces should remain out of scope unless a later slice first establishes a normalized internal boundary or a clear semantic claim for narrowing.
