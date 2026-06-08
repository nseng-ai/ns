# Roadmap

## Work

- [x] Inventory current TypeScript tooling entry points and record the contract-relevant facts.
      Focus on package manifests, workspace boundaries, lockfiles, `justfile` targets, TypeScript CLI launch paths, project-local Pi extension loading, docs-site scripts, and any current Bun-only assumptions that affect policy. Evidence should distinguish policy-setting facts from implementation chores for later child Objectives.

- [x] Decide the Node baseline and TypeScript execution/build policy.
      Use Node v24.12+ as the TypeScript tooling runtime baseline. Keep project-local TypeScript CLIs and Pi extension modules on native Node type stripping with erasable-only TypeScript source; defer build-to-JavaScript artifacts unless later package-boundary evidence requires them.

- [x] Decide the pnpm workspace contract for downstream migration.
      Use separate pnpm-managed surfaces: `ts/` as a pnpm workspace for `packages/*`, and `docs-site/` as a standalone pnpm surface. Root remains orchestration-only through directory-scoped pnpm commands. Preserve workspace source-link behavior for Node type stripping, translate the current Pi patch to pnpm-native patch metadata, enforce Node v24.12+ through `ts/package.json` engines plus docs guidance, migrate docs-site Vercel commands to pnpm, and leave Vitest/test-runner conversion to its downstream Objective.

- [x] Decide the `node:sqlite` warning policy.
      Keep the current `sqlite3` CLI reader acceptable. If later Node runtime compatibility work adopts `node:sqlite`, isolate it behind the Graphite metadata adapter boundary and suppress only the known sqlite warning in that targeted boundary.

- [x] Update downstream migration guidance from the settled tooling contract.
      Downstream guidance is recorded for pnpm workspace migration, Vitest migration, Node runtime compatibility, and Bun-reference reconciliation. Reopen contract work only if implementation evidence invalidates a recorded premise.

## Parked

- [ ] Reconsider npm plus Node's built-in test runner only if pnpm or Vitest proves unsuitable during contract investigation.
- [ ] Redesign Bun-centric project templates only if the Bun-reference reconciliation child Objective determines those templates are inside the migration target.
