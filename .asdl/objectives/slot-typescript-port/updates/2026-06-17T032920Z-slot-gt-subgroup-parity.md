# Semantic Update: slot gt subgroup parity

## Summary

Ported the TypeScript `@asdl/slot` Graphite subgroup surface:

- user-facing `slot gt up`, `slot gt down`, and `slot gt free-stack`;
- hidden `slot gt exec stack-branches` and `slot gt exec stack-map-branches`;
- a package-local lazy `SlotGtGateway` boundary plus fake gateway for tests;
- a package-local Graphite metadata reader over Node's built-in `node:sqlite` API;
- local branch-tip support in the TypeScript git gateway for stack-map recent-branch selection.

## Objective Impact

The Graphite row is now complete for the TypeScript slot port. Graphite remains isolated behind the explicit `slot gt` command boundary: plain slot commands do not construct the real Graphite gateway, while `slot gt` operations use Graphite plumbing (`parent`, `children`, `trunk`) and metadata reads rather than parsing human display output.

The hidden `stack-map-branches --format json` result preserves the `sdlcc` consumer shape (`branches`, `trunk`, `current`, `edges`, `slots`, `warnings`, branch `needs_restack`, and slot fields), and the `sdlcc` package check/tests pass against the updated slot package.

## Evidence

- `pnpm --dir ts/packages/slot run test` — passed (105 tests).
- `pnpm --dir ts/packages/slot run check` — passed.
- `pnpm --dir ts --filter sdlcc run check` — passed.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdlcc/test` — passed (32 tests).

## Follow-Ups

- Manual distribution/cutover checks remain in later roadmap rows.
- Node built-in SQLite was available in this workspace (`node:sqlite` under Node 26.3.0), so no npm SQLite dependency was added.
