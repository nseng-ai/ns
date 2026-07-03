# Local Pi Tools Container Conversion

## Summary

The final approved conversion row now folds the seven former `@local-pi-tools/*` packages into the private local-space container `@sdl-local/pi-tools` at `ts/packages/local/pi-tools/`. The container declares seven subpackages (`backing-skill-commands`, `context-profiler`, `grill`, `pr-feedback-watch`, `pr-previews`, `runner-subagents`, and `thermo-council`) with no remainder, preserves the old public surfaces as `@sdl-local/pi-tools/<tool>` subpaths, and updates `.pi` adapters plus workspace imports to the new package/source layout.

The TypeScript style guard now enforces the strict local-space admission invariant: packages under `ts/packages/local/` must use the `@sdl-local/*` scope; `@sdl-local/*` packages must live under `ts/packages/local/` and be private; and runtime workspace dependencies from outside `local/` to `@sdl-local/*` are rejected. The remaining local-pi-tool-to-capability-kit policy exception is now a single explicit debt edge for `@sdl-local/pi-tools` and is mirrored in the topology extractor.

## Objective Impact

This resolves the last open package conversion row and completes the approved top-level reduction from the post-Pi-conversion state: topology extraction changed package count 27 → 21 and topology circles 86 → 87, with the old `@local-pi-tools/*` package ids removed and the seven tools reappearing as declared `@sdl-local/pi-tools/*` topology circles.

Validation passed: `pnpm --dir ts --filter @sdl-local/pi-tools run check`, `pnpm --dir ts --filter @sdl-local/pi-tools run test`, `just ts-test-typescript-style-guard`, `just ts-format-check`, `just dprint-check`, `just ts-check`, `just ts-lint`, `just ts-deps-check`, `just`, and `just ts-test-integration`.

## Follow-Ups

- The consolidated local Pi tools container still depends on `@sdl/capability-kit` for GitHub identity and text-repair helpers; the dependency remains tracked as explicit tier debt until local-pi-tool helper placement is settled.
- With all conversion rows resolved, the Objective is likely ready for a closure/readiness pass after parent review/commit confirms the final diff.
