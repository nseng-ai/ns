# Node TypeScript Execution Policy

## Summary

Decision: use **Node v24.12+** as the TypeScript tooling runtime baseline and keep project-local TypeScript CLIs and Pi extension modules on **native Node TypeScript type stripping** for now. Do not introduce a loader or build-to-JavaScript step in the contract slice unless later implementation evidence proves native type stripping cannot satisfy a concrete package boundary.

Evidence and probes:

- Local runtime during analysis was `node v24.2.0`.
- `bun run --cwd ts check` passed, preserving the existing TypeScript checker signal.
- `cd ts && ./node_modules/.bin/tsc --noEmit -p tsconfig.json --erasableSyntaxOnly` passed, showing current TypeScript source uses erasable-only syntax compatible with Node's type-stripping model.
- A TypeScript AST probe found no source enum declarations, runtime namespaces, parameter properties, or decorators in `ts/packages/**`.
- Import probes under Node native type stripping successfully imported all `ts/packages/*/src/**/*.ts` files: `asdl-dev`, `ccc`, `pi-extension-runtime`, `pi-extensions`, and `planned-branch` had zero source import failures.
- Package-local import probes for source-export package boundaries succeeded under Node native type stripping, including `@asdl/pi-extension-runtime`, `@asdl/ccc`, `@asdl/planned-branch`, and `asdl-dev/src/cli.ts`, when run from package directories with the current workspace symlink layout.
- Direct CLI entrypoint probes on local Node v24.2.0 did not dispatch because `import.meta.main` is false for `.ts` entrypoints in that release. Node fixed this TypeScript `import.meta.main` bug in v24.3.0, so v24.2 is below the practical minimum for direct `.ts` CLI entrypoints.

External documentation checked:

- Node latest-v24 TypeScript docs describe native TypeScript support as type stripping for erasable syntax, with no type checking, no `tsconfig.json` interpretation, explicit file-extension requirements, `allowImportingTsExtensions` for `tsc`, and refusal to handle TypeScript files under real `node_modules` paths: <https://nodejs.org/docs/latest-v24.x/api/typescript.html>
- Node v24.3.0 release notes include the fix for TypeScript `import.meta.main`: <https://nodejs.org/en/blog/release/v24.3.0>
- Node latest-v24 documentation indicates type stripping becomes stable in the v24 line at v24.12.0; v24.3+ is the practical minimum for this repository's direct `.ts` entrypoints, but v24.12+ is the cleaner baseline for downstream implementation.

Contract details:

- Keep direct source `.ts` execution for project-local CLI and Pi extension development loops.
- Keep `noEmit` as the default TypeScript workspace posture for this Objective.
- Add or require `erasableSyntaxOnly` during implementation so `tsc` prevents non-erasable TypeScript constructs before Node sees them.
- Keep explicit `.ts` import specifiers and `allowImportingTsExtensions`; this matches Node's native TypeScript requirement for explicit extensions.
- Do not rely on `tsconfig` path mapping or transpilation-only features at runtime, because Node native type stripping ignores `tsconfig.json`.
- Treat build-to-JavaScript artifacts as a fallback for published or non-symlinked dependency consumption, not the default project-local contract.

## Objective Impact

The Node baseline and TypeScript execution/build policy roadmap item is complete.

This decision resolves the main execution-policy open question: standalone TypeScript CLIs and project-local Pi extension modules should share the same native Node type-stripping strategy, with Node v24.12+ as the baseline. The contract is narrow enough to preserve the current source-oriented development loop while giving downstream implementation concrete migration work:

- replace Bun shebangs and Bun invocation scripts with Node-compatible entrypoint commands;
- add `erasableSyntaxOnly` to TypeScript checking;
- preserve package-local or workspace symlink layouts that avoid Node's refusal to strip TypeScript under real `node_modules` package contents;
- keep build output out of scope unless later package-manager or publishing work proves it necessary.

The local v24.2 probe surfaced a useful constraint rather than invalidating the plan: earlier v24 releases can import current source but are not acceptable for direct `.ts` CLI entrypoints because of the `import.meta.main` bug and type-stripping warning. That is why the durable baseline is v24.12+, with v24.3+ only as the absolute lower bound implied by the bug fix.

## Follow-Ups

Next roadmap item: decide the pnpm workspace contract for downstream migration.

Questions for that slice:

- Should the implementation enforce Node v24.12+ through `package.json` `engines`, documentation, `justfile` checks, or another mechanism?
- Should `ts/` and `docs-site/` become one pnpm workspace or remain separate package-manager surfaces with coordinated scripts?
- How should pnpm preserve the current workspace symlink behavior for source `.ts` package exports while respecting Node's native type-stripping dependency boundary?
- How should the Bun patch entry for `@earendil-works/pi-ai@0.78.0` be represented under pnpm?
- Which scripts should switch directly to `node`, and which should remain package-manager-mediated commands after the pnpm contract is decided?
