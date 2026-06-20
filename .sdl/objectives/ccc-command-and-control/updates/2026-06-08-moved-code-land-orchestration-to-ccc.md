# Moved Code Land Orchestration to CCC

## Summary

Moved `/code:land` PR inspection, required-`master` base refusal, match-head squash merge, and command-output/failure presentation from `@asdl/pi-extensions` into `@asdl/ccc`. The public command remains `/code:land`; `@asdl/pi-extensions` now delegates registration to `@asdl/ccc/land`.

## Objective Impact

This completes the `/code:land` sub-slice of the source-control command/control roadmap row. `/code:land-stack` remains a later source-control landing slice.

Validation evidence: `bun test --cwd ts/packages/ccc --sequential`, `bun test --cwd ts/packages/pi-extensions --sequential`, `bun run --cwd ts check`, `just dprint-check`, and `git diff --check` passed. Import-direction checks found no lower-package imports of `@asdl/ccc` and no CCC imports of `@asdl/pi-extensions` or `ts/packages/pi-extensions/src`.

## Follow-Ups

- Move `/code:land-stack` orchestration into CCC in a later, larger slice.
- Keep import-direction checks confirming lower packages do not import CCC and CCC does not import pi-extension internals.
