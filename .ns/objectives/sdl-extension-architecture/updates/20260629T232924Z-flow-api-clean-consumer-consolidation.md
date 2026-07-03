# Flow API clean-consumer consolidation

## Summary

Consolidated the remaining CCC Flow-consumer surface behind the curated Flow Capability API.

Changes:

- Expanded `sdl-flow/api` to include the CCC-facing Flow orchestration surfaces for autoslot, trunk-pull, land, and land-stack helpers.
- Repointed all `@sdl/ccc` Flow re-export wrappers from broad `sdl-flow/{autoslot,land,trunk-pull,land-stack*}` subpaths to `sdl-flow/api`.
- Removed the broad non-command Flow package exports (`./autoslot`, `./land`, `./trunk-pull`, `./land-stack`, and `./land-stack/*`) from `ts/packages/capabilities/flow/package.json`, leaving command entries and the curated `./api` entry as the consumer-facing package boundary.

Evidence searches:

- `rg -n "sdl-flow/(autoslot|land|trunk-pull|land-stack)" ts/packages --glob '!node_modules'` returned no matches.
- `rg -n "from \"sdl-flow/(?!api)" ts/packages/ccc/src --pcre2` returned no matches.
- `rg -n "\"\./(autoslot|land|trunk-pull|land-stack|land-stack/\*)\"" ts/packages/capabilities/flow/package.json` returned no matches.
- `rg -n "@sdl/pi|@sdl/domain-primitives-transitional|@sdl/sdl/" ts/packages/ccc/src ts/packages/ccc/package.json` returned no matches.

Validation:

- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-test-typescript-style-guard`

## Objective Impact

This resolves the Step 5 caveat from `updates/20260629T232000Z-ccc-clean-consumer-audit.md`: CCC no longer depends on Flow through broad landing/autoslot/trunk-pull subpaths. Flow is now consumed by CCC through the single curated `sdl-flow/api` Capability API boundary, matching the clean-consumer shape used for completed provider capabilities.

Roadmap Step 5 is now marked complete. The remaining parent Objective work is Step 6: delete `@sdl/domain-primitives-transitional` once no live consumers remain.

## Follow-Ups

- Run the Step 6 deletion slice: confirm remaining transitional-package consumers, migrate/delete them as appropriate, remove the package, and validate the below-SDK domain-free completion marker.
