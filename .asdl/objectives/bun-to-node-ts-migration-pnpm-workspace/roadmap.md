# Roadmap

## Work

- [ ] Inventory active Bun package-manager surfaces for `ts/`, root orchestration, and `docs-site`.
      Distinguish install/lockfile/script/deploy references owned by this Objective from test-runner semantics, runtime hardening, and broad prose/template cleanup that belong to sibling Objectives.

- [ ] Migrate `ts/` to the settled pnpm workspace contract.
      Add pnpm workspace metadata for `packages/*`, package-manager and Node-engine metadata, pnpm lockfile state, and dependency/script changes needed to remove Bun install/run assumptions while preserving source-link behavior for Node v24.12+ native TypeScript type stripping.

- [ ] Preserve or retire the current Pi dependency patch with evidence.
      Translate the existing patch into pnpm-native patch metadata unless representative dependency and Pi extension evidence proves it unnecessary. Record the decision and any downstream cleanup guidance.

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
