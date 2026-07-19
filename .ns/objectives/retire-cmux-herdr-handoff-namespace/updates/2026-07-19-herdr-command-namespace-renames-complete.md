# Complete the Herdr Command Namespace Renames

## Summary

The first migration slice now hard-renames the existing Herdr workspace prompt, refreshed-trunk prompt, workspace plan, and Objective-sidebar command surfaces to `/ns:herdr:handoff:{prompt,trunk-prompt,plan}` and `/ns:herdr:objective:sidebar-summary`. No compatibility aliases were added. The `handoff` segment remains an integrated workflow-family namespace for the existing dispatch behavior and does not cause those commands to create Handoff Artifacts.

## Objective Impact

The first roadmap row is complete. The canonical registration catalog contains exactly the four replacement names and retains `/ns:herdr:space:{new,goal,open-branch}` plus `/ns:herdr:tab:plan-dispatch` for their later dispositions. Existing fake-driven scenarios continue to cover branch preparation and parentage, prompt payloads, refreshed trunk behavior, Saved and Attached Plan handling, slot checkout, dry-run behavior, workspace and caller-tab destinations, Objective selection, and workspace-label composition.

Live Herdr package guidance and the four affected cmux parity references now use the replacement names. The package context explicitly distinguishes the organizational `handoff` namespace from Handoff Artifact creation. Exact live-surface searches found no retired command strings or retired constant names under current TypeScript, Pi configuration, or live documentation; remaining retired names in this Objective's checked-in scope and immutable updates are intentional historical decision evidence.

Validation passed with the focused `@nseng-ai/herdr` tests and typecheck, TypeScript format and lint checks, the TypeScript style guard, dprint, and the repository `just` baseline.

## Follow-Ups

- Replace the cmux handoff-tab workflow with `/ns:herdr:handoff:tab` in the next roadmap slice.
- Leave `/ns:herdr:space:open-branch`, cmux package retirement, broader documentation reconciliation, and `/ns:herdr:handoff:trunk-plan` disposition to their existing open roadmap rows.
