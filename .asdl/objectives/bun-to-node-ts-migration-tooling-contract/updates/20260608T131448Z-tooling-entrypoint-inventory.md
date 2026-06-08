# Tooling Entrypoint Inventory

## Summary

Inventory revalidated on branch `typescript-bun-node-entrypoint-inventory` from repository files and read-only searches.

- Package-manager and workspace surfaces:
  - `justfile` routes TypeScript and docs-site workflows through Bun: `ts-install`, `ts-check`, `ts-test`, `docs-install`, `docs-dev`, `docs-build`, and `docs-check` all call `bun`; `js-test` aliases `ts-test`; `link-planned-branch` runs `bun link` in `ts/packages/planned-branch`.
  - `ts/package.json` is the TypeScript workspace root with `workspaces: ["packages/*"]`, `type: "module"`, Bun-specific scripts for `test`, `check`, and `asdl-dev`, and a patched dependency entry for `@earendil-works/pi-ai@0.78.0`.
  - `ts/bun.lock` and `docs-site/bun.lock` are the active lockfiles. No `pnpm-lock.yaml` or `pnpm-workspace.yaml` exists at the repository root, `ts/`, or `docs-site/`.
- Ambient type and compiler-config surfaces:
  - `ts/package.json` has `@types/node: ^24.0.0`, which already expresses a Node 24 type baseline, and `@types/bun: ^1.3.0`, which keeps Bun ambient types in the workspace contract.
  - `ts/tsconfig.json` uses `module` and `moduleResolution` `NodeNext`, `target`/`lib` `ES2022`, `noEmit: true`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`, `isolatedModules: true`, strict checking, and `types: ["node", "bun"]`.
  - Each package `tsconfig.json` under `ts/packages/*` extends `../../tsconfig.json` and includes `src/**/*.ts` and `test/**/*.ts`.
- Package manifests and source-export surfaces:
  - The five TypeScript package manifests are `ts/packages/asdl-dev/package.json`, `ts/packages/ccc/package.json`, `ts/packages/pi-extension-runtime/package.json`, `ts/packages/pi-extensions/package.json`, and `ts/packages/planned-branch/package.json`.
  - All five packages use `type: "module"`, `scripts.check = "tsc --noEmit -p tsconfig.json"`, and `scripts.test = "bun test --sequential"`.
  - `@asdl/pi-extension-runtime`, `@asdl/ccc`, and `@asdl/planned-branch` export `.ts` source files directly. `@asdl/pi-extensions` depends on workspace packages and keeps Pi packages as peers plus dev dependencies at `0.78.0`.
- CLI, bin, and source-execution surfaces:
  - `ts/packages/asdl-dev/src/cli.ts` and `ts/packages/planned-branch/src/cli.ts` both use `#!/usr/bin/env bun`.
  - `asdl-dev` and `planned-branch` package `bin` entries point directly to `./src/cli.ts`.
  - `ts/package.json` runs the `asdl-dev` CLI with `bun run packages/asdl-dev/src/cli.ts`.
  - `ts/packages/pi-extensions/src/asdl-dev-extension.ts` imports `asdl-dev/src/cli.ts`, so project-local extension loading currently crosses package boundaries through source `.ts` entry points.
- Test-runner surfaces:
  - Package test scripts use `bun test --sequential`.
  - Tests import from `bun:test` across `pi-extension-runtime`, `asdl-dev`, `planned-branch`, `pi-extensions`, and `ccc`.
  - `AGENTS.md` still instructs direct Bun test runs to include `--sequential`.
- Docs-site and deployment surfaces:
  - `docs-site/package.json` is a separate private Astro/Starlight package with `astro dev`, `astro build`, `astro preview`, and `astro check` scripts; it carries its own `typescript: 6.0.3` dev dependency.
  - Root `vercel.json` installs and builds the docs site with `bun install --cwd docs-site --frozen-lockfile` and `bun run --cwd docs-site build`.
  - `docs-site/vercel.json` uses `bun install --frozen-lockfile` and `bun run build` for the docs-site-root deployment mode.
  - `docs-site/README.md` documents the Bun-based Vercel install/build commands.
- sqlite and Graphite metadata surfaces:
  - No TypeScript `node:sqlite` import is present.
  - `ts/packages/pi-extensions/src/worktree-status/graphite-metadata.ts` reads Graphite metadata by spawning the `sqlite3` CLI with `spawnSync("sqlite3", ["-json", dbPath, query], ...)`.
  - `ts/packages/pi-extensions/test/worktree-status-fixtures.ts` also shells out to `sqlite3` for fixtures.
  - Python `asdl_core.gt` uses the standard-library `sqlite3` module, but that is outside this TypeScript tooling contract except as background evidence that the sqlite policy question is not exclusively TypeScript source-execution work.

Policy-setting facts are the Bun-routed top-level `justfile`, the split `ts/` and `docs-site` package-manager surfaces, Bun lockfiles, workspace patch handling, no-emit TypeScript config with Bun ambient types, direct `.ts` bins and exports, Bun shebangs, Vercel Bun commands, and current sqlite CLI reliance. Implementation chores deferred to later Objectives include manifest and lockfile migration, `bun:test` conversion, shebang/bin rewrites, build-output introduction, Vercel command changes, docs cleanup, and sqlite reader replacement.

## Objective Impact

The first roadmap item, inventorying current TypeScript tooling entry points and recording contract-relevant facts, is complete.

This evidence sharpens the remaining contract decisions:

- The Node baseline and TypeScript execution/build policy must account for direct `.ts` bin targets, Bun shebangs, source `.ts` package exports, project-local Pi extension imports across source paths, `noEmit` TypeScript configuration, explicit `.ts` import compatibility, and globally available Bun ambient types.
- The pnpm workspace contract must decide how to represent the `ts/` workspace, whether and how to include the separate `docs-site` surface, how to replace the two Bun lockfiles, how top-level `justfile` and Vercel commands should invoke package-manager operations, and how to preserve the patched Pi dependency behavior.
- The Vitest migration owns converting `bun:test` imports and `bun test --sequential` scripts; this inventory records the surface area but does not change it.
- The Node runtime compatibility work owns runtime hardening and any replacement of the Graphite metadata reader. The current TypeScript implementation depends on the external `sqlite3` CLI, while `node:sqlite` remains a forward-looking policy question rather than existing TypeScript usage.
- Bun-reference reconciliation owns cleanup of documentation, templates, and instructional references after the tooling contract decides the desired package-manager and runtime commands.

## Follow-Ups

Next roadmap item: decide the Node baseline and TypeScript execution/build policy.

Open questions for that decision:

- Should `asdl-dev` and `planned-branch` continue to expose source `.ts` bins, use Node native TypeScript support, run through a loader, or build JavaScript artifacts?
- Should project-local Pi extension package exports share the CLI execution strategy, or should extensions have a narrower source-export compatibility contract?
- Should Bun ambient types stay globally available during transition, or should later work isolate actual Bun API usage from ambient compatibility?
- Should the package-manager contract combine `ts/` and `docs-site` under one pnpm workspace, or keep docs-site as a related but separately migrated surface?
- Should the Graphite metadata reader keep using the external `sqlite3` CLI, move to `node:sqlite`, or be isolated behind an adapter with a separate warning policy?
