# Moved Cmux Command Suite to CCC

## Summary

The cmux workspace/sidebar command suite moved into `@asdl/ccc`. The project-local `.pi/extensions/cmux.ts` adapter now registers from the CCC package source, and cmux tests import the CCC implementation home. Public command names stayed unchanged: `/cmux:sidebar:pr-summary`, `/cmux:sidebar:objective-summary`, `/cmux:workspace:dispatch-plan`, `/cmux:workspace:open-branch`, and `/cmux:workspace:dispatch-prompt`.

The old `@asdl/pi-extensions` cmux paths are now small compatibility shims where existing imports still need them. Generic helpers such as command runtime, machine-envelope parsing, Objective list/picker helpers, and planned-branch output remain outside CCC.

## Objective Impact

The roadmap item for moving cmux workspace and sidebar orchestration into CCC is complete for the command suite. CCC now owns the command registration and workspace/sidebar orchestration implementation while lower/shared helper seams remain below it.

Validation evidence: `bun run --cwd ts check`, `bun test --cwd ts/packages/ccc`, focused cmux and handoff-tab tests, `bun run --cwd ts test`, targeted `dprint check`, and `git diff --check` passed in the parent session.

The Objective remains open for the neutral session-artifact/runtime seam and the remaining cross-domain orchestration moves.

## Follow-Ups

- Neutralize `planned-branch-output` so CCC can consume the session-artifact contract without relying on `@asdl/pi-extensions` internals.
- Move handoff-tab launch orchestration later so remaining focused cmux tab helper compatibility can be simplified deliberately.
