# Neutralized Planned-Branch Output Artifact

## Summary

The planned-branch output/session-artifact contract moved from `@asdl/pi-extensions` internals into the lower `@asdl/planned-branch` package. `@asdl/planned-branch` now exports the planned-branch output message type, output detail types, evidence extraction helper, and evidence formatter wrapper.

CCC cmux consumers import the artifact contract from `@asdl/planned-branch`, and planned-branch Pi extension producer code uses the same contract. The old `ts/packages/pi-extensions/src/planned-branch-output.ts` path remains only as a compatibility re-export.

## Objective Impact

The roadmap item for neutralizing the planned-branch session artifact is complete. CCC no longer depends on `@asdl/pi-extensions` internals for planned-branch output evidence, and lower packages still do not import `@asdl/ccc`.

Validation evidence: `bun run --cwd ts check`, `bun test --cwd ts/packages/planned-branch`, focused planned-branch/cmux tests, `bun run --cwd ts test`, `bun test --cwd ts/packages/ccc`, and `git diff --check` passed in the parent session.

The Objective remains open for the remaining cross-domain CCC orchestration moves: planned-branch up-and-impl, handoff-tab, Objective stack implementation, source-control command/control, and worktree-status splitting.

## Follow-Ups

- Continue moving cross-domain launch orchestration into CCC while preserving lower domain ownership.
- Keep generic runtime helpers outside CCC unless a later slice extracts a deliberately neutral runtime module.
