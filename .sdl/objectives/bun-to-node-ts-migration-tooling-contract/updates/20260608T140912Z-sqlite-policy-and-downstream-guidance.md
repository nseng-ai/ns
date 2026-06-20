# sqlite Policy and Downstream Guidance

## Summary

Decision: the tooling contract does **not** require replacing the current TypeScript Graphite metadata reader's `sqlite3` CLI subprocess with `node:sqlite`. The current `sqlite3` CLI reader remains acceptable for this Objective.

If later Node runtime compatibility work chooses to adopt `node:sqlite`, warning noise must be contained: use `node:sqlite` only behind the Graphite metadata adapter boundary and suppress only the known sqlite warning in that targeted boundary. Do not introduce broad process-wide warning suppression as the default policy.

The settled downstream guidance is:

- pnpm workspace migration owns the separate-surface package-manager migration: `ts/` as a pnpm workspace for `packages/*`, `docs-site/` as a standalone pnpm surface, `packageManager` fields, `ts/package.json` `engines.node >=24.12.0`, `pnpm --dir ...` root orchestration, lockfile generation, Vercel command migration, frozen lockfile use for CI/deploy-style commands, and translating the current Pi patch to pnpm-native patch metadata.
- pnpm migration must preserve workspace source-link behavior so Node native TypeScript type stripping can import source `.ts` exports through local workspace package links. Build-to-JavaScript artifacts remain a fallback only if later package-boundary or publishing evidence requires them.
- Patch handling is explicit: preserve the `@earendil-works/pi-ai@0.78.0` patch during migration, then remove it only after dependency evidence and representative Pi extension scenario coverage show the unpatched dependency is safe after the port.
- Vitest migration owns `bun:test` imports, `bun test --sequential` scripts, and Bun-specific test-runner guidance such as the current AGENTS.md Bun test execution note.
- Node runtime compatibility owns CLI shebang/runtime command changes, direct `node` source-entrypoint invocation, `erasableSyntaxOnly`, and any sqlite reader implementation change. If it adopts `node:sqlite`, it must use targeted adapter-boundary warning suppression.
- Bun-reference reconciliation owns remaining docs, templates, and instructional cleanup after package-manager, runtime, and test-runner commands settle. Docs-site Vercel commands are package-manager policy and belong to pnpm migration, but prose/template cleanup can remain downstream reconciliation work.

## Objective Impact

The `node:sqlite` warning policy row is complete. The downstream migration guidance row is also complete because the Objective now gives each child migration a clear owner boundary and concrete input guidance.

This completes the tooling contract Objective's decision set:

- Node baseline: Node v24.12+.
- TypeScript execution strategy: native Node type stripping for project-local CLIs and Pi extension modules, with build artifacts as fallback.
- Package-manager contract: separate pnpm-managed `ts/` and `docs-site` surfaces, with root orchestration through directory-scoped pnpm commands.
- sqlite policy: current `sqlite3` CLI reader remains acceptable; future `node:sqlite` usage must be adapter-isolated with targeted warning suppression.
- Downstream guidance: pnpm, Vitest, Node runtime compatibility, and Bun-reference reconciliation have explicit ownership boundaries.

## Follow-Ups

The Objective is ready for closure if the roadmap and narrative remain consistent after this update.

Downstream work should proceed through the relevant child Objectives rather than reopening this contract unless implementation evidence invalidates a contract premise, especially:

- pnpm cannot preserve source-linked workspace imports under the real implementation layout;
- Node v24.12+ native type stripping rejects source that passed the current probes after implementation changes;
- the Pi patch cannot be represented safely in pnpm;
- targeted `node:sqlite` warning suppression is impossible if a later implementation chooses that route.
