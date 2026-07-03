# Update: Address package rename with transitional CLI retained

## Summary

Renamed the active TypeScript package source from `@sdl/pr-address` / `ts/packages/pr-address` to `@sdl/address` / `ts/packages/address` while keeping the standalone `pr-address` binary as the transitional command surface for this slice.

## Decisions / Evidence

- The package manifest is now `@sdl/address` and its workspace tests run from `packages/address/test`.
- In-process consumers and tests now import the curated Capability API from `@sdl/address/api`; no `@sdl/pr-address/api` compatibility alias was added.
- The `pr-address` binary remains installed by `just install-pr-address`, but the shim now points at `ts/packages/address/src/cli.ts`.
- Pi feedback-watch fallback text now points to the renamed source path while still detecting/invoking `pr-address` for transitional compatibility.
- Runtime CLI tests expect `@sdl/address bin pr-address -> ts/packages/address/src/cli.ts` while preserving `Usage: pr-address`.

## Validation

Passed in this working session:

- `pnpm --dir ts --filter @sdl/address run check`
- `pnpm --dir ts --filter @sdl/address run test` (11 files / 68 tests)
