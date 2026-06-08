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

- Node v24.12+ remains the supported TypeScript runtime baseline inherited from the tooling contract. Implementation evidence used Node v24.12.0 for direct `.ts` entrypoint and import smoke validation.
- Native Node TypeScript type stripping remains the desired project-local runtime strategy; source `.ts` entrypoints and package exports stay erasable-only without a build step by default.
- The pnpm workspace source-link layout continues to let project-local packages import explicit `.ts` exports across package links; checked-in smoke coverage now exercises the relevant project-local Pi adapter and workspace import paths.
- The completed Vitest migration removed the test-runner need for Bun types; remaining active Bun references in this slice are classified as generic runner safety handling or out-of-scope prose/template cleanup rather than runtime blockers.
- The current `sqlite3` CLI Graphite metadata reader remains the selected policy. Evidence showed `sqlite3` is available locally while `node:sqlite` still emits an experimental warning, so there is no runtime-compatibility reason to replace the CLI reader in this Objective.

Risks:

- Direct `.ts` CLI bin execution risk is de-risked for the supported runtime by Node v24.12.0 direct source smoke tests and pnpm exec smoke commands for `asdl-dev` and `planned-branch`.
- Future non-erasable TypeScript syntax is mitigated by `compilerOptions.erasableSyntaxOnly: true` plus the TypeScript workspace check.
- Pi extension loading across workspace package boundaries is de-risked for project-local workspace usage by Node-backed import smoke tests. Published-package or non-workspace install guarantees remain parked outside this Objective.
- Replacing the `sqlite3` CLI reader with `node:sqlite` would still introduce experimental warning noise, so the accepted policy is to keep the existing adapter-bound external CLI reader.
- Bun command fallback risk is resolved for active TypeScript runtime paths by replacing the `bunx vercel@latest` fallback with `pnpm dlx vercel@latest`; remaining Bun-shaped hits are classified rather than broadened into template/prose cleanup.

## Open Questions

- CLI `bin` entries continue to point directly at `.ts` source files. The supported launch path is Node v24.12+ native type stripping, with committed Node shebangs and smoke coverage rather than JavaScript build artifacts.
- `erasableSyntaxOnly` is now the compiler guardrail, backed by representative Node execution/import smoke tests for CLI and Pi extension runtime surfaces.
- The Graphite metadata reader remains on the external `sqlite3` CLI. `node:sqlite` is not adopted because it still emits an experimental warning and no concrete Node runtime incompatibility required replacement.
- Remaining Bun references are classified as generic runner handling (`node|bun` executable-name checks and `/$bunfs/root/` safety filtering), active guidance that explicitly forbids Bun tests, or unrelated substring/prose/template material for the broader Bun-reference reconciliation Objective.

## Closure

Completed as a focused Node runtime compatibility slice. Evidence includes Node v24.12.0 direct execution of `ts/packages/asdl-dev/src/cli.ts --help` and `ts/packages/planned-branch/src/cli.ts --help`, pnpm exec smoke for both CLIs after Node shebang changes, `erasableSyntaxOnly` in the TypeScript workspace config, Node-backed Pi extension/workspace import smoke coverage, replacement of the active Vercel `bunx` fallback with `pnpm dlx`, and reaffirmation of the external `sqlite3` CLI Graphite metadata policy. Validation passed with the TypeScript workspace check, full Vitest workspace suite, `just ts-test`, and dprint check. Follow-up broad Bun-reference reconciliation remains outside this Objective.
