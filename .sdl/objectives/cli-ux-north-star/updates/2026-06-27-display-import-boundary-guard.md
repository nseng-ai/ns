# Display Import Boundary Guard

## Summary

Converted `ts/packages/infra/clinkr/test/core-import-isolation.test.ts` from an early core-only canary into a formal clinkr-owned Vitest production source-boundary guard.

The guard now:

- scans literal static imports, re-exports, side-effect imports, and dynamic imports;
- walks the production source graphs for `@sdl/clinkr`, `@sdl/clinkr/raw`, `@sdl/clinkr/completion`, and `@sdl/clinkr/testing`;
- forbids those non-display graphs from importing relative display source or the opt-in display subpaths `@sdl/clinkr/theme` / `@sdl/clinkr/stream`;
- enforces production dependency ownership: `ansis` only from `src/theme/**`, and `log-update` only from `src/stream/**`;
- keeps the rule scoped to production `src/**`, so tests can continue using display dependencies as assertion helpers.

Validation passed:

```bash
pnpm --dir ts exec vitest run --config vitest.config.ts packages/infra/clinkr/test/core-import-isolation.test.ts
pnpm --dir ts exec vitest run --config vitest.config.ts packages/infra/clinkr/test
pnpm --dir ts run check
pnpm --dir ts run fmt:check
pnpm --dir ts run lint
```

## Objective Impact

This completes the active import-boundary row for opt-in display. The display layer remains opt-in through the `theme` and `stream` subpaths, while core/raw/completion/testing are guarded against accidental display imports.

The roadmap row is marked complete with the guard scope and validation evidence.

## Follow-Ups

No new semantic follow-up was introduced by this slice. The Objective appears to be down to closure-level validation/evidence and possible `objective-close`; full `just` remains closure evidence rather than a new roadmap work row.
