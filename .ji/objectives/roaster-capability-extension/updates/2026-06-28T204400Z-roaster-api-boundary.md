# Roaster API Boundary Implemented

## Summary

Implemented the initial curated `@sdl/roaster/api` Capability API boundary as a narrow, additive client facade.

## Evidence

- `ts/packages/roaster/src/api.ts` now exports `createRoasterClient(...)`, `RoasterClient`/result types, gateway-injected runtime types, stable review list/log/skill-list request/result types, review execution request/outcome/progress types, review DTOs, Roaster failure/result types, and `ROASTER_REVIEW_LOG_NAMESPACE`.
- `ts/packages/roaster/package.json` now exposes the additive subpath export `"./api": "./src/api.ts"` while preserving the package root, `./skill-reviews`, and the standalone `roaster` binary.
- The API shape is intentionally narrower than `src/index.ts`: it does not re-export CLI renderers, prompt assembly/resources, real/fake adapter classes, raw command wrappers, or GitHub publication helpers.
- `ts/packages/roaster/test/unit/api.test.ts` imports from `@sdl/roaster/api` and exercises the facade with fake gateways for review listing, review-log listing, review execution/log writes, and command-faced failure mapping.

## Validation

- `pnpm --dir ts --filter @sdl/roaster test` — passed, 25 files / 247 tests.
- `pnpm --dir ts --filter @sdl/roaster run check` — passed.
- `just ts-format-check` — passed.
- `just ts-lint` — passed with two pre-existing warnings in `packages/sdl/test/scenario/handoff-cli-contract.test.ts` about unnecessary escapes.
- `just ts-check` — passed.
- `just ts-test` — passed, 366 files / 3595 tests.
- `just ts-test-integration` — passed, 26 files / 123 tests.

## Boundary Decisions

- Publication remains excluded because it is a write-capable GitHub boundary and is tracked as a later disposition point.
- CLI rendering, prompt resources, real adapter classes, fake test helpers, raw command machinery, and the broad root export remain outside the curated API.
- Review log storage compatibility is preserved: namespace `roaster`, keys under `reviews/<review-key>/...`, and fake-backed tests cover the facade path without real Branch Memory writes.
