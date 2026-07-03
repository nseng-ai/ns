# pnpm Workspace Contract

## Summary

Decision: use pnpm for two separate package-manager surfaces rather than one repository-wide workspace.

Contract:

- `ts/` is the TypeScript tooling workspace. It should own `ts/pnpm-workspace.yaml` with `packages/*`, its own `ts/pnpm-lock.yaml`, and `packageManager: pnpm@<chosen-version>` in `ts/package.json`.
- `docs-site/` remains a standalone pnpm-managed surface with its own `docs-site/pnpm-lock.yaml` and `packageManager: pnpm@<chosen-version>` in `docs-site/package.json`.
- The repository root remains orchestration-only. Root `justfile` commands should use explicit directory-scoped pnpm calls such as `pnpm --dir ts ...` and `pnpm --dir docs-site ...`, rather than introducing a root pnpm workspace solely for command dispatch.
- TypeScript tooling should enforce the Node v24.12+ baseline through `engines.node` in `ts/package.json` plus human-facing docs/guidance. A separate root command guard is not required by this contract unless implementation evidence shows it is needed.
- Workspace packages inside `ts/` should continue to use `workspace:*` dependencies. Implementation must preserve pnpm workspace symlink/source-link behavior so Node native TypeScript type stripping imports source `.ts` package exports from workspace package directories rather than copied package contents under real `node_modules` package trees.
- Existing `bun:test` imports and `bun test --sequential` package scripts are explicitly owned by the Vitest migration Objective. The pnpm contract may switch package-manager orchestration to pnpm, but it should not require test-runner conversion.
- Docs-site deployment command migration belongs in this pnpm contract: root `vercel.json` should use `pnpm --dir docs-site install --frozen-lockfile` and `pnpm --dir docs-site run build`; `docs-site/vercel.json` should use `pnpm install --frozen-lockfile` and `pnpm run build`.
- Use frozen lockfiles for CI/deployment-style commands. Keep ordinary local install targets flexible unless an implementation command is explicitly a check/CI path.
- TypeScript CLI launch scripts should call `node` directly for source entrypoints, while pnpm remains responsible for installing dependencies and orchestrating workspace scripts.
- Preserve the current `@earendil-works/pi-ai@0.78.0` patch behavior during migration, but carry a follow-up to remove the patch after the port when dependency evidence and representative Pi extension scenario coverage prove it unnecessary.

Probe evidence gathered on the current branch, then cleaned up before this update:

- `pnpm v10.14.0` was available locally.
- Creating a temporary `ts/pnpm-workspace.yaml` and running `cd ts && pnpm install --lockfile-only --ignore-scripts` resolved all six `ts/` workspace projects and produced `link:` entries for workspace packages.
- The existing Bun top-level `patchedDependencies` field was ignored by pnpm: the generated lockfile had no `patchedDependencies` entry and no patch path.
- Adding temporary pnpm-native metadata under `pnpm.patchedDependencies` caused the generated lockfile to record the patch path and `patch_hash` for `@earendil-works/pi-ai@0.78.0`, confirming the migration must translate the patch metadata rather than copy the Bun field unchanged.
- Running `cd ts && pnpm install --ignore-scripts --modules-dir .pnpm-probe-node_modules` generated alternate module directories without rewriting the existing Bun `node_modules` directories. The generated package-level symlinks pointed workspace dependencies to source package directories, e.g. `@asdl/ccc -> ../../../ccc`, `@asdl/pi-extension-runtime -> ../../../pi-extension-runtime`, `@asdl/planned-branch -> ../../../planned-branch`, and `asdl-dev -> ../../asdl-dev`.
- Temporarily overlaying those alternate module directories as `node_modules` and restoring the originals immediately afterward allowed Node native TypeScript imports to succeed for `asdl-dev/src/cli.ts`, `@asdl/ccc/handoff-tab`, `@asdl/ccc`, `@asdl/pi-extension-runtime`, and `asdl-dev/src/cli.ts` from the `pi-extensions` package context. Local Node was still v24.2, so the expected type-stripping warning appeared, but the imports succeeded.
- `cd docs-site && pnpm install --lockfile-only --ignore-scripts` resolved the docs-site package as a standalone pnpm surface.
- All generated pnpm probe artifacts were removed before recording this update; kept branch changes remain Objective Markdown only.

## Objective Impact

The pnpm workspace/package-manager contract roadmap item is complete.

This contract keeps the package-manager migration small and explicit: `ts/` and `docs-site/` both move from Bun to pnpm, but they do not become one root workspace. It also preserves the Node type-stripping decision by requiring pnpm workspace links for source `.ts` package exports, while leaving Vitest conversion and most Bun-reference cleanup to their downstream Objectives.

The probe changed one important implementation detail: the Bun top-level `patchedDependencies` field is not sufficient for pnpm. Downstream implementation must translate it to pnpm-native patch metadata, and later cleanup should remove the patch only after the Node/pnpm port proves it unnecessary with representative validation.

## Follow-Ups

Next roadmap item: decide the `node:sqlite` warning policy.

Inputs carried to downstream migration Objectives:

- pnpm workspace migration owns `ts/pnpm-workspace.yaml`, `ts/pnpm-lock.yaml`, `docs-site/pnpm-lock.yaml`, `packageManager` fields, Node `engines`, root `justfile` command migration, Vercel install/build command migration, and pnpm patch metadata translation.
- Vitest migration owns `bun:test` imports and `bun test --sequential` scripts.
- Node runtime compatibility owns CLI shebang/runtime changes and any runtime hardening beyond the package-manager contract.
- Bun-reference reconciliation owns remaining docs/templates/instructions after package-manager and runtime commands settle.
