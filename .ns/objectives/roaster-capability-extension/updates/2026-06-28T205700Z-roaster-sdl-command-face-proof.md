# Roaster SDL Command Face Proof

## Summary

Proved Roaster can be exposed as a project-local SDL extension command group with side-effect-light discovery and selected command loading.

Implemented a first representative SDL command contribution:

- `.sdl/extensions/roaster/package.json` declares group `roaster` and command `review-list`.
- `.sdl/extensions/roaster/src/commands/review-list.ts` is a checked-in adapter that re-exports `@sdl/roaster/commands/review-list`.
- `ts/packages/roaster/src/commands/review-list.ts` defines the selected command module. It adapts `SdlExtensionApi` to Roaster's gateway-injected runtime through `SdlCommandExecApi`, delegates through `createRoasterClient(...)`, returns a typed Clinkr envelope over `reviewListResultSchema`, and reuses Roaster's existing human renderer.
- `ts/packages/sdl/src/sdk/module-loader.ts` now aliases package-owned Roaster command subpaths, mirroring the existing flow-command alias model without adding broad `node_modules` discovery.
- `ts/packages/sdl/test/scenario/roaster-extension-cli.test.ts` covers top-level discovery, selected help/schema loading, and a fake-exec `sdl roaster review-list --format json` run.

## Objective Impact

This completes the roadmap proof row for Roaster's SDL Command Face and selected loading:

- Top-level SDL help discovers Roaster manifest metadata without importing selected Roaster command code or running git/model/Branch Memory/GitHub work.
- Selected help and `--json-schema` load only the selected `review-list` command module and expose its request/result schema.
- The representative command demonstrates the expected edge pattern: SDL command shell converts `ctx` to gateways and calls Roaster-owned domain/API behavior; Roaster domain logic does not move into the SDL kernel.
- The proof keeps the public shape conservative: a `roaster` group with flattened `review-list` leaf under existing one-level dynamic SDL command mechanics. Final taxonomy for full parity remains governed by the migration rows and steering rules.

## Follow-Ups

- Complete the next roadmap row by migrating the remaining low-risk read/list surfaces: `review ls`, `review log`, and `roast list`, plus parity tests for JSON/human behavior and storage semantics.
- Decide during the read/list migration whether `review-list` remains the durable SDL leaf name or needs a steered taxonomy adjustment before docs/skills cut over.
- Keep `review run`, `exec record-findings`, and `exec publish-findings` out of this proof slice; they remain later rows with model/Branch Memory/GitHub boundaries.
