# Core Gateway Purity Proven

## Summary

The gateway-purity proof for `@sdl/core` now passes. The current `@sdl/core` export set is limited to pure/abstract utility subpaths:

```text
./branch-slug
./clock
./command
./machine-envelope
./managed-region
./markdown-frontmatter
./model-slug
./primitives
./result
./runner-usage
./terminal-escapes
./terminal-presentation
./text-normalization
./text-table
./text-truncation
./time-format
./timers
./xdg-path
```

Source-search evidence found no direct filesystem, subprocess, environment, network, concrete host-time, runtime-boot, or old raw-I/O gateway implementation in `ts/packages/infra/core/src` or the core package manifest. The only focused real-I/O grep hit was the documented false positive in `command.ts`: a comment explaining child-process command branding semantics. A broader `node:` scan found only pure Node library imports (`node:crypto` for hashing and `node:path` for path-string transforms), not host I/O.

The deleted raw-I/O `@sdl/core/*` doors are absent from package exports and live TypeScript/package imports. A precise search found no references to old core doors including `@sdl/core/exec`, `@sdl/core/git`, `@sdl/core/github-*`, `@sdl/core/command-io`, `@sdl/core/progress-phase`, `@sdl/core/cli-entry`, `@sdl/core/stdin`, `@sdl/core/temp-files`, `@sdl/core/xdg`, `@sdl/core/workspace-root`, `@sdl/core/shell-support`, `@sdl/core/text-repair`, `@sdl/core/brmem-cli`, or `@sdl/core/testing`. The earlier broad-prefix scan matched `@sdl/core/xdg-path`; that is an allowed pure path-construction subpath and not the deleted `@sdl/core/xdg` door.

## Objective Impact

This completes the Objective's gateway-purity proof row: `@sdl/core` is now proven pure/abstract for the current repository state, no old raw-I/O core gateway doors remain, live imports do not reference the deleted doors, and `just ts-deps-check` confirms the TypeScript dependency graph remains valid/acyclic under the repo dependency rules.

Validation run:

```text
just ts-deps-check
```

Outcome: passed.

## Follow-Ups

The final capability package/import-layout reorganization remains open and intentionally deferred for a later decision/slice. The Objective remains open; no `closed.md` or Objective closure section was written.
