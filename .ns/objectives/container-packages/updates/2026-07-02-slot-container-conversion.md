# Slot Container Conversion

## Summary

Converted `@sdl/slot` into a properly formed container package. The package now declares `core`, `gateways`, `lifecycle`, `operations`, and `shell` in `sdl.subpackages` with no remainder; former loose root source moved under `src/core/`, while public exports and SDL extension command entries continue to expose the existing package surfaces from their new paths.

## Objective Impact

This resolves the approved `@sdl/slot` conversion row without a re-decision. Topology extraction changed package count 32 → 32 and topology circles 59 → 64, adding only the declared `@sdl/slot/*` circles and leaving no slot orphan source.

Validation evidence: `pnpm --dir ts --filter @sdl/slot run check`, `pnpm --dir ts --filter @sdl/slot run test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just ts-check`, `just dprint-check`, `just ts-test-integration`, and `just` passed.

## Follow-Ups

Continue with the next approved conversion row (`@sdl/handoff` with `@sdl/handoff-pi` folded into `pi`) unless parent review finds a slot-specific issue.
