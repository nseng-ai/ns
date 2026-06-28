# PR checks core seam extracted

## Summary

Extracted the portable `sdl address exec pr-checks` semantics from Address command glue into an Address-owned Domain Core seam.

## Changes / Evidence

- Added `ts/packages/address/src/core/pr-checks.ts` with `collectPrChecks`, explicit core payload/result types, injected `GitGateway`, injected `GithubPrFeedbackGateway`, and injected `GatewayOptions`.
- The core now owns `pr-checks` target resolution from either `--pr-number` or the current branch, including detached-HEAD handling, git failure propagation, PR lookup failure propagation, successful no-PR payloads, and `getPrChecks` failure propagation.
- The core now owns the stable machine payload normalization for `found`, `target`, `counts`, and `checks`, preserving the existing snake_case keys and omitting `counts.has_more` when the gateway omits `hasMore`.
- Thinned `ts/packages/address/src/primitive-commands.ts` so `runPrChecks` only wires command context/options into `collectPrChecks` and translates core outcomes to Clinkr exits.
- Removed the old `prChecksResult` normalizer from `ts/packages/address/src/primitive-results.ts` so check normalization has one Address core home.
- Extended `InMemoryGithubPrFeedbackGateway` with `checksFailurePrNumbers` to model fake `getPrChecks` failures by constructor state.
- Added `ts/packages/address/test/unit/core-pr-checks.test.ts` for explicit PR success/miss/failure, current-branch success/miss/git-failure/detached behavior, check-fetch failure, and optional `has_more` handling.

## Validation

Passed in this working session:

- `pnpm --dir ts --filter @sdl/address run test -- test/unit/core-pr-checks.test.ts test/scenario/primitives.test.ts`
- `pnpm --dir ts --filter @sdl/address run check`
- `pnpm --dir ts --filter @sdl/address run test`
- `just ts-format-check`
- `just ts-lint` (passed with pre-existing `no-useless-escape` warnings in `packages/sdl/test/scenario/handoff-cli-contract.test.ts`)
- `just dprint-check`

## Objective Impact

This advances the open Domain Core seams row but does not complete it. Remaining primitive operations and any reusable Pi watch/fingerprint behavior still need separate evaluation before the Objective can claim the full row complete.
