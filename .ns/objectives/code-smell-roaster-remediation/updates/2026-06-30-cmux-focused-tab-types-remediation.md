# Cmux Focused Tab and Type Remediation

## Summary

Remediated the `cmux` code-smell cluster's three confirmed findings:

- `focused-terminal-tab.ts` no longer exports unused single-stage helpers for creating a surface, renaming a tab, or sending text; `launchFocusedCmuxTab` remains the package's focused-tab orchestration entry point, and `identifyCmuxCaller` remains exported for its existing external caller.
- `gateway.ts` now names the repeated cmux surface identity fields as `CmuxSurfaceRef`, reused by rename-tab and send-text gateway params.
- `pi-launch.ts` now reuses the canonical `ThinkingLevel` and `ModelInfo` types from `types.ts` through the existing public `PiLaunch*` names.

Validation passed: `pnpm --dir ts --filter @sdl/cmux run check`, `pnpm --dir ts --filter @sdl/cmux run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

The three `references/cmux.md` findings are now dispositioned as fixed in `roadmap.md`:

- Speculative Generality in focused terminal tab stage helpers: fixed by deleting the unused exports and their index re-exports.
- Data Clumps for cmux surface identifiers: fixed by introducing `CmuxSurfaceRef` for the shared surface reference shape.
- Duplicated Pi launch model/thinking-level types: fixed by deriving the Pi launch aliases from the canonical cmux extension types.

This reduces the open, no-disposition finding count by 3 without changing cmux launch behavior.

## Follow-Ups

No cmux follow-up is known. Future focused-tab work should use `launchFocusedCmuxTab` unless a real caller justifies reintroducing a single-stage public API.
