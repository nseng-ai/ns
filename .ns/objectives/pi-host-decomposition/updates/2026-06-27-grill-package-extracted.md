# Grill Package Extracted

## Summary

Extracted the Pi-native grill UI implementation from `@sdl/pi` into `ts/packages/pi-tools/grill/` as private package `@sdl/pi-grill`. The new package owns the grill registration entrypoint, `grill_ask` tool implementation, structured inline UI helpers, focused tests, and package-local parity metadata. The project-local `.pi/extensions/grill-ui.ts` adapter now imports the extracted package source directly, matching the context-profiler extraction recipe.

A neutral host helper subpath, `@sdl/pi/grill/surfaces`, now owns stable grill surface constants used by both the extracted package and remaining host consumers such as `/sdl:plan:grill-and-save` prompt construction. `@sdl/pi` does not import or depend on `@sdl/pi-grill`.

Validation evidence from the extraction slice:

- `pnpm --dir ts exec vitest run packages/pi-tools/grill/test/grill-ui.test.ts packages/pi-tools/grill/test/grill-ui-inline-ui.test.ts packages/pi-tools/grill/test/grill-ui-parity.test.ts packages/hosts/pi/test/enriched-plan-commands.test.ts packages/hosts/pi/test/parity.test.ts packages/hosts/pi/test/integration/node-runtime-imports.test.ts`
- `pnpm --dir ts --filter @sdl/pi-grill run check`
- `pnpm --dir ts --filter @sdl/pi-grill run test`
- `pnpm --dir ts run check`
- `just ts-format-check`
- `just ts-lint`
- `just ts-guard`
- `just ts-deps-check`
- `git diff --check`

## Objective Impact

This completes the `grill` portion of the roadmap item to apply the reference Pi-tool extraction recipe to the next obvious Pi-native tool candidates. It further proves the provisional `ts/packages/pi-tools/<tool>/` convention, direct discovery-adapter registration shape, package-owned parity metadata, and host-neutral-surface dependency direction beyond the original `context-profiler` reference slice.

## Follow-Ups

- Continue the same recipe/disposition work for `thermo-council` unless inventory evidence suggests a different boundary.
- Do not close the Objective yet; `runner-subagents`, `terminal`, capability-mirror thinning, and final export/context rebaseline remain open.
