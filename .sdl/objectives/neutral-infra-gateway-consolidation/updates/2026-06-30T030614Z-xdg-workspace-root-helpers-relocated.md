# XDG and Workspace-Root Helpers Relocated

## Summary

Moved the XDG path/private-directory helpers from `@sdl/core/xdg` to `@sdl/capability-kit/xdg`, and moved `findWorkspaceRootByMarkers` from `@sdl/core/workspace-root` to `@sdl/capability-kit/workspace-root`. Live consumers in kernel, Pi host, Slot, Plans, Brmem, and Vibechk now import the Capability Kit subpaths directly. The former core source files, tests, and `./xdg` / `./workspace-root` package exports were deleted in the same slice.

Behavior coverage moved to `ts/packages/sdl-capability-kit/test/unit/xdg.test.ts` and `ts/packages/sdl-capability-kit/test/unit/workspace-root.test.ts`.

Implementation adaptation: `@sdl/core/src/brmem-cli.ts` still needs workspace-root probing while `brmem-cli` remains an unresolved residual core door, but `@sdl/core` cannot depend on `@sdl/capability-kit` without violating the tier direction. The slice therefore kept a local private copy of the small marker-walk helper inside `brmem-cli.ts` until the later `brmem-cli` residual cleanup handles that door.

Validation and source-search evidence:

- `rg -n '@sdl/core/(xdg|workspace-root)' ts/packages ts/scripts -S --glob '*.ts'` returned no matches.
- `rg -n '"\\./(xdg|workspace-root)"' ts/packages/infra/core/package.json` returned no matches.
- `test ! -f ts/packages/infra/core/src/xdg.ts && test ! -f ts/packages/infra/core/src/workspace-root.ts` passed.
- Targeted checks passed: `pnpm --dir ts --filter @sdl/capability-kit run check`, `pnpm --dir ts --filter @sdl/capability-kit run test`, `pnpm --dir ts --filter @sdl/core run check`, `pnpm --dir ts --filter @sdl/core run test`, `pnpm --dir ts --filter @sdl/kernel run check`, `pnpm --dir ts --filter @sdl/plans run check`, `pnpm --dir ts --filter @sdl/slot run check`, `pnpm --dir ts --filter @sdl/brmem run check`, `pnpm --dir ts --filter @sdl/pi run check`, `pnpm --dir ts --filter @sdl/vibechk run check`, and `just ts-deps-check`.
- Broad TS lane passed after running the formatter autofix for `ts/packages/hosts/pi/src/commands/cli-extension.ts`: `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just ts-test`.

## Objective Impact

This completes the `xdg` and `workspace-root` portion of the runtime-harness/residual roadmap row and removes two more filesystem/environment helper doors from `@sdl/core`. The selected home follows the Objective's residual policy for straightforward gateway helpers: Capability Kit owns the helper seams, with no compatibility shim in core.

## Follow-Ups

Continue the residual order with `shell-support` and `text-repair`. The private `brmem-cli.ts` workspace-root helper copy should be revisited only when the later `brmem-cli` residual cleanup runs; do not relocate `@sdl/brmem` in this Objective.
