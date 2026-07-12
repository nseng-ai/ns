---
name: branch-context
description: "Explicit branch-context (branch context) work: enriched-plan local plan store, source branch plan file, branch-context slug, attached plan, Branch Memory attachment, change/retarget a saved plan's source branch, move/copy saved plans, inspect plan store, repair branch-context metadata, or Pi commands `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, `/ns:branch-context:impl-attached-plan`. Not for generic planning, branch creation, or implementation unless branch-context intent is explicit."
---

# branch-context

Shared lifecycle, terminology, safety posture, diagnostics, and administration for the branch-context skill family. Each operation's command contract lives in its step skill.

## Skill family

Step entrypoints carry their own command and recovery and are runnable standalone:

- `enriched-plan-save` — save a source-branch plan.
- `branch-context-from-plan` — create a branch and attach a named plan key as branch context from a saved plan.
- `branch-context-impl` — load and implement an attached plan.

Use this skill for the shared model the step skills assume, and for diagnostics, admin, and repair work the step skills do not cover.

## Do not use this skill for

- Generic Branch Memory work unless it concerns the branch-context namespace/attached-plan contract.
- Replacing the step skills for a specific write/create/implement request; it is their shared reference, not a substitute.

## Default safety posture

- Inspect before mutating.
- Refuse collisions, existing files, existing branches, and existing Branch Memory entries unless the user gives explicit replacement/destructive intent.
- Prefer deterministic `enriched-plan exec` commands for Saved plans and `ns branch-context exec` commands for branch/attachment operations when available.
- Use read-only Branch Memory inspection only for diagnostics.

## References

Each step skill carries its own command, slug rule, recovery, and report fields inline, so the common path needs no reference hop. Load a reference only when the task needs the shared model or a non-happy-path flow:

- `references/lifecycle.md` — terms, lifecycle, storage boundaries, Pi/CLI surfaces, branch creation policy. Load to keep Saved plan vs Attached plan, the two slug kinds, and the two storage locations distinct.
- `references/diagnostics-admin.md` — inspection, recovery, read-only Branch Memory inspection, retarget/copy admin, collision handling, destructive-change safety. Load for repair, inspection, or admin.
