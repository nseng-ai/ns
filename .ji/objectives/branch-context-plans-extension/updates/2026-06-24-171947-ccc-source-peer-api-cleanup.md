# CCC Source Peer API Cleanup

## Summary

Retired the remaining broad `@sdl/branch-context` imports from `ccc` source code for the branch-context/plans capability seam.

- `ts/packages/ccc/src/branch-context-up-and-impl.ts` now imports `formatImplBranchContextCommand` and `BranchContextEvidence` from `@sdl/branch-context/api`.
- `ts/packages/ccc/src/cmux/slot-open-branch.ts` now imports `findLatestBranchContextEvidence` and `BranchContextEvidence` from `@sdl/branch-context/api`.
- `@sdl/branch-context/api` now explicitly exports `findLatestBranchContextEvidence` for the inferred latest-branch-context path.

The source import-boundary search over `ts/packages/ccc/src`, `ts/packages/pi-extensions/src`, and `ts/packages/extensions` shows no remaining broad `@sdl/branch-context` or `@sdl/plans` source imports.

## Objective Impact

This advances the final-boundary roadmap row: sibling source now consumes branch-context/plans behavior through curated Peer API subpaths rather than broad package roots. The change is import-boundary-only; it does not alter saved-plan storage, Branch Memory namespaces or keys, branch naming, slug derivation, attached-plan selection, Pi command names, or cmux launch semantics.

The roadmap row remains in progress because broad imports still exist in tests and final package docs/context have not yet recorded the completed dependency stance. The next decision is whether those test imports are acceptable public-root coverage or should also move to Peer API subpaths.

## Follow-Ups

- Decide the stance for remaining broad `@sdl/branch-context` / `@sdl/plans` test imports.
- Record the final branch-context/plans/ccc/pi-extension dependency boundary in package docs/context once the test stance is settled.
- Re-run the import-boundary search as closure evidence before marking this child Objective complete.

## Validation

- `pnpm --dir ts --filter @sdl/branch-context run check`
- `pnpm --dir ts --filter @sdl/ccc run check`
- `pnpm --dir ts --filter @sdl/ccc run test`
- `rg 'from "@sdl/(branch-context|plans)"|from '\''@sdl/(branch-context|plans)'\''' ts/packages/ccc/src ts/packages/pi-extensions/src ts/packages/extensions -g '*.ts'`
