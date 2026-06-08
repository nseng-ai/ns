# Dependency and Command Evidence Consolidation

## Summary

Final evidence for the pnpm package-manager migration is now consolidated. Existing Semantic Updates plus the closeout checks cover the meaningful dependency-resolution, patch-handling, and command-surface facts needed by downstream migration work.

Evidence consolidated:

- `ts/package.json` declares `packageManager: pnpm@10.14.0`, Node `>=24.12.0`, pnpm `>=10.14.0`, and root scripts that run package checks/tests through pnpm recursive workspace orchestration.
- `ts/pnpm-workspace.yaml` declares `packages/*` and carries the current `@earendil-works/pi-ai@0.78.0` patch through pnpm-native `patchedDependencies` metadata.
- `ts/pnpm-lock.yaml` records the patched Pi dependency with a `patch_hash`, confirming that the patch is represented by pnpm rather than dropped.
- `docs-site/package.json` declares standalone pnpm metadata and Node/pnpm engine baselines, with `dev`, `check`, `build`, and `preview` scripts owned by the docs surface.
- `.github/workflows/ci.yml` uses `pnpm/action-setup@v6`, `actions/setup-node@v6`, Node `24.12.0`, pnpm caches keyed to `ts/pnpm-lock.yaml` and `docs-site/pnpm-lock.yaml`, and directory-scoped `pnpm --dir ...` install/check/test/build commands.
- Root `justfile` delegates TypeScript and docs commands through `pnpm --dir {{justfile_directory()}}/ts` and `pnpm --dir {{justfile_directory()}}/docs-site`, keeping the repository root orchestration-only.
- `ts/bun.lock` and `docs-site/bun.lock` are absent, while `ts/pnpm-lock.yaml` and `docs-site/pnpm-lock.yaml` are present.

Closeout validation run locally:

- `node --version` -> `v24.2.0`; this remains below the Objective baseline, so pnpm emitted expected unsupported-engine warnings.
- `pnpm --version` -> `10.14.0`.
- `bun --version` -> `1.3.14`, still available for transitional package-local test scripts.
- `just dprint-check` passed.
- `just ts-check` passed through pnpm install/check orchestration for the `ts/` workspace.
- `just js-test` passed through pnpm orchestration over package-local `bun test --sequential` scripts.
- `just docs-check` passed through pnpm and Astro check reported no diagnostics.
- `just docs-build` passed through pnpm and built the docs site.

## Objective Impact

The final non-parked roadmap row is complete. The Objective now has durable evidence for dependency resolution, command shape, patch representation, and expected transitional constraints.

The package-manager contract remains intact:

- `ts/` is the pnpm workspace for TypeScript packages.
- `docs-site/` remains a separate standalone pnpm surface.
- the repository root remains orchestration-only; no root `package.json` or root `pnpm-workspace.yaml` was added.
- the current Pi dependency patch remains preserved rather than retired.

The Objective is closure-ready and was closed inline by this update: all non-parked roadmap rows are complete, completion criteria have evidence, open questions are resolved or carried forward as explicit follow-ups, and remaining Bun-related work belongs to sibling/later Objectives rather than this package-manager slice.

Graphite/local branch evidence for the final command-doc branch also corroborated the latest row before closure: `gt branch info` reported parent `docs-site-pnpm-deploy-command-migration` and PR #1118, with local diff limited to the command-doc files and selected Objective tracking.

## Follow-Ups

- Convert package-local `bun test --sequential` scripts and `bun:test` API usage in the Vitest child Objective.
- Harden TypeScript CLI shebang/runtime compatibility under Node in the runtime compatibility work.
- Reconcile broad historical/template Bun references in the Bun-reference cleanup work.
- Revisit Pi patch retirement only after representative Pi extension/runtime evidence proves the patch unnecessary.
