# TypeScript Root pnpm Orchestration

## Summary

Root TypeScript orchestration now delegates to the existing `ts/` pnpm workspace instead of using Bun package-manager commands.

Changed files:

- `justfile` migrates `ts-install`, `ts-check`, and `ts-test` to `pnpm --dir {{justfile_directory()}}/ts ...` while keeping the repository root orchestration-only.
- `justfile` migrates `link-planned-branch` from `bun link` to `pnpm link` and updates the comment/echo text to stop referring to `~/.bun/bin`.
- `.github/workflows/ci.yml` migrates the `typescript` job to `pnpm/action-setup@v6`, `actions/setup-node@v6` with Node `24.12.0`, pnpm cache keying from `ts/pnpm-lock.yaml`, `pnpm --dir ts install --frozen-lockfile`, and pnpm check/test runners.
- `ts/package.json` removes stale `workspaces` and malformed top-level `patchedDependencies`; the patch remains represented in `ts/pnpm-workspace.yaml`.
- `ts/bun.lock` is removed as corrective reconciliation of the already-completed `ts/` workspace row.
- `.asdl/objectives/bun-to-node-ts-migration-pnpm-workspace/roadmap.md` marks the root orchestration row complete.

Preflight found the stale `ts/` migration state noted in the plan: `ts/bun.lock` still existed, and `ts/package.json` still contained `workspaces` plus malformed `patchedDependencies` for `@earendil-works/pi-ai@0.78.0@0.78.0`. Those were repaired before migrating root orchestration.

Validation passed:

- `node --version` -> `v24.2.0`.
- `pnpm --version` -> `10.14.0`.
- `bun --version` -> `1.3.14`.
- `pnpm --dir ts install --frozen-lockfile` passed.
- `just ts-check` passed through pnpm root orchestration.
- `just js-test` passed through pnpm root orchestration over transitional package-local Bun tests; `pi-extensions` reported 713 passing tests.
- `just dprint-check` passed.
- `rg -n 'bun install --cwd ts|bun run --cwd ts|bun link|~/.bun/bin' justfile .github/workflows/ci.yml` returned no matches.

Local pnpm commands emitted the expected unsupported-engine warning because the shell Node version was `v24.2.0`, below the Objective baseline `>=24.12.0`. The CI job now requests Node `24.12.0`; the engine metadata was not weakened.

## Objective Impact

The root TypeScript orchestration roadmap row is complete. Active root `justfile` commands and the CI `typescript` job no longer use Bun for TypeScript dependency installation, lockfile enforcement, or workspace script orchestration.

The repository root remains orchestration-only: no root `package.json` or root `pnpm-workspace.yaml` was added. All pnpm commands are scoped to `ts/`.

Bun remains in the TypeScript CI job only as explicitly named transitional test-runtime setup, because package-local `test` scripts still run `bun test --sequential` until Vitest/test-runner migration work.

## Follow-Ups

- Migrate `docs-site/` package-manager and deploy commands to pnpm as the next separate surface; docs-site Bun commands were intentionally left untouched.
- Update user-facing and agent-facing command documentation, including active `asdl-dev` examples, after the relevant pnpm workflow surfaces are complete.
- Convert `bun:test` imports and package-local test-runner semantics in the Vitest child Objective.
- Leave CLI shebang and runtime compatibility cleanup, including the current Bun shebang for `planned-branch`, to the Node runtime compatibility sibling work.
- Revisit whether `link-planned-branch` should remain a global-link recipe after runtime migration; global-link validation was not run because it mutates user-level pnpm global state.
