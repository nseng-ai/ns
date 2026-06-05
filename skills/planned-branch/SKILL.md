---
name: planned-branch
description: "Use for explicit planned-branch lifecycle, reference, diagnostics, admin, or repair work: planned-branch, planned branch, saved planned-branch plan, Local plan store, Source branch plan file, planned-branch slug, Attached plan, Branch Memory attachment, or Pi commands `/planned-branch:write-plan`, `/planned-branch:create`, `/planned-branch:impl`. Do not use for generic planning, generic branch creation, or generic implementation requests unless planned-branch intent is explicit."
---

# planned-branch

Umbrella/reference root for the bundled planned-branch skill family.

## Role in the skill family

`planned-branch` supplies the shared lifecycle model, terminology, command contracts, safety posture, diagnostics, and administration guidance for planned-branch work.

The step entrypoints are intended to be installed with this skill:

- `planned-branch-write-plan`
- `planned-branch-create`
- `planned-branch-impl`

When a step skill triggers, use this skill first for shared model, safety, and command details, then follow the step-specific workflow.

## Use this skill when

- The user explicitly asks about planned-branch lifecycle, storage, commands, diagnostics, admin, or repair.
- The request uses specific planned-branch terms such as Saved plan, Local plan store, Source branch plan file, planned-branch slug, Attached plan, or Branch Memory attachment.
- A Pi planned-branch command or handoff is involved: `/planned-branch:write-plan`, `/planned-branch:create`, or `/planned-branch:impl`.

## Do not use this skill for

- Generic planning, branch creation, or implementation requests with no planned-branch intent.
- Generic Branch Memory work unless it concerns the planned-branch namespace/attached-plan contract.
- Replacing the step skills when a specific write/create/implement workflow is requested; use this skill as their shared reference.

## Reference map

- `references/lifecycle.md`: terms, lifecycle, storage boundaries, Pi/CLI surfaces, and branch creation policy.
- `references/commands.md`: exact write, resolve, create, load, and inspection command contracts plus success-report evidence.
- `references/diagnostics-admin.md`: inspection, recovery, admin examples, collision handling, and destructive-change safety.

## Default safety posture

- Inspect before mutating.
- Refuse collisions, existing files, existing branches, and existing Branch Memory entries unless the user gives explicit replacement/destructive intent.
- Prefer deterministic `planned-branch exec` commands over manual file or Branch Memory operations when available.
- Use read-only Branch Memory inspection only for diagnostics.
- If plan content appears stale relative to repository state, explain the discrepancy before changing scope.

## Quick routing

- Write/save a source-branch plan: load `references/lifecycle.md` and `references/commands.md`, then use the write-plan workflow or `planned-branch-write-plan`.
- Resolve/create a planned branch: load `references/lifecycle.md` and `references/commands.md`, then use the create workflow or `planned-branch-create`.
- Implement an attached plan: load `references/lifecycle.md` and `references/commands.md`, then use the implementation workflow or `planned-branch-impl`.
- Inspect, repair, or administer planned-branch state: load `references/lifecycle.md` and `references/diagnostics-admin.md`.
