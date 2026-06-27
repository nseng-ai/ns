# Context Profiler Recipe Recorded

## Summary

The reference extraction recipe from the `context-profiler` package move is now recorded in package context language. `ts/packages/hosts/pi/CONTEXT.md` defines `@sdl/pi` as the Pi Presentation Host, adds the Pi-native tool package tier, records direct `.pi/extensions` source-entrypoint discovery for extracted tools, and states that extracted tool packages own their parity metadata and focused parity tests.

`CONTEXT-MAP.md` now carries the corresponding relationship notes: Pi-native tool packages stack on neutral `@sdl/pi/...` helper/runtime subpaths, while capability mirrors continue thinning toward owning Capability APIs instead of becoming Pi-tool packages.

## Objective Impact

This completes the third planned branch of the `context-profiler` reference extraction stack and closes the roadmap row for extracting `context-profiler` as the reference Pi-native package slice.

The proven convention is:

- `@sdl/pi` owns neutral Pi runtime/helper/parity subpaths and host-owned presentation shells.
- A standalone Pi-native tool package under `ts/packages/pi-tools/<tool>/` owns its implementation, focused tests, extension entrypoint, and parity metadata.
- Project-local `.pi/extensions/*.ts` discovery adapters import extracted package source entrypoints directly because workspace package exports are not reliable from that discovery path.
- `@sdl/pi` must not import extracted Pi-native tool packages; the dependency direction is tool package → neutral `@sdl/pi/...` helper/runtime subpaths.
- Capability mirrors are not Pi-native tool packages; remaining capability-specific decisions should move toward the owning Capability API.

Parent-side validation passed for `just dprint-check`; earlier stack validation passed for focused context-profiler/helper/parity tests, `just ts-check`, `just ts-guard`, and `just ts-format-check`.

## Follow-Ups

- Apply or adapt the recipe to the next obvious Pi-native candidates, starting with `grill` and `thermo-council` unless updated inventory evidence suggests a better order.
- Continue to disposition `runner-subagents` and `terminal` with runtime-boundary evidence before treating either as an ordinary Pi-tool extraction.
- Keep capability mirror thinning separate from Pi-native tool extraction and coordinate with owning Capability Objectives when capability domain work is required.
