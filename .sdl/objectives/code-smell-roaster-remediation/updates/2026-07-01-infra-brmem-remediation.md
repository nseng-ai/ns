# Infra brmem remediation

## Summary

Re-probed and fixed the brmem findings from `references/infra.md`:

- `resolveOptionalNamespaceScope` and `resolveRequiredNamespaceScope` centralize the shared `--base`/`--namespace` conflict and scoped-vs-all namespace resolution used by list, gc, and copy.
- `EntryCoordinate`, `EntryQueryOptions`, and `EntryWriteOptions` name the repeated namespace/key/branch gateway shapes across the gateway contract and real/fake implementations.
- `buildErrorInfo` removes the duplicated `BrmemErrorInfo` construction from regular and optional error wrappers.
- `FLAT_SEPARATOR` moved to `ref-constants.ts` so ref encoding/decoding and branch validation share the branch-flattening separator without an import cycle.
- `loadSnapshotState` centralizes optional-SHA snapshot loading in the real Git gateway, and `copySnapshot` now uses the destination SHA already resolved by `copyEntries`.

Validation passed after formatting: `pnpm --dir ts --filter @sdl/brmem run check`, `pnpm --dir ts --filter @sdl/brmem run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check` on 2026-07-01. Initial `just ts-format-check` found formatting issues in brmem files; `just ts-format-fix` was run and validation then passed.

## Objective Impact

This reduces the open `infra` cluster by fixing all five brmem findings without changing observable brmem CLI/gateway behavior. The infra row remains open for the remaining clinkr, git, graphite, cli-runtime, cli-theme, core, github, test-kit, time, and exec findings.

## Follow-Ups

Continue the `infra` cluster as package-local sub-slices. Re-check `ts-cli-core-structural-cleanup` ownership before touching Git/GitHub/Graphite-adjacent infra findings, per the roadmap guidance.
