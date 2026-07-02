# Handoff Container Conversion

## Summary

Converted the approved `@sdl/handoff` row. The package now declares `sdl.subpackages` for `core`, `operations`, `pi`, and `sdl` with no remainder, and the former `@sdl/handoff-pi` package is folded into `@sdl/handoff/pi`.

Topology extraction changed package count 32 → 31 and topology circle count 64 → 67. The former `@sdl/handoff-pi` top-level package/circle is gone, and `@sdl/handoff` has no orphan source.

## Objective Impact

This resolves the next approved pi-subpackage model conversion row and reduces the top-level package count by one through an approved fold.

## Follow-Ups

Continue with the next approved conversion row in `roadmap.md` (`@sdl/objective` → container, folding `@sdl/objective-pi` into `pi`) unless live code reality contradicts its inventory entry at pickup.
