# Converted @sdl/objective into a container package

## Summary

Converted the approved `@sdl/objective` row: the package moved to `ts/packages/capabilities/objective`, declares `core`, `operations`, `pi`, and `sdl` subpackages with no remainder, and folds the former private `@sdl/objective-pi` shim into `@sdl/objective/pi`. The `.pi` adapter now imports `@sdl/objective/pi/extension`, the host parity source package name reflects the new pi subpackage, and the kernel source-path module loader points at the relocated capability package.

Topology extraction changed package count 31 → 30 and topology circles 67 → 70. `@sdl/objective-pi` no longer exists as a top-level package/circle id, and `@sdl/objective` has no orphan source.

Validation passed: `pnpm --dir ts --filter @sdl/objective run check`, `pnpm --dir ts --filter @sdl/objective run test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just ts-check`, full `just`, and `just ts-test-integration`.

## Objective Impact

This resolves the approved `@sdl/objective` conversion row and advances the package-by-package conversion sequence. It also applies the pi-subpackage model to Objective: only the `pi` subpackage imports `@sdl/pi`, while non-Pi Objective behavior remains behind `@sdl/objective/api` / core operations.

## Follow-Ups

Continue with the next approved conversion row in `roadmap.md` (`@sdl/ccc` → container, folding `@sdl/ccc-pi` into `pi`) unless live code reality contradicts its inventory entry at pickup.
