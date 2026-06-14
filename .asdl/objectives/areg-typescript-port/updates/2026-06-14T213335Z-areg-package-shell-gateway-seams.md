# areg TypeScript package shell and gateway seams established

## Summary

Created the initial `@asdl/areg` TypeScript workspace package as a standalone `areg` CLI shell without cutting over any public callers or modifying the Python reference implementation.

Implemented in this slice:

- `ts/packages/areg/package.json` and package-local `tsconfig.json` following existing TS workspace conventions.
- `src/cli.ts` with standalone `areg` identity, `0.1.0` version output, TypeScript runtime diagnostics, `buildCli()`, `runCli(args, deps)`, direct-invocation handling, and hidden `exec skillx` group structure with no placeholder operations.
- Package-local gateway contracts for the finite next-slice seams: host tool/Git-root checks, GitHub skill directory listing, `npx skills add`, and transient skillx workspace installation.
- Constructor-state fake gateways with copied mutable inputs/outputs and read-only operation logs where there is no durable state to inspect.
- Scenario/gateway/unit tests covering CLI shape, package metadata, and fake seam behavior.
- `ts/pnpm-lock.yaml` workspace importer metadata for the new package.

Focused validation passed:

- `pnpm --dir ts --filter @asdl/areg run check`
- `pnpm --dir ts --filter @asdl/areg run test`

## Objective Impact

The package-shell roadmap row is complete for the finite seams needed before the hidden `exec skillx` port. Python `packages/areg` remains the active reference implementation; no public caller or top-level `asdl` mounting was changed.

Filesystem and project-config gateways are intentionally deferred to the first command slices that consume them (`check`, `init`, `update-skills`, or `command`). This avoids speculative abstractions while preserving the contract-inventory finding that those later rows need explicit boundaries.

## Follow-Ups

- Port hidden `areg exec skillx` helpers next using the package-local GitHub, `npx skills`, host, and skillx workspace seams added here.
- Replace the deferred real gateway adapters with real subprocess/filesystem-backed adapters when a command first consumes each seam.
- Add filesystem and project-config gateway contracts only at the first consuming command slice, keeping them package-local until a second proven consumer justifies extraction.
