# Branch-Context Brmem Gateway Decision

## Summary

The Branch-Memory boundary question for `branch-context` is resolved: `branch-context` should go through the in-process `@sdl/brmem` gateway rather than shelling out to a user-installed `brmem` CLI shim.

This means the previously documented CLI subprocess boundary is not a deliberate product boundary for this Objective. The planned cleanup can proceed toward deleting `branch-context`'s Branch-Memory JSON envelope parsing layer and removing its dependency on `@sdl/core/brmem-cli`.

## Objective Impact

The first Branch-Memory access roadmap row is unblocked. Its implementation should adapt `branch-context` to consume `@sdl/brmem` gateway operations directly, preserving the current user-visible diagnostics and partial-failure behavior while removing the subprocess-only failure mode and parse machinery.

The related `@sdl/core/brmem-cli` candidate-framework collapse remains a separate follow-up row after branch-context no longer depends on the CLI shell-out path.

## Follow-Ups

- Implement the `branch-context` in-process gateway migration.
- Delete the branch-context-specific `brmem` JSON envelope parsing once tests cover equivalent list/get/put/check/delete behavior through the gateway.
- After branch-context no longer uses `@sdl/core/brmem-cli`, continue with the separate `brmem-cli` framework collapse row.
