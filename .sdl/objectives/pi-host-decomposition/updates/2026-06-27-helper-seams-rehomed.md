# Context Profiler Helper Seams Rehomed

## Summary

The first implementation slice of the `context-profiler` reference extraction rehomed the neutral reverse-import helpers that were blocking a clean package move. Display-width and scroll helpers now live behind the intentional `@sdl/pi/shared/render-helpers` export, and LM JSON parsing now lives behind `@sdl/pi/shared/lm-json`.

Local branch evidence shows PR preview views, `context-profiler`, and `thermo-council` now consume those neutral helper modules instead of importing helper code from `src/context-profiler/`. The legacy `src/context-profiler/lm-json.ts` and render helper exports remain as compatibility re-exports for the next extraction slice, while new focused tests cover the neutral helper modules directly.

## Objective Impact

This completes the first planned branch of the `context-profiler` extraction stack and removes two concrete host-internal coupling seams recorded in the inventory update:

- PR preview views no longer import `clamp`, `fitToWidth`, or `reconcileScroll` from `src/context-profiler/render.ts`.
- `thermo-council` no longer imports `parseLmJson` from `src/context-profiler/lm-json.ts`.
- `@sdl/pi` now exposes the neutral helper subpaths needed by a future `@sdl/pi-context-profiler` package without making the host depend on that package.

Parent-side validation passed for the focused Pi test set covering context-profiler rendering, shared LM JSON, shared render helpers, PR preview feedback/check views, and thermo-council behavior; `just ts-check`, `just ts-format-check`, and `just ts-guard` also passed.

The overall `context-profiler` extraction row remains in progress because the package move and acyclic parity-registration seam are still pending.

## Follow-Ups

- Continue with `pi-host-decomp/context-profiler-package`: move `context-profiler` source and tests to the provisional `ts/packages/pi-tools/context-profiler/` package and keep imports on curated `@sdl/pi/...` helper/runtime subpaths.
- Resolve the remaining parity-registration seam without making `@sdl/pi` import `@sdl/pi-context-profiler`.
- After package extraction validates, record the reference package recipe or a corrected disposition in the recipe/context slice.
