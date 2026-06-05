---
name: planned-branch-create
description: Use when a user explicitly wants to create a planned branch from a saved planned-branch plan, attach that plan as branch-scoped context, or continue a Pi `/planned-branch:create` handoff. This step skill is part of the planned-branch skill family; use the `planned-branch` umbrella skill for the shared lifecycle, command, and safety contract.
---

# planned-branch-create

Step entrypoint for resolving a saved plan, creating a planned branch, and attaching the plan in the planned-branch skill family.

## Workflow

1. First use the `planned-branch` skill for the shared lifecycle, command, and safety model.
2. Follow the `planned-branch` command guidance for "Resolve a saved plan" and "Create a planned branch and attach the plan".
3. Resolve the saved plan before create if needed.
4. Create the planned branch through the planned-branch workflow surface.
5. Stop on target branch or Branch Memory collisions unless explicit user intent resolves them.

## Success report

Report:

- branch;
- branch creation method;
- namespace;
- key;
- ref/commit evidence;
- source file;
- planned-branch slug.
