# Address Test Helper Options Narrowing

## Summary

Narrowed the `@sdl/address` test-helper slice by removing redundant explicit `| undefined` from 27 helper-only optional properties:

- `InMemoryPrFeedbackState` in `ts/packages/address/test/support/in-memory-pr-address-gateways.ts` (16 fake seed fields).
- `ScenarioRunOptions` in `ts/packages/address/test/support/run-scenario.ts` (6 scenario runner options).
- The local `statusChecks` fixture helper in `ts/packages/address/test/unit/core-pr-checks.test.ts` (5 count fields).

Scoped candidate inventory before editing showed 23 single-line `?: ... | undefined`/`?: ...undefined` matches plus 3 multi-line optional unions ending in `| undefined`; after editing, the same scoped grep returned no matches. Remaining scoped `| undefined` occurrences are non-optional internal values/parameters (`listOpenPrsFailure` storage and `numberMap`/`stringMap` inputs), not redundant optional-property declarations.

## Objective Impact

This advances the standing cleanup loop with a coherent address test-helper cluster. The semantic claim is that these fields are fixture/test seed options or local builder fields whose consumers already normalize absence and explicit `undefined` identically via `??`, direct optional storage, or map-conversion helpers. No production `@sdl/address` CLI/context/gateway surface, public API type, external GitHub payload mirror, or `null`-carrying field was tightened.

Validation evidence:

- `pnpm --dir ts exec vitest run packages/address/test/unit/core-pr-checks.test.ts packages/address/test/scenario` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run fmt:check` passed after `pnpm --dir ts run fmt` normalized formatting.

## Follow-Ups

Continue preserving or separately classifying production address gateway/context option surfaces (`env`, dependency bags, CLI runtime options) because those remain closer to input/dependency compatibility surfaces than this test-helper-only slice.
