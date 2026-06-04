---
name: planned-branch-impl
description: Use when a Claude Code user wants to implement from an attached planned-branch plan on the current branch. Triggers on requests like "implement the planned branch", "load the attached planned-branch plan", "continue from the planned branch plan", or cross-harness handoff from Pi `/planned-branch:impl`. Loads through `planned-branch exec load-plan` before editing code.
---

# planned-branch-impl

Load the attached planned-branch plan from Branch Memory and implement from that authoritative plan.

## Contract

Load with:

```bash
planned-branch exec load-plan [key-or-slug] --format json
```

The CLI reads the current branch by default and selects an attached plan from Branch Memory namespace `planned-branch`. The optional argument may be either `my-plan` or `my-plan.md`.

The JSON response includes `attached_plan_content` and `implementation_prompt`. Use the loaded plan as the source of truth for the implementation turn.

## Workflow

1. Run `planned-branch exec load-plan --format json`, or include the user's key/slug when provided.
2. Read the returned `implementation_prompt` and `attached_plan_content` before editing.
3. Implement the plan in focused steps, preserving the plan's validation expectations unless the repo state proves they need adjustment.
4. Run the validation commands called for by the plan when practical.
5. Report what was implemented, files changed, validation results, and any plan deviations.

## Recovery guidance

- If no planned-branch entry exists on the current branch, ask whether to switch to the implementation branch or run `planned-branch-create` first.
- If multiple attached plans exist, rerun `planned-branch exec load-plan <key-or-slug> --format json` with the desired key from the error output.
- If the current branch is trunk/default or detached, stop and ask for the intended implementation branch.
- If the plan is stale or conflicts with observed repo state, explain the discrepancy before changing scope.
