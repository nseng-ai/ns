---
name: branch-context
description: "Use for explicit branch-context lifecycle, reference, diagnostics, admin, or repair work: branch-context, branch context, saved branch-context plan, Local plan store, Source branch plan file, branch-context slug, Attached plan, Branch Memory attachment, change source branch, move/copy saved plan, retarget plan, inspect plan store, repair branch-context metadata, or Pi commands `/enriched-plan:save`, `/enriched-plan:grill-and-save`, `/branch-context:from-plan`, `/branch-context:upstack-impl-session`, `/branch-context:impl`. Do not use for generic planning, generic branch creation, or generic implementation requests unless branch-context intent is explicit."
---

# branch-context

Shared lifecycle, terminology, safety posture, diagnostics, and administration for the branch-context skill family. Each operation's command contract lives in its step skill.

## Skill family

Step entrypoints carry their own command and recovery and are runnable standalone:

- `enriched-plan-save` — save a source-branch plan.
- `branch-context-create` — create a branch context and attach the plan.
- `branch-context-impl` — load and implement an attached plan.

Use this skill for the shared model the step skills assume, and for diagnostics, admin, and repair work the step skills do not cover.

Admin and repair requests include changing or retargeting a saved plan's source branch, moving or copying saved plans between Local plan store branch directories, inspecting the plan store, and repairing obvious branch-context metadata.

## Do not use this skill for

- Generic planning, branch creation, or implementation with no branch-context intent.
- Generic Branch Memory work unless it concerns the branch-context namespace/attached-plan contract.
- Replacing the step skills for a specific write/create/implement request; it is their shared reference, not a substitute.

## Default safety posture

- Inspect before mutating.
- Refuse collisions, existing files, existing branches, and existing Branch Memory entries unless the user gives explicit replacement/destructive intent.
- Prefer deterministic `enriched-plan exec` commands for Saved plans and `branch-context exec` commands for branch/attachment operations when available.
- Use read-only Branch Memory inspection only for diagnostics.
- If plan content appears stale relative to repository state, explain the discrepancy before changing scope.

## References

Each step skill carries its own command, slug rule, recovery, and report fields inline, so the common path needs no reference hop. Load a reference only when the task needs the shared model or a non-happy-path flow:

- `references/lifecycle.md` — terms, lifecycle, storage boundaries, Pi/CLI surfaces, branch creation policy. Load to keep Saved plan vs Attached plan, the two slug kinds, and the two storage locations distinct.
- `references/diagnostics-admin.md` — inspection, recovery, read-only Branch Memory inspection, retarget/copy admin, collision handling, destructive-change safety. Load for repair, inspection, or admin.
