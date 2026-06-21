# defineCli Migration Evidence Rebaseline

## Summary

The shared CLI entrypoint migration is already present in the checkout: `defineCli` is implemented in `ts/packages/sdl-core/src/cli-entry.ts`, all 15 `ts/packages/*/src/cli.ts` entrypoints consume it, and the previous hand-written `const VERSION` / `runtimeInfo` / `readPackageVersion` boilerplate was not found in those entrypoints.

The row remains in-progress rather than complete because the roadmap's strict parity target still asks for `--version`, `--runtime`, and help coverage for every CLI, and package-local `sdlcc` `--runtime` coverage was not found during this rebaseline.

## Objective Impact

This supersedes the older uncertainty that fleet-wide migration itself still remained. The durable Objective should treat the implementation and migration half of the `defineCli` row as done, with the remaining work narrowed to closing the behavior-parity evidence gap before marking the row complete.

The open question about where `defineCli` should live is resolved by current code: it lives in `@sdl/core/cli-entry`. The `execGroup(description?)` placement question remains active.

## Follow-Ups

- Add or identify package-local `sdlcc` `--runtime` parity coverage.
- Once every CLI has the requested `--version`, `--runtime`, and help evidence, mark the `defineCli` roadmap row complete.
