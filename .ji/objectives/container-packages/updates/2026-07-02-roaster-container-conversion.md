# Roaster Container Conversion

## Summary

`@sdl/roaster` was converted into a properly formed container package. The package now lives under `ts/packages/capabilities/roaster`, declares `commands`, `core`, `gateways`, `operations`, and `sdl` subpackages with no remainder, and preserves its existing public import surfaces such as `@sdl/roaster/api`, `@sdl/roaster/commands/*`, and `@sdl/roaster/repo-local-sdl-extension`.

Topology extraction changed package count 28 → 28 and topology circle count 76 → 81. Roaster's former flat package circle is now a zero-LOC container root, and the five declared subpackage circles account for the source code.

Validation passed: `pnpm --dir ts --filter @sdl/roaster run check`, `pnpm --dir ts --filter @sdl/roaster run test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just dprint-check`, `just ts-check`, `just`, and `just ts-test-integration`.

## Objective Impact

This resolves the approved Roaster conversion row as **converted** without a re-decision. It also applies the capability directory placement ruling to Roaster by moving the package under `ts/packages/capabilities/` while preserving the published package identity.

## Follow-Ups

- Continue with the next approved conversion row: `@sdl/pi` containerization and the `@sdl/worktree-status` fold.
- Later cleanup can reconcile historical prose that mentions the old `ts/packages/roaster` path if it is no longer useful as provenance.
