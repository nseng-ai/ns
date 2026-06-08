# Roadmap

## Work

- [x] Inventory active Bun package-manager surfaces for `ts/`, root orchestration, and `docs-site`.
      Evidence: active package-manager surfaces are `ts/bun.lock`, `docs-site/bun.lock`, root and docs-site Vercel command configuration, Bun-backed `justfile` and CI commands, `ts/package.json` workspace/scripts/patch metadata, and command docs for `asdl-dev` and docs-site. Test imports/scripts, Bun shebang/runtime fallback behavior, and Bun-centric templates are classified as sibling Objective work.

- [x] Migrate `ts/` to the settled pnpm workspace contract.
      Evidence: `ts/pnpm-workspace.yaml` now declares `packages/*`, `ts/package.json` declares `pnpm@10.14.0` and Node `>=24.12.0` engine metadata with pnpm root orchestration scripts, `ts/pnpm-lock.yaml` is committed lockfile state, and `ts/bun.lock` is removed. Direct `pnpm install --frozen-lockfile`, `pnpm run check`, and transitional `pnpm run test` validation passed from `ts/`; local Node v24.2.0 produced the expected unsupported-engine warning.

- [x] Preserve or retire the current Pi dependency patch with evidence.
      Evidence: the existing `@earendil-works/pi-ai@0.78.0` patch is preserved as pnpm-native workspace metadata in `ts/pnpm-workspace.yaml`; `ts/pnpm-lock.yaml` records the exact-version patch with a `patch_hash`, so patch application is represented by pnpm instead of removed.

- [ ] Migrate root orchestration and `justfile` TypeScript commands to directory-scoped pnpm.
      Keep the root orchestration-only. Replace active Bun invocations for TypeScript workspace commands with explicit pnpm commands rooted in `ts/`, and leave test-runner semantics to the Vitest Objective when possible.

- [ ] Migrate `docs-site/` package-manager and deploy commands to pnpm.
      Keep `docs-site/` as a standalone pnpm-managed surface. Update local scripts, lockfile/package-manager metadata, and deploy/build command configuration in scope for package-manager migration.

- [ ] Update user-facing and agent-facing command documentation for the pnpm workflow.
      Document the Node v24.12+ baseline, how to install and run the TypeScript workspace and docs-site commands, and any intentional temporary state that remains for sibling migration Objectives.

- [ ] Record dependency-resolution and command evidence after migration.
      Capture meaningful findings from representative installs, script runs, docs-site build/deploy command checks, and patch handling. Evidence belongs in Semantic Updates, not as routine validation-only roadmap rows.

## Parked

- [ ] Collapse `ts/` and `docs-site/` into one pnpm workspace only if implementation evidence invalidates the settled separate-surface contract.
- [ ] Remove the Pi dependency patch only after representative dependency and Pi extension evidence proves it unnecessary.
- [ ] Convert `bun:test` imports, mocks, lifecycle hooks, and matcher semantics only in the Vitest migration child Objective.
