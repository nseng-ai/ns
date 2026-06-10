# Exec runtime and brmem-cli core extraction completed

## Summary

The exec-runtime and brmem-cli roadmap rows landed together as one foundation slice:

- `@asdl/core/exec` owns the shared compact `ExecResult` shape, command execution abstraction, Node spawn runner, timeout/startup conventions, streaming callbacks, command display helpers, output-tail formatting, and terminal escape stripping.
- `@asdl/core/brmem-cli` owns brmem command-candidate resolution and first-available execution on top of the core exec helpers.
- `plans`, `planned-branch`, `asdl-dev`, `pr-address`, `ccc`, `pi-extension-runtime`, and `pi-extensions` now import the shared runtime/brmem helpers from core surfaces instead of package-local runtime modules or `@asdl/plans` runtime re-exports.
- Obsolete runtime/brmem implementations and shims were removed from `plans`, `planned-branch`, `pi-extension-runtime`, `pi-extensions`, and `asdl-dev`.
- `pr-address` now uses the shared runner for real process execution and passes explicit git/gh timeouts through its process seam.

Verification: `pnpm --dir ts run test` and `pnpm --dir ts run check` pass. Post-migration searches for old command-runtime/brmem import surfaces and old implementation files are empty.

## Objective Impact

The unified subprocess exec runtime row and the brmem-cli single-sourcing row are now complete. This also de-risks the earlier assumption that the plans/asdl-dev/pi runtime capabilities were unionable without splitting the canonical result shape: the compact `ExecResult` contract survived the migration across all current in-repo consumers.

The broader Objective remains open because git gateway extraction, Result/envelope standardization, CLI scaffolding, scenario-test harness extraction, Zod boundary adoption, and the `asdl-dev` public-surface migration are still active roadmap work.

## Follow-Ups

- Continue with the shared git gateway row next; `planned-branch/src/plans-git-adapter.ts` still exists until source/current branch naming is unified.
- Keep the CLI scaffolding and scenario-test harness rows separate from the completed exec/brmem runtime layer.
- Preserve `@asdl/core/exec` and `@asdl/core/brmem-cli` as the canonical import surfaces for new TS runtime/brmem work.
