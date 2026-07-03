# Active Bun Package-Manager Inventory

## Summary

The active Bun package-manager surfaces for this Objective are now classified.

Owned by the pnpm workspace migration:

- `ts/bun.lock` and `docs-site/bun.lock` are the Bun lockfiles to replace with pnpm lockfile state for their separate package-manager surfaces.
- `ts/package.json` currently uses Bun workspace orchestration: `workspaces: ["packages/*"]`, `bun run --workspaces` scripts for `check` and `test`, `bun run packages/asdl-dev/src/cli.ts` for `asdl-dev`, `@types/bun`, and Bun-style `patchedDependencies` for `@earendil-works/pi-ai@0.78.0`.
- `ts/packages/*/package.json` files use Bun test scripts, but only the package-manager script wiring belongs here; `bun:test` API conversion remains Vitest migration work.
- `justfile` owns root orchestration commands for `ts-install`, `ts-check`, `ts-test`, `docs-install`, `docs-dev`, `docs-build`, `docs-check`, and `link-planned-branch`; these should move to directory-scoped pnpm commands while keeping the root orchestration-only.
- `.github/workflows/ci.yml` uses `oven-sh/setup-bun`, `bun install --cwd ... --frozen-lockfile`, and `bun run --cwd ...` for the TypeScript and docs jobs; these should become pnpm setup/install/run steps.
- `vercel.json`, `docs-site/vercel.json`, and `docs-site/README.md` contain active docs-site install/build command contracts and should migrate to pnpm while preserving `docs-site/` as a standalone surface.
- `ts/packages/asdl-dev/README.md` has active agent/user command examples using `bun run --cwd ts asdl-dev ...`; these should become pnpm workflow examples.

Classified out of this Objective:

- `bun:test` imports across TypeScript tests and the semantic conversion of `bun test --sequential` are Vitest migration work.
- `#!/usr/bin/env bun` CLI shebangs in `ts/packages/asdl-dev/src/cli.ts` and `ts/packages/planned-branch/src/cli.ts`, the `bunx vercel@latest` fallback in `asdl-dev`, and generic runtime acceptance of `node|bun` are Node runtime compatibility work unless package-manager command wiring requires a narrow transitional edit.
- Bun-centric skill templates under `skills/create-bun-typescript-project/` and broad historical docs such as the internal PR-stack retrospective are Bun-reference reconciliation work, not package-manager migration prerequisites.

## Objective Impact

The first roadmap item is complete. The next implementation slice can migrate `ts/` to pnpm using the settled separate-surface contract, with explicit follow-through for lockfiles, workspace metadata, Node v24.12+ engine/package-manager metadata, package scripts, and patch metadata.

The inventory also narrows the patch risk: the current Bun patch is `ts/patches/@earendil-works%2Fpi-ai@0.78.0.patch`, referenced from `ts/package.json` as a patched dependency. The migration must either translate that patch into pnpm-native patch metadata or record evidence that representative Pi dependency/extension coverage makes the patch unnecessary.

## Follow-Ups

- Migrate `ts/` to pnpm workspace metadata and lockfile state before changing docs-site commands, so dependency and patch behavior is understood first.
- Keep test API imports and matcher/mocking conversion for the Vitest child Objective even if package scripts need temporary pnpm wrappers.
- Keep CLI shebang and `bunx` fallback hardening for the Node runtime compatibility child Objective unless a package-manager command cannot work without a narrow coordinated change.
- Update docs-site Vercel commands and `asdl-dev` README examples when the corresponding pnpm commands exist.
