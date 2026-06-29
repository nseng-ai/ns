# CCC Pi boundary cleanup and guard

Implemented the `ccc-pi-boundary-cleanup-and-guard` slice.

## Boundary changes

- Moved CCC Pi command registration/presentation wrappers into `@sdl/ccc-pi` modules for dispatch prompt, dispatch from trunk, open branch, dispatch plan, sidebar commands, and Claude plan tab.
- Kept CCC orchestration/handler logic in `@sdl/ccc` behind Pi-free options/callbacks.
- Removed `@sdl/ccc/legacy-pi-extension` and the `@sdl/pi` manifest dependency from `@sdl/ccc`.
- Updated `@sdl/ccc-pi` to depend on neutral `@sdl/pi` helpers and register the full CCC Pi command surface.
- Updated CCC and Pi context docs to describe `@sdl/ccc-pi` as the current adapter.

## Guard evidence

- Removed the style-guard allowlisted debt edge for `@sdl/ccc -> @sdl/pi`; capability-to-host edges now fail the tier policy without an exception for CCC.
- `rg -n "@sdl/pi" ts/packages/ccc/src ts/packages/ccc/package.json` returned no matches.
- `rg -n "legacy-pi-extension|registerCccLegacyPiExtension" ts/packages/ccc ts/packages/capability-pi/ccc .pi` returned no matches.

## Validation

- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/ccc-pi run check`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `pnpm --dir ts --filter @sdl/ccc-pi run test`
- `just ts-test-typescript-style-guard`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test`
- `just dprint-check`
