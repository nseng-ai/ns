# Branch-to-PR mapping core seam extracted

The `pr-address exec map-branch-prs` branch-to-open-PR mapping logic now lives in an internal gateway-injected PR Address Domain Core module:

- Added `ts/packages/pr-address/src/core/branch-pr-mapping.ts` with `mapBranchesToOpenPrs`, core-owned mapping result types, explicit `GithubPrFeedbackGateway` + `GatewayOptions` inputs, and gateway failures returned as data.
- Thinned `ts/packages/pr-address/src/map-branch-prs.ts` back to command-adapter responsibilities: JSON input loading, branch-list validation, gateway-option wiring from `PrAddressExecContext`, and Clinkr `ok`/`negative`/`pr_gateway_failure` exit translation.
- Added fake-backed unit coverage in `ts/packages/pr-address/test/unit/core-branch-pr-mapping.test.ts` for request-order mapping, missing/non-open PRs, ambiguous shared-head branches, summary counts, and `listOpenPrs` failure propagation.

Compatibility evidence:

- Existing `map-branch-prs` scenario coverage still passes with the same JSON result keys and exit semantics for success, semantic missing/ambiguous mapping, invalid input, and gateway failure.
- The new core seam remains package-internal; `@sdl/pr-address/api` exports were not expanded in this slice.
- Validation run: `pnpm --dir ts --filter @sdl/pr-address run test -- test/unit/core-branch-pr-mapping.test.ts test/scenario/map-branch-prs.test.ts`, `pnpm --dir ts --filter @sdl/pr-address run check`, and `pnpm --dir ts --filter @sdl/pr-address run test`.
