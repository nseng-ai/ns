# Context Profiler Package Extracted

## Summary

The reference `context-profiler` implementation has moved out of `@sdl/pi` host source into a provisional Pi-tool workspace package at `ts/packages/pi-tools/context-profiler/`, named `@sdl/pi-context-profiler`.

The extracted package owns its source, focused tests, and context-profiler parity metadata. The project-local `.pi/extensions/context-profiler.ts` discovery adapter now imports the new package source entrypoint directly, while `@sdl/pi` exposes only the neutral helper/runtime subpaths the package consumes.

## Objective Impact

This completes the second planned branch of the `context-profiler` extraction stack and validates the provisional package placement strongly enough to proceed to the recipe/context slice:

- `ts/packages/hosts/pi/src/context-profiler/` was removed from the host, and the implementation now lives under `ts/packages/pi-tools/context-profiler/src/`.
- Context-profiler-focused tests and fakes moved under `ts/packages/pi-tools/context-profiler/test/`; host-owned shared helper tests stayed with `@sdl/pi`.
- The extracted package imports curated `@sdl/pi/...` subpaths for command acknowledgement, model calls, parity helpers, and shared render/LM-JSON helpers.
- `@sdl/pi` no longer imports context-profiler production code or parity records; package-specific parity coverage now lives with `@sdl/pi-context-profiler`.
- The live command name and project-local discovery adapter path remain intentionally preserved.

Parent-side validation passed for focused context-profiler package tests, host parity/shared-helper tests, `just ts-check`, `just ts-guard`, and `just ts-format-check`. The forbidden-seam inspection found no remaining old host `context-profiler` imports.

The overall roadmap row remains in progress until the reference extraction recipe and package-boundary convention are recorded.

## Follow-Ups

- Record the proven Pi-tool extraction recipe and final reference-slice convention in the relevant context/Objective prose.
- Use the recipe slice to clarify that extracted Pi-tool packages depend on neutral `@sdl/pi/...` helper/runtime subpaths while project-local discovery adapters import package source entrypoints directly.
- Continue to keep capability-mirror thinning and other Pi-native tool candidates out of this reference extraction stack.
