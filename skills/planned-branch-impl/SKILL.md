---
name: planned-branch-impl
description: Use when a user explicitly wants to implement from an attached planned-branch plan on the current branch — "implement the planned branch", "load the attached planned-branch plan", "continue from the planned branch plan" — or to continue a Pi `/planned-branch:impl` handoff. Part of the planned-branch skill family; see the `planned-branch` umbrella for the shared lifecycle and safety contract.
---

# planned-branch-impl

Load the attached plan from Branch Memory and implement from it as the source of truth. Part of the planned-branch family — load the `planned-branch` umbrella for the shared lifecycle, storage, and safety model.

## Command

```bash
planned-branch exec load-plan [key-or-slug] --format json
```

Reads the current branch by default and selects an attached plan from Branch Memory namespace `planned-branch`. The optional argument may be `my-plan` or `my-plan.md`. The JSON response includes `implementation_prompt` and `attached_plan_content`.

## Workflow

1. Run `load-plan --format json` (include the user's key/slug when provided).
2. Read `implementation_prompt` and `attached_plan_content` before editing code.
3. Treat the attached plan as authoritative unless current repo state proves it stale; if stale, explain the discrepancy before changing scope.
4. Implement in focused steps; run the plan's validation commands when practical.
5. Report implemented changes, files changed, validation results, plan deviations, and unresolved follow-up.

## Recovery

- No entry on the current branch: ask whether to switch to the implementation branch or run `planned-branch-create` first.
- Multiple attached plans: rerun `load-plan <key-or-slug>` with the desired key from the error output.
- Current branch is trunk/default/detached: stop and ask for the intended implementation branch.
