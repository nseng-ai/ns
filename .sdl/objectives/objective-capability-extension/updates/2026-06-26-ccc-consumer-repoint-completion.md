# Completed CCC consumer repoint slice

## Summary

CCC no longer imports the Objective selection adapter from Pi's Objective compatibility shell. The command-context adapter now lives in `@sdl/ccc` at `ts/packages/ccc/src/objective-selection-context.ts` and converts CCC/Pi `CommandContext` values into `@sdl/objective/api` `ObjectiveSelectionContext` values while preserving the existing binding/copying behavior from the former Pi adapter.

Changed production call sites:

- `ts/packages/ccc/src/objective-stack-impl.ts` now imports `objectiveSelectionContextFromCommandContext` from `./objective-selection-context.ts`.
- `ts/packages/ccc/src/cmux/sidebar.ts` now imports `objectiveSelectionContextFromCommandContext` from `../objective-selection-context.ts`.

Pi Objective compatibility modules and user-visible slash commands were not changed. The separate risky Pi→CCC cycle-break roadmap row remains open.

## Verification evidence

Stale-edge gates:

```bash
rg "@sdl/pi/objectives" ts/packages
```

Result: no matches.

```bash
rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json
```

Result: no matches.

Validation commands run:

```bash
pnpm --dir ts --filter @sdl/ccc test
```

Result: passed, 17 test files and 292 tests.

```bash
pnpm --dir ts run check
just ts-format-check
just ts-lint
just ts-deps-check
just ts-guard
just ts-test
```

Results: all passed. Full TS test suite passed with 353 test files and 3408 tests.

## Objective impact

- The `Consumer repoint slice` roadmap row is now complete.
- `@sdl/objective` remains clean of `@sdl/pi` imports and manifest dependencies.
- `@sdl/pi/objectives/*` remains as a compatibility surface; this update only removes CCC's production dependency on that surface.
- Parked acyclicity guard/context-documentation items remain parked until the real package graph is acyclic.
