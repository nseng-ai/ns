# Docs Site pnpm Migration

## Summary

The standalone `docs-site/` package-manager and deploy command surface now uses pnpm instead of Bun.

Changed files:

- `docs-site/package.json` adds `packageManager: pnpm@10.14.0` plus Node `>=24.12.0` and pnpm `>=10.14.0` engine metadata.
- `docs-site/pnpm-lock.yaml` is the new committed docs-site lockfile state.
- `docs-site/bun.lock` is removed.
- `justfile` docs recipes now run directory-scoped `pnpm --dir {{justfile_directory()}}/docs-site ...` commands.
- `.github/workflows/ci.yml` `docs-build` now uses `pnpm/action-setup@v6`, `actions/setup-node@v6` with Node `24.12.0`, cache dependency path `docs-site/pnpm-lock.yaml`, frozen pnpm install, and pnpm check/build commands.
- `vercel.json` and `docs-site/vercel.json` now use pnpm install/build commands for repository-root and docs-site-root Vercel modes.
- `docs-site/README.md` updates only the active Vercel deployment command lines to match the root-directory pnpm deploy commands.
- `.asdl/objectives/bun-to-node-ts-migration-pnpm-workspace/roadmap.md` marks the docs-site package-manager/deploy row complete.

Dependency resolution did not require package metadata changes beyond the planned `packageManager`, `engines`, and lockfile migration. pnpm emitted the expected local unsupported-engine warning because the shell Node version was `v24.2.0`, below the Objective baseline `>=24.12.0`; the CI docs-build job requests Node `24.12.0`.

## Objective Impact

The docs-site package-manager/deploy migration roadmap row is complete. `docs-site/` remains a standalone pnpm-managed surface, and the repository root remains orchestration-only: no root `package.json`, root `pnpm-workspace.yaml`, or `ts/pnpm-workspace.yaml` change was introduced.

Validation evidence:

- `node --version` -> `v24.2.0`.
- `pnpm --version` -> `10.14.0`.
- `pnpm --dir docs-site install --lockfile-only --ignore-scripts` generated `docs-site/pnpm-lock.yaml` with the expected local Node engine warning.
- `pnpm --dir docs-site install --frozen-lockfile` passed with the expected local Node engine warning and did not require lockfile updates.
- `just docs-check` passed through pnpm and `astro check` reported 0 errors, 0 warnings, and 0 hints.
- `just docs-build` passed through pnpm and built 21 pages.
- `just dprint-check` passed.
- `test ! -f docs-site/bun.lock` passed.
- Focused command inspection found the docs-site pnpm commands in root docs recipes, docs CI, both Vercel configs, and README deployment command lines. The only `oven-sh/setup-bun` match in the inspected CI file is the transitional TypeScript test-runtime setup from the prior roadmap row, not the docs-build job.

## Follow-Ups

- Broad user-facing and agent-facing pnpm workflow documentation remains the later roadmap row. This slice only updated active docs-site Vercel deployment command lines.
- Vitest conversion, TypeScript runtime shebang cleanup, and broad Bun-reference reconciliation remain sibling/later work.
- If Vercel root-directory mode later proves unable to select the expected pnpm version without a root package manifest, evaluate an explicit Corepack activation prefix with deployment evidence rather than creating a root workspace.
