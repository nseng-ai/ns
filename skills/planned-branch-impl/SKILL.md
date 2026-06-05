---
name: planned-branch-impl
description: Use when a user explicitly wants to implement from an attached planned-branch plan on the current planned branch, or when a Pi `/planned-branch:impl` handoff requests this step. This step skill is part of the planned-branch skill family; use the `planned-branch` umbrella skill for the shared lifecycle, command, and safety contract.
---

# planned-branch-impl

Step entrypoint for loading and implementing from an attached plan in the planned-branch skill family.

## Workflow

1. First use the `planned-branch` skill for the shared lifecycle, command, and safety model.
2. Follow the `planned-branch` command guidance for "Load and implement an attached plan".
3. Read `implementation_prompt` and `attached_plan_content` before editing.
4. Treat the attached plan as authoritative unless current repo state proves it stale.
5. If the plan is stale, explain the discrepancy before changing scope.

## Final report

Report:

- implemented changes;
- files changed;
- validation results;
- plan deviations;
- unresolved follow-up.
