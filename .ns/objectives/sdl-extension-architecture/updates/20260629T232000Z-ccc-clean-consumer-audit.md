# CCC clean-consumer audit

Implemented the evidence-only `ccc-clean-consumer-audit-conversion` slice for Phase 2 Step 5.

## Audit result

- `@sdl/ccc` source and package metadata have no direct `@sdl/pi` dependency/imports.
- `@sdl/ccc` source and package metadata have no `@sdl/domain-primitives-transitional` imports.
- `@sdl/ccc` source and package metadata have no stale `@sdl/sdl/*` internal-migration imports.
- Completed provider capability consumption is through curated APIs where CCC currently consumes those providers:
  - `@sdl/objective/api`
  - `@sdl/slot/api`
  - `@sdl/branch-context/api`
  - `@sdl/plans/api`
- Provider package-root dependencies in `ts/packages/ccc/package.json` are still required to resolve `/api` or testing subpaths used by source/tests; no package metadata changes were needed.
- Accepted neutral/gateway/package surfaces remain in use, including `@sdl/capability-kit/*`, `@sdl/core/*`, `@sdl/exec`, `@sdl/graphite/*`, `@sdl/cmux/*`, `@sdl/kernel/*`, `@sdl/clinkr`, `@sdl/cli-theme`, `sdl-sdk`, and `zod`.

## Remaining Step 5 caveat

This audit did not mark Step 5 complete. CCC still imports Flow-owned landing/autoslot/trunk-pull surfaces through explicit `sdl-flow/*` package exports, including `sdl-flow/land-stack/*`, alongside the curated `sdl-flow/api` autobranch seam. Those are not private `src` imports and validation/guards allow them today, but they are broader than the strict `Capability API` shape used by the completed provider capabilities. Treat any future claim that CCC is fully clean-consumer-complete as needing an explicit Flow/CCC landing-surface disposition: either record these exported Flow subpaths as the accepted landing Capability API shape, or consolidate the needed consumer-facing surface behind `sdl-flow/api`.

## Evidence searches

- `rg -n "@sdl/pi" ts/packages/ccc/src ts/packages/ccc/package.json` returned no matches.
- `rg -n "@sdl/domain-primitives-transitional" ts/packages/ccc/src ts/packages/ccc/package.json` returned no matches.
- `rg -n "@sdl/sdl/" ts/packages/ccc/src ts/packages/ccc/package.json` returned no matches.
- `rg -n "from \"@sdl/(slot|branch-context|plans|objective|handoff|roaster|address|aretro)(/src|/internal)?\"|from '@sdl/(slot|branch-context|plans|objective|handoff|roaster|address|aretro)(/src|/internal)?'" ts/packages/ccc/src ts/packages/ccc/test` returned no matches.
- Dependency/import inventory found every `ts/packages/ccc/package.json` dependency used by source/tests/build inputs; provider roots are required for `/api` subpath resolution or test seams.

## Validation

- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `just ts-test-typescript-style-guard`
