# Graphite Maintenance Module Extracted

## Summary

Flow land-stack post-merge Graphite maintenance now lives in a focused private module:

- Added `ts/packages/capabilities/flow/src/land-stack/graphite-maintenance.ts` for post-merge `gt get`, restack, submit/update, descendant maintenance warnings, final local branch deletion, and retained-branch cleanup outcomes.
- Kept `ts/packages/capabilities/flow/src/land-stack/landing-operations.ts` focused on managed-slot pre-merge cleanup, merge-loop state preparation, PR merge/verification, and delegating post-merge maintenance after each verified PR is recorded.
- Kept `sdl-flow/api`, Flow package exports, CCC consumption, public command names, Graphite arguments, and durable CCC-era refs unchanged.

Validation evidence:

- `pnpm --dir ts exec vitest run packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run lint` passed.

## Objective Impact

This advances the roadmap row “Decompose Flow land command shells from land-stack domain orchestration” by moving the mutation-heavy post-merge Graphite maintenance cluster behind a Flow-private module boundary while preserving behavior.

The row remains open because broader land-domain seam work, remaining merge-loop/backup-ref decomposition, CCC-era naming inventory, context/map refresh, and final API/export rebaseline still need follow-up evidence.

## Follow-Ups

- Continue bounded, behavior-preserving Flow land-stack decomposition slices before introducing broader land-domain package seams.
- Keep `graphite-maintenance.ts` Flow-private unless a later design explicitly promotes a tested domain seam.
- Re-run final API/export cleanliness checks after the remaining structural slices land.
