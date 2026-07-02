# CCC Container Conversion

## Summary

`@sdl/ccc` was converted into a container package and the standalone `@sdl/ccc-pi` package was folded into `@sdl/ccc/pi`. The CCC package now lives under `ts/packages/capabilities/ccc`, declares `autobranch`, `cmux`, `core`, and `pi` subpackages with no remainder, and exposes the Pi registration surface through `@sdl/ccc/pi` and `@sdl/ccc/pi/extension`.

Topology extraction changed package count 30 → 29 and topology circle count 70 → 73. `@sdl/ccc-pi` disappeared as a top-level package/circle id, and CCC now appears as the declared subpackage circles `@sdl/ccc/autobranch`, `@sdl/ccc/cmux`, `@sdl/ccc/core`, and `@sdl/ccc/pi`.

Validation passed: `pnpm --dir ts --filter @sdl/ccc run check`, `pnpm --dir ts --filter @sdl/ccc run test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just ts-check`, `just dprint-check`, and `just`.

## Objective Impact

This resolves the approved CCC conversion row and advances the package-count reduction from 30 to 29 in the current branch stack state. It also confirms the pi-subpackage model for CCC without introducing a host-to-capability dependency from `@sdl/pi` to `@sdl/ccc`: project-local discovery imports the owning `@sdl/ccc/pi` surface, and the optional peer edge remains capability → host only.

The conversion required making `@sdl/core/cli-runtime` locate the nearest package manifest from nested CLI entrypoints, because CCC's CLI moved from package-root `src/cli.ts` into the declared `core` subpackage at `src/core/cli.ts`.

## Follow-Ups

- Continue with the next approved conversion row: `@sdl/branch-context` folding `@sdl/branch-context-pi` into `pi`.
- Watch for other bin-owning packages that become containers; nested CLI entrypoints should now be supported by the shared CLI runtime manifest lookup.
