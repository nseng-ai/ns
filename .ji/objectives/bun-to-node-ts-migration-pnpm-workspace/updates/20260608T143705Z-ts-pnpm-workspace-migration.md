# TypeScript pnpm Workspace Migration

## Summary

The `ts/` workspace now uses pnpm-native workspace metadata and lockfile state for `packages/*`.

Changed files:

- `ts/package.json` removes Bun/npm-style `workspaces`, moves root orchestration scripts to pnpm, adds `packageManager: pnpm@10.14.0`, and records Node `>=24.12.0` plus pnpm `>=10.14.0` engine guidance.
- `ts/pnpm-workspace.yaml` declares `packages/*` and preserves the existing `@earendil-works/pi-ai@0.78.0` patch as pnpm-native patch metadata.
- `ts/pnpm-lock.yaml` replaces the TypeScript workspace Bun lockfile.
- `ts/bun.lock` is removed.
- `roadmap.md` now marks the `ts/` workspace migration and Pi patch preservation rows complete.

The package-local test scripts intentionally still run `bun test --sequential`; this update changes the root TypeScript workspace runner to pnpm and leaves Vitest/test API semantics to the sibling Objective.

## Objective Impact

The `ts/` workspace package-manager slice is complete. pnpm now discovers the workspace through `pnpm-workspace.yaml`, resolves local packages through default source links, and records lockfile state for the migrated dependency graph.

The current Pi dependency patch was preserved rather than retired. Evidence from `ts/pnpm-lock.yaml` shows `@earendil-works/pi-ai@0.78.0` with a `patch_hash`, confirming pnpm-native representation of the exact-version patch. Representative retirement evidence was not gathered in this slice, so the parked cleanup remains valid for later Node/runtime compatibility work.

Validation evidence:

- `node --version` returned `v24.2.0`; this is below the Objective baseline, so pnpm emitted the expected unsupported-engine warning for `node >=24.12.0`.
- `pnpm --version` returned `10.14.0`.
- `cd ts && pnpm install --frozen-lockfile` passed with the expected Node engine warning and lockfile up to date.
- `cd ts && pnpm run check` passed across the workspace package `tsc --noEmit` checks, with the expected Node engine warning.
- `cd ts && pnpm run test` passed as transitional pnpm orchestration over package-local Bun tests; `pi-extensions` reported 713 passing tests.

## Follow-Ups

- Migrate root `justfile` TypeScript commands and CI TypeScript jobs to directory-scoped pnpm in the later root orchestration roadmap row.
- Migrate `docs-site/` package-manager and deploy commands to pnpm as its standalone surface.
- Update user-facing and agent-facing command documentation, including `asdl-dev` examples, after the relevant pnpm commands exist.
- Convert `bun:test` imports and package-local test runner semantics in the Vitest child Objective.
- Leave CLI shebang and `bunx` fallback hardening to the Node runtime compatibility child Objective.
- Revisit patch retirement only after representative dependency and Pi extension evidence proves the Bun-era patch is unnecessary.
