# Cmux Slot Launch Seam

## Summary

The cmux command-suite cluster was reviewed with `improve-codebase-architecture` first. The requested `thermo-nuclear-code-quality-review` skill was not installed, so the implementation pressure-test was performed locally against the large TypeScript workflow path.

Decision: cmux is several workflow Modules rather than one coherent deep Module. The sidebar/workspace-summary flow, slot open flow, saved-plan dispatch flow, and prompt dispatch flow share a namespace and some adapters, but they do not currently justify one all-encompassing cmux Interface. The Python workspace-summary path is already a deep Module around `CmuxGateway`, fake testing, and the `cmux-workspace-summary` exec command.

The first worthwhile deepening slice was the slot-launch seam. `/cmux-slot:dispatch-plan` now uses the shared `cmux/slot.ts` and `cmux/worktree-description.ts` Module for slot checkout, worktree description, and `cmux new-workspace` opening instead of carrying a local duplicate implementation. This deleted duplicate checkout/open/worktree-description code from `ts/packages/pi-extensions/src/cmux/slot-dispatch-plan.ts` while preserving the existing command behavior.

Validation passed:

- `bun run --cwd ts/packages/pi-extensions check`
- `bun test ts/packages/pi-extensions/test/cmux.test.ts`

## Objective Impact

The first roadmap cluster is complete. The named cmux seam is now: shared slot-launch behavior lives behind `cmux/slot.ts` plus `cmux/worktree-description.ts`; individual cmux commands remain separate workflow Modules that call that seam where they need checkout/open behavior.

This improves Locality for future changes to slot checkout, cmux workspace command arguments, worktree descriptions, and workspace-open failure formatting. It also reduces the risk that `/cmux-slot:dispatch-plan` and `/cmux-slot:open-branch` drift when cmux launch behavior changes.

## Follow-Ups

- Continue the Objective with the Pi CLI command lifecycle cluster next.
- If `/cmux-slot:dispatch-plan` remains too large in later work, consider a separate planned-branch creation/attachment seam around Graphite branch creation and Branch Memory plan storage rather than folding that into the cmux slot-launch seam.
