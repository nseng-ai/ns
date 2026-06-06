---
name: planned-branch
description: "Use for explicit planned-branch lifecycle, reference, diagnostics, admin, or repair work: planned-branch, planned branch, saved planned-branch plan, Local plan store, Source branch plan file, planned-branch slug, Attached plan, Branch Memory attachment, change source branch, move/copy saved plan, retarget plan, inspect plan store, repair planned-branch metadata, or Pi commands `/planned-branch:write-plan`, `/planned-branch:create`, `/planned-branch:up-and-impl`, `/planned-branch:impl`. Do not use for generic planning, generic branch creation, or generic implementation requests unless planned-branch intent is explicit."
---

# planned-branch

Shared lifecycle, terminology, safety posture, diagnostics, and administration for the planned-branch skill family. Each operation's command contract lives in its step skill.

## Skill family

Step entrypoints carry their own command and recovery and are runnable standalone:

- `planned-branch-write-plan` — save a source-branch plan.
- `planned-branch-create` — create a planned branch and attach the plan.
- `planned-branch-impl` — load and implement an attached plan.

Use this skill for the shared model the step skills assume, and for diagnostics, admin, and repair work the step skills do not cover.

Admin and repair requests include changing or retargeting a saved plan's source branch, moving or copying saved plans between Local plan store branch directories, inspecting the plan store, and repairing obvious planned-branch metadata.

## Do not use this skill for

- Generic planning, branch creation, or implementation with no planned-branch intent.
- Generic Branch Memory work unless it concerns the planned-branch namespace/attached-plan contract.
- Replacing the step skills for a specific write/create/implement request; it is their shared reference, not a substitute.

## Default safety posture

- Inspect before mutating.
- Refuse collisions, existing files, existing branches, and existing Branch Memory entries unless the user gives explicit replacement/destructive intent.
- Prefer deterministic `planned-branch exec` commands over manual file or Branch Memory operations when available.
- Use read-only Branch Memory inspection only for diagnostics.
- If plan content appears stale relative to repository state, explain the discrepancy before changing scope.

## References

Each step skill carries its own command, slug rule, recovery, and report fields inline, so the common path needs no reference hop. Load a reference only when the task needs the shared model or a non-happy-path flow:

- `references/lifecycle.md` — terms, lifecycle, storage boundaries, Pi/CLI surfaces, branch creation policy. Load to keep Saved plan vs Attached plan, the two slug kinds, and the two storage locations distinct.
- `references/diagnostics-admin.md` — inspection, recovery, read-only Branch Memory inspection, retarget/copy admin, collision handling, destructive-change safety. Load for repair, inspection, or admin.
