# `sdl-flow` container conversion

## Summary

Converted `sdl-flow` into a properly formed container package. The package now declares `sdl.subpackages` for `autobranch`, `commands`, `core`, `land`, `land-stack`, `pi`, `shared`, and `submit` with no remainder. The former `sdl-land` source/tests were folded into the `land` subpackage and exposed as `sdl-flow/land/api` / `sdl-flow/land/testing`; the former `@sdl/flow-pi` source/tests were folded into the `pi` subpackage and exposed as `sdl-flow/pi/*`. The standalone `sdl-land` and `@sdl/flow-pi` package manifests were deleted, and repo Pi discovery/docs now point at the Flow `pi` subpackage.

Topology evidence: package count changed 34 → 32 and topology circles 53 → 59. The folded packages disappeared as top-level package/circle ids and reappeared as declared `sdl-flow/*` circles; `sdl-flow` has no orphan source, and no new cycles were introduced. The TypeScript style guard/topology report now recognize the approved pi-subpackage model by allowing a capability package with a declared `pi` subpackage and optional `@sdl/pi` peer to carry that package-level edge while preserving the normal capability→host prohibition.

Validation passed: `pnpm --dir ts --filter sdl-flow run check`, `pnpm --dir ts --filter sdl-flow run test`, `pnpm --dir ts --filter @sdl/ccc run check`, `pnpm --dir ts --filter @sdl/pi run check`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just ts-check`, `just ts-deps-check`, `just dprint-check`, and `just`.

## Objective Impact

This resolves the approved `sdl-flow` conversion row and reduces top-level packages by two more via the approved folds. It also lands the first concrete pi-subpackage model conversion, including the guard/report allowance needed for optional `@sdl/pi` peer dependencies on capability containers whose Pi presentation is isolated under a `pi` subpackage.

## Follow-Ups

- Continue with the next approved conversion row (`@sdl/slot`) after parent review/commit of this slice.
- Future pi-subpackage conversions should reuse the same optional-peer model and keep `@sdl/pi` imports confined to their declared `pi` subpackage.
