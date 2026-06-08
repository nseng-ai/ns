---
name: planned-branch-impl
description: Use when a user explicitly wants to implement from an attached planned-branch plan on the current branch — "implement the planned branch", "load the attached planned-branch plan", "continue from the planned branch plan" — or to continue a Pi `/planned-branch:impl` handoff. Part of the planned-branch skill family; see the `planned-branch` umbrella for the shared lifecycle and safety contract.
---

# planned-branch-impl

Load the attached plan from Branch Memory and implement from it as the source of truth. Part of the planned-branch family — load the `planned-branch` umbrella for the shared lifecycle, storage, and safety model.

## Command

```bash
prompt_file=$(mktemp "${TMPDIR:-/tmp}/planned-branch-impl.XXXXXX.md")
planned-branch exec load-plan [key-or-slug] --prompt-file "$prompt_file" --format json
```

Reads the current branch by default and selects an attached plan from Branch Memory namespace `planned-branch`. If the current branch has no attached planned-branch entries and no explicit key was requested, it falls back to the current session's saved plan evidence or the latest `.md` file in the current repo/source-branch local plan store. The optional argument may be `my-plan` or `my-plan.md` and is treated as an attached Branch Memory key selector. JSON output is bounded metadata by default and includes `implementation_prompt_file` when `--prompt-file` is passed. Do not use `--include-content` or `--include-prompt` during normal agent operation; those flags can exceed harness stdout limits on large plans.

## Workflow

1. Create a temp prompt file, then run `load-plan --prompt-file "$prompt_file" --format json` (include the user's key/slug when provided).
2. Read the returned `implementation_prompt_file` with the file-reading tool before editing code.
3. Treat the attached plan in that prompt as authoritative unless current repo state proves it stale; if stale, explain the discrepancy before changing scope.
4. Implement in focused steps; run the plan's validation commands when practical.
5. Report implemented changes, files changed, validation results, plan deviations, and unresolved follow-up.

## Recovery

- No attached entry and saved-plan fallback also fails: report both failures and ask whether to run `planned-branch-create`, switch to the implementation branch, or pass an explicit saved plan to `/planned-branch:create` first.
- Multiple attached plans: rerun `load-plan <key-or-slug>` with the desired key from the error output.
- Current branch is trunk/default/detached: stop and ask for the intended implementation branch.
