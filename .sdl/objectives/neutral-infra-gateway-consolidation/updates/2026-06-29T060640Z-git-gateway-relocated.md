# Git Gateway Relocated

## Summary

The `git` gateway relocation slice is implemented. The capability-facing git interface, pure helpers, local-branch ref-reader utility, and in-memory fake now live behind `@sdl/capability-kit/git` and `@sdl/capability-kit/git/testing`. The real process-backed adapter now lives in the new standalone `@sdl/git` package as `RealGitGateway`.

The old `@sdl/core/git` implementation files were removed, and `@sdl/core` no longer exports `./git` or `./git/testing`. All former `@sdl/core/git` and `@sdl/core/git/testing` consumers were repointed to the capability-kit seam/fake or to `@sdl/git` for the real adapter. `ts/packages/kernel/src/sdk/module-loader.ts` now aliases `@sdl/git` instead of the removed core git door.

Validation evidence:

- `rg '@sdl/core/git(?:"|/testing)' ts/packages -n` produced no matches.
- `rg '"\\./git"|"\\./git/testing"' ts/packages/infra/core/package.json -n` produced no matches.
- `just ts-deps-check`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-test`
- `just ts-test-integration`

## Objective Impact

This completes the roadmap row for relocating `git` per ADR 0019 and removes one raw real-world-I/O door from `@sdl/core`. The remaining open gateway relocation rows are now `exec`, GitHub-family gateways, standalone `@sdl/graphite`/`@sdl/cmux` assessment, SDK-provided services, and residual pure/runtime subpaths.

The package-tier guard now records explicit temporary debt edges for neutral-infra consumers that depend on the new capability-kit git seam during this migration: `@sdl/git`, `@sdl/brmem`, and `@sdl/graphite` -> `@sdl/capability-kit`. These should be revisited with the final package-placement/dependency-direction cleanup rather than hidden by a compatibility shim in `@sdl/core`.

## Follow-Ups

- In the `exec` relocation slice, avoid reintroducing any `@sdl/core/git` shim or compatibility door.
- Revisit the explicit package-tier debt edges once the gateway placement model has settled across `git`, `exec`, GitHub, Graphite, and cmux.
- Decide whether extension-facing construction of `RealGitGateway` should remain `new RealGitGateway(new SdlCommandExecApi(ctx))` at call sites or move to a non-cyclic factory home after the real-adapter placement story is complete.
