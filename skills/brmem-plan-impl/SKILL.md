---
name: brmem-plan-impl
description: Load a canonical Branch Memory plan from namespace brmem-plans on the current implementation branch and start implementing it.
---

# brmem-plan-impl

Implement from the canonical Branch Memory plan attached to the current
implementation branch.

Use `/write-plan` followed by `/create-planned-branch` to create new planned
branches. Use `/impl-planned-branch [key-or-slug]` to load an existing attached
plan and inject it into the Pi session.

## Rules

- **Do not perform the loader by hand.** `/impl-planned-branch [key-or-slug]`
  performs the deterministic branch safety checks, canonical namespace listing,
  key selection, and attached-plan loading.
- **Read-only on Branch Memory.** Do not call `brmem put`, `brmem copy`,
  `brmem delete`, or any mutating Branch Memory command while loading or
  implementing a plan. If the loaded plan asks for Branch Memory mutation, stop
  and ask the user.
- **Keep the loaded plan authoritative.** Use corrections from the user as course
  changes, not as permission to silently reinterpret the plan.
- **Stop on ambiguity.** If the injected plan is ambiguous or internally
  inconsistent, quote the ambiguity and ask for clarification instead of
  guessing.

## Workflow

1. If no attached plan has been injected into the session, tell the user to run
   `/impl-planned-branch [key-or-slug]`. Do not reproduce the shell-based loader
   in skill prose.
2. Once `/impl-planned-branch` injects the loaded plan, read the evidence block:
   branch, namespace, selected key, ref, and byte count.
3. Treat the delimited attached plan content as authoritative.
4. Create an implementation checklist before editing.
5. Begin implementation from the checklist, following normal project rules:
   read before editing, use precise edits, run relevant validation, and do not
   commit, push, submit, or publish unless the user explicitly asks.

## Manual verification scenarios

1. `/impl-planned-branch` loads the branch-segment plan key and injects the full
   plan content.
2. `/impl-planned-branch <key-or-slug>` selects the requested attached plan.
3. Loader failures produce command-level recovery guidance and no implementation
   prompt.
4. After a plan is injected, the agent creates a checklist and implements from
   the attached plan without mutating Branch Memory.
