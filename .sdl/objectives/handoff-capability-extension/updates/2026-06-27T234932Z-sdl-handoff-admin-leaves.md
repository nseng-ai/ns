# SDL Handoff Admin Leaves Added

## Summary

This update records the third implementation slice for `handoff-capability-extension`: checked-in SDL extension leaves for Handoff admin operations.

Changes made:

- Added Handoff-owned SDL command modules under `ts/packages/handoff/src/sdl/` for:
  - `sdl handoff list`
  - `sdl handoff delete`
  - `sdl handoff gc`
- Added explicit package exports for `@sdl/handoff/sdl/commands/list`, `@sdl/handoff/sdl/commands/delete`, and `@sdl/handoff/sdl/commands/gc`.
- Added `.sdl/extensions/handoff/` as a grouped SDL extension package with `sdl.group: "handoff"`; checked-in leaf files re-export the Handoff package command modules.
- Added an SDL Handoff context adapter that bridges `SdlExtensionApi` to Handoff's existing gateway-injected CLI context using:
  - `@sdl/capability-kit` for SDL exec/Git gateway adaptation;
  - `RealGitBrmemGateway` for real Branch Memory storage through SDL command execution;
  - optional `ctx.extensions.handoff` overrides for fake-backed tests;
  - SDL confirmation hooks for interactive confirmation while retaining non-interactive refusal when no confirmation hook is available.
- Added SDL scenario coverage for `sdl handoff list/delete/gc` using fake Branch Memory and Git gateways, plus a helper for installing the checked-in Handoff extension into temp projects.

Validation run by the parent session:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/scenario/handoff-cli.test.ts packages/handoff/test` — passed, 9 files / 38 tests.
- `just ts-format-check` — passed.
- `just ts-check` — passed.
- `just ts-guard` — passed.
- Manual help check: `sdl handoff --help` listed `delete`, `gc`, and `list` under the `handoff` group.

Compatibility note:

The SDL command author API currently has no per-command short-option alias surface for contributed commands. This slice preserves the long destructive flags (`--yes` for delete and `--force` for gc) and their non-interactive refusal semantics, but it does not add `-y` / `-f` aliases because doing so would require a public SDL SDK/command author API change, which this Objective's Runner Policy says to steer before adding. Manual check: `sdl handoff delete alpha -y --format json` failed with `unknown option '-y'` and performed no mutation.

## Objective Impact

The portable SDL command face for Handoff admin operations is materially implemented and test-backed. Handoff now has a grouped checked-in extension package for `sdl handoff list/delete/gc`, and those leaves reuse Handoff-owned schemas, renderers, storage/core behavior, and fake-backed tests rather than shelling out to the standalone `handoff` binary or duplicating Branch Memory recipes.

The roadmap row for inventory/admin command migration remains partial rather than fully complete because short aliases and broader parity/call-site inventory still need an explicit follow-up decision/evidence before claiming full standalone CLI parity.

## Follow-Ups

- Decide whether SDL contributed commands should gain a public author API for short aliases; if so, add it as a separate steered SDL command-system slice and then restore `-y` / `-f` parity for `sdl handoff delete/gc`.
- Continue with deterministic `sdl handoff create` and mechanical `sdl handoff pickup` leaves.
- Keep the standalone `handoff` binary until all five SDL leaves have parity evidence and call-site inventory/cutover is complete.
