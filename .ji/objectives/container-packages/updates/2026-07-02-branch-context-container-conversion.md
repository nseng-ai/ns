# Branch Context Container Conversion

## Summary

`@sdl/branch-context` was converted into a container package and the private `@sdl/branch-context-pi` package was folded into `@sdl/branch-context/pi`. The surviving package now lives under `ts/packages/capabilities/branch-context`, declares `core`, `sdl`, `testing`, and `pi` subpackages with no remainder, and exposes the Pi registration surface through `@sdl/branch-context/pi` and `@sdl/branch-context/pi/extension`.

Topology extraction changed package count 29 → 28 and topology circle count 73 → 76. `@sdl/branch-context-pi` disappeared as a top-level package/circle id, and Branch Context now appears as the declared subpackage circles `@sdl/branch-context/core`, `@sdl/branch-context/sdl`, `@sdl/branch-context/testing`, and `@sdl/branch-context/pi`; branch-context orphan source is cleared.

Validation passed: `pnpm --dir ts --filter @sdl/branch-context run check`, `pnpm --dir ts --filter @sdl/branch-context run test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just ts-check`, `just dprint-check`, `just`, and `just ts-test-integration`.

## Objective Impact

This resolves the approved Branch Context conversion row and advances the package-count reduction from 29 to 28 in the current branch stack state. It also completes the last standalone `capability-pi` package fold in the current workspace: Branch Context now follows the same pi-subpackage model as Flow, Handoff, Objective, and CCC, with `@sdl/pi` represented as an optional peer/dev dependency and all `@sdl/pi` imports isolated to the declared `pi` subpackage.

## Follow-Ups

- Continue with the next approved conversion row: `@sdl/roaster` containerization.
- Later cleanup may retire stale historical mentions of `@sdl/branch-context-pi` in archived/objective prose, but they are not live package references.
