# Pi Container Worktree Status Conversion

## Summary

`@sdl/pi` was converted into a declared container package with `kit`, `commands`, `runtime`, `parity`, `worktree-status`, and `core` subpackages. The former standalone `@sdl/worktree-status` package was folded into `@sdl/pi/worktree-status`, and `.pi/extensions/worktree-status.ts` now loads the folded subpackage surface.

Topology evidence changed from package count 28 / topology circles 81 to package count 27 / topology circles 86. `@sdl/worktree-status` no longer exists as a top-level package or circle, `@sdl/pi/worktree-status` is present, `@sdl/pi` has no orphan source, and `@sdl/pi` still has no capability-package dependency.

Validation passed: `pnpm --dir ts --filter @sdl/pi run check`, `pnpm --dir ts --filter @sdl/pi run test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just ts-check`, `just dprint-check`, `just`, and `just ts-test-integration`.

## Objective Impact

This resolves the approved `@sdl/pi` conversion row and reduces the end-state top-level package count by one more folded package. The only remaining conversion row is the approved `@sdl-local/pi-tools` local container fold.

## Follow-Ups

- Execute the final approved `@sdl-local/pi-tools` conversion row.
