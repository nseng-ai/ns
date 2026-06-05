---
name: planned-branch-write-plan
description: Use when a user explicitly wants to save a planned-branch source-branch plan for later branch creation, or when a Pi `/planned-branch:write-plan` handoff requests this step. This step skill is part of the planned-branch skill family; use the `planned-branch` umbrella skill for the shared lifecycle, command, and safety contract.
---

# planned-branch-write-plan

Step entrypoint for saving a source-branch plan in the planned-branch skill family.

## Workflow

1. First use the `planned-branch` skill for the shared lifecycle, command, and safety model.
2. Follow the `planned-branch` command guidance for "Write/save a source-branch plan".
3. Produce a complete, self-contained Markdown implementation plan for a fresh downstream implementation session.
4. Save through the planned-branch workflow surface.
5. Stop after saving.

## Success report

Report:

- saved plan file path;
- saved-plan filename slug;
- repo key;
- source branch;
- encoded branch path segment;
- summary, if available.

## Boundaries

Do not create a branch, write Branch Memory, or commit a plan artifact in this step.
