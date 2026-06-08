# Bun-to-Node TypeScript Migration: Node Runtime Compatibility

## Thesis

The Bun-to-Node TypeScript migration needs a focused runtime-compatibility slice after the pnpm and Vitest work. The TypeScript workspace now installs and tests through pnpm/Vitest, but some project-local CLIs, Pi extension modules, and supporting adapters still carry Bun-era runtime assumptions.

This child Objective owns hardening those active runtime paths for the settled Node v24.12+ native TypeScript type-stripping contract. The goal is that project-local TypeScript CLIs and Pi extension modules can be launched, imported, and smoke-tested under Node without relying on Bun shebangs, Bun ambient runtime APIs, or accidental compatibility from the old test runner.

## Scope

This Objective covers Node runtime compatibility for the active TypeScript workspace under `ts/`:

- replace active Bun shebangs and Bun-specific CLI launch assumptions for project-local TypeScript CLI entrypoints such as `asdl-dev` and `planned-branch`;
- preserve the native Node type-stripping strategy selected by the tooling contract, including explicit `.ts` imports, erasable-only TypeScript source, and Node v24.12+ as the supported runtime baseline;
- add or update smoke coverage that exercises representative CLI and Pi extension entrypoints under Node rather than Bun;
- audit active TypeScript source for Bun-only runtime APIs or generic `node|bun` fallbacks that should become Node-centered behavior;
- decide what runtime compatibility work, if any, is needed for the Graphite metadata reader that currently shells out to `sqlite3`, including whether to keep the CLI reader or replace it behind the adapter boundary;
- record any Node warning, source-link, `import.meta.main`, shebang, package-bin, or sqlite compatibility evidence that downstream work needs.

## Non-Goals

- Do not redo the pnpm workspace/package-manager migration or change the separate `ts/` and `docs-site/` package-manager surfaces.
- Do not redo the Vitest migration or change test-runner semantics except to add runtime smoke coverage where needed.
- Do not reconcile every historical, template, or prose Bun reference; broad cleanup belongs to the Bun-reference reconciliation child Objective.
- Do not migrate Python tooling or Python runtime behavior.
- Do not redesign Pi itself or the installed Pi package runtime beyond project-local extension compatibility.
- Do not introduce build-to-JavaScript artifacts unless Node runtime evidence proves native type stripping cannot satisfy a concrete project-local runtime path.
- Do not add broad process-wide warning suppression. If `node:sqlite` is adopted, warning handling must stay targeted to the Graphite metadata adapter boundary.

## Completion Criteria

This Objective is complete when:

- active project-local TypeScript CLI entrypoints no longer require Bun shebangs or Bun launch commands for their supported Node path;
- Node v24.12+ native TypeScript execution assumptions are enforced or tested strongly enough to catch non-erasable runtime syntax before it reaches users;
- representative Pi extension modules and local CLI entrypoints have Node-backed smoke coverage or equivalent validation evidence;
- active TypeScript source has been audited for Bun-only runtime APIs, and any remaining Bun references are deliberately classified as out-of-scope template/prose cleanup or documented fallback behavior;
- the Graphite metadata reader runtime policy is implemented or explicitly reaffirmed with evidence, including targeted warning policy if `node:sqlite` is used;
- Semantic Updates record the runtime compatibility evidence, any assumptions invalidated by implementation, and follow-ups for the Bun-reference reconciliation child Objective.

## Assumptions and Risks

Assumptions:

- Node v24.12+ remains the supported TypeScript runtime baseline inherited from the tooling contract.
- Native Node TypeScript type stripping remains the desired project-local runtime strategy; source `.ts` entrypoints and package exports should stay erasable-only rather than requiring a build step by default.
- The pnpm workspace source-link layout continues to let project-local packages import explicit `.ts` exports without placing TypeScript source under real non-workspace `node_modules` package contents.
- The completed Vitest migration removed the test-runner need for Bun types, so remaining Bun references are more likely runtime launch paths, fallback commands, docs/templates, or historical prose.
- The current `sqlite3` CLI Graphite metadata reader is acceptable unless this Objective finds Node runtime compatibility evidence that justifies replacing it.

Risks:

- Direct `.ts` CLI bin execution may need careful shebang or wrapper handling because Node's native TypeScript support has version-specific behavior around `import.meta.main`, executable scripts, and warning output.
- Future non-erasable TypeScript syntax could silently break runtime entrypoints if `erasableSyntaxOnly` or equivalent checks are not enforced.
- Pi extension loading may cross package boundaries in ways that work in the workspace but not in installed or non-symlinked dependency layouts; this Objective should distinguish project-local compatibility from publish/install guarantees.
- Replacing the `sqlite3` CLI reader with `node:sqlite` could introduce experimental warning noise; broad warning suppression would be worse than keeping the current CLI reader.
- Bun command fallbacks such as `bunx` may still appear in active source for third-party tool execution; the Objective must decide whether those are runtime migration targets or deliberate non-Node package-manager fallbacks.

## Open Questions

- Should CLI `bin` entries continue to point directly at `.ts` source files under Node, or should the supported launch path use package scripts/wrappers that invoke `node` explicitly?
- Is adding `erasableSyntaxOnly` to `tsconfig.json` sufficient runtime guardrail, or do representative Node smoke tests need to import or execute every exported CLI/extension surface?
- Should the Graphite metadata reader remain on the external `sqlite3` CLI, or should this Objective replace it with `node:sqlite` behind the existing adapter boundary and targeted warning handling?
- Which remaining active Bun references are runtime blockers versus deliberate template guidance or historical prose for the later Bun-reference reconciliation Objective?
