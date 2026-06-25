# Sibling Peer API Test Boundary

## Summary

Migrated the remaining broad sibling test imports in `@sdl/ccc` and `@sdl/pi-extensions` to the curated `@sdl/branch-context/api` and `@sdl/plans/api` subpaths. Added the minimal explicit Peer API exports needed by those tests: branch-context fake context and slug-prompt helpers, plus plans saved-plan path helpers and slug-prompt helpers. Removed the CCC test dependency on the branch-context root command-name constant by asserting the exact current implementation command strings directly.

## Objective Impact

This completes the final broad/deep sibling import cleanup for branch-context/plans composition. Sibling runtime packages and their tests now consume branch-context/plans through curated Peer API subpaths; package-owner tests may still import package roots for root compatibility coverage; and `@sdl/branch-context` remains allowed to depend on `@sdl/plans` for saved-plan sources, naming, validation, and selection. The package context docs now record this boundary stance, and the final roadmap row is marked complete.

Validation evidence:

- `pnpm --dir ts --filter @sdl/branch-context run check`
- `pnpm --dir ts --filter @sdl/plans run check`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `pnpm --dir ts --filter @sdl/pi-extensions run check`
- `pnpm --dir ts --filter @sdl/pi-extensions run test`
- Sibling-boundary search over `ts/packages/ccc/src`, `ts/packages/ccc/test`, `ts/packages/pi-extensions/src`, and `ts/packages/pi-extensions/test` returns no broad `@sdl/branch-context` or `@sdl/plans` imports.

## Follow-Ups

- Objective closure remains out of scope for this implementation slice unless a separate pass verifies every completion criterion and branch/PR state make closure clearly appropriate.
- No storage layout, Branch Memory namespace/key, branch naming, slug derivation, CLI/Pi command, Graphite, cmux, or PR submission behavior changed.
