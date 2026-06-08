# Roadmap

## Work

- [x] Inventory active Bun package-manager surfaces for `ts/`, root orchestration, and `docs-site`.
      Evidence: active package-manager surfaces are `ts/bun.lock`, `docs-site/bun.lock`, root and docs-site Vercel command configuration, Bun-backed `justfile` and CI commands, `ts/package.json` workspace/scripts/patch metadata, and command docs for `asdl-dev` and docs-site. Test imports/scripts, Bun shebang/runtime fallback behavior, and Bun-centric templates are classified as sibling Objective work.

- [x] Migrate `ts/` to the settled pnpm workspace contract.
      Evidence: `ts/pnpm-workspace.yaml` now declares `packages/*`, `ts/package.json` declares `pnpm@10.14.0` and Node `>=24.12.0` engine metadata with pnpm root orchestration scripts, `ts/pnpm-lock.yaml` is committed lockfile state, and `ts/bun.lock` is removed. Direct `pnpm install --frozen-lockfile`, `pnpm run check`, and transitional `pnpm run test` validation passed from `ts/`; local Node v24.2.0 produced the expected unsupported-engine warning.

- [x] Preserve or retire the current Pi dependency patch with evidence.
      Evidence: the existing `@earendil-works/pi-ai@0.78.0` patch is preserved as pnpm-native workspace metadata in `ts/pnpm-workspace.yaml`; `ts/pnpm-lock.yaml` records the exact-version patch with a `patch_hash`, so patch application is represented by pnpm instead of removed.

- [x] Migrate root orchestration and `justfile` TypeScript commands to directory-scoped pnpm.
      Evidence: root `justfile` TypeScript install/check/test recipes now invoke `pnpm --dir {{justfile_directory()}}/ts`, `link-planned-branch` uses `pnpm link`, and the CI `typescript` job sets up pnpm/Node, caches `ts/pnpm-lock.yaml`, and uses `pnpm --dir ts install --frozen-lockfile` plus pnpm check/test runners. Bun remains only as transitional test-runtime setup for package-local `bun test --sequential` scripts. Focused validation passed with the expected local Node v24.2.0 unsupported-engine warning.

- [x] Migrate `docs-site/` package-manager and deploy commands to pnpm.
      Evidence: `docs-site/package.json` now declares `pnpm@10.14.0` and Node `>=24.12.0` engine metadata, `docs-site/pnpm-lock.yaml` is committed lockfile state, and `docs-site/bun.lock` is removed. Root docs recipes, the docs-build CI job, both Vercel command configs, and active docs-site deployment command docs now use pnpm while keeping `docs-site/` standalone and the repository root orchestration-only. Focused validation passed with the expected local Node v24.2.0 unsupported-engine warning.

- [x] Update user-facing and agent-facing command documentation for the pnpm workflow.
      Evidence: active `asdl-dev` fallback and submit docs now use `pnpm --dir ts run asdl-dev ...`, the `asdl-dev` README documents the Node `>=24.12.0` and pnpm `>=10.14.0` baseline, planned-branch validation docs now describe the `justfile`/`ts/` pnpm workspace contract instead of an underlying Bun invocation, and docs-site deploy command docs were re-inspected as already pnpm-based. Broad historical/template Bun-reference cleanup and package-local `bun test --sequential` migration remain sibling/later Objective work.

- [ ] Record dependency-resolution and command evidence after migration.
      Capture meaningful findings from representative installs, script runs, docs-site build/deploy command checks, and patch handling. Evidence belongs in Semantic Updates, not as routine validation-only roadmap rows.

## Parked

- [ ] Collapse `ts/` and `docs-site/` into one pnpm workspace only if implementation evidence invalidates the settled separate-surface contract.
- [ ] Remove the Pi dependency patch only after representative dependency and Pi extension evidence proves it unnecessary.
- [ ] Convert `bun:test` imports, mocks, lifecycle hooks, and matcher semantics only in the Vitest migration child Objective.
