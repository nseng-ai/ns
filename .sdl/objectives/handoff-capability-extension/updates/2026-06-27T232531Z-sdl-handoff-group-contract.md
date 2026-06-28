# SDL Handoff Grouped Command Contract Proven

## Summary

This update records the first implementation slice for the portable Handoff command tree. SDL's existing package-style extension manifest contract now has focused Handoff-shaped coverage:

- package manifests with `sdl.group: "handoff"` contribute leaves such as `list`, `create`, `delete`, `gc`, and `pickup` as `sdl handoff <leaf>` commands;
- root and group help can list manifest-provided grouped leaves without importing leaf modules;
- selected leaf help and `--json-schema` import only the requested leaf module;
- unknown grouped leaves surface Clinkr's unknown-command diagnostic without loading Handoff leaf modules;
- top-level command vs grouped-command name collisions are rejected with `extension_command_group_collision` instead of mounting an ambiguous command/group pair.

Changed implementation/test files:

- `ts/packages/sdl/src/extension-registry.ts`
- `ts/packages/sdl/test/unit/extension-discovery.test.ts`
- `ts/packages/sdl/test/unit/extension-registry.test.ts`
- `ts/packages/sdl/test/scenario/handoff-cli-contract.test.ts`

Validation run by the parent session:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl/test/unit/extension-discovery.test.ts packages/sdl/test/unit/extension-registry.test.ts packages/sdl/test/scenario/handoff-cli-contract.test.ts` — passed, 3 files / 32 tests.
- `just ts-format-check` — initially failed; `just ts-format-fix` was run.
- `just ts-format-check` — passed after autofix.
- `just ts-check` — passed.

## Objective Impact

The roadmap row "Prove the SDL nested command-tree contract needed by Handoff" is complete for this Objective's default contract. No public SDL SDK author API, new manifest schema, command aliases, Handoff storage semantics, or Pi command behavior changed.

This de-risks the later Handoff command-face work: Handoff can proceed as a package-style SDL extension using `sdl.group: "handoff"` and selected leaf loading for `list`, `delete`, `gc`, `create`, and `pickup`.

## Follow-Ups

- Implement `@sdl/handoff/api` and gateway-injected Handoff Domain Core seams for lifecycle/admin behavior.
- Add real `sdl handoff list/delete/gc` leaves over that API/core, preserving the storage-sensitive contracts recorded in `updates/2026-06-27T230253Z-handoff-surface-inventory-baseline.md`.
- Keep the standalone `handoff` CLI in place until all five SDL leaves have parity and call-site inventory/cutover evidence is recorded.
