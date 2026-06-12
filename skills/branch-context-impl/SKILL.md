---
name: branch-context-impl
description: Use when a user explicitly wants to implement from an attached branch-context plan on the current branch — "implement the branch context", "load the attached branch-context plan", "continue from the branch context plan" — or to continue a Pi `/branch-context:impl` handoff. Part of the branch-context skill family; see the `branch-context` umbrella for the shared lifecycle and safety contract.
---

# branch-context-impl

Load the attached plan from Branch Memory and implement from it as the source of truth. Part of the branch-context family — load the `branch-context` umbrella for the shared lifecycle, storage, and safety model.

## Command

```bash
prompt_dir=$(mktemp -d "${TMPDIR:-/tmp}/branch-context-impl.XXXXXXXX")
prompt_file="$prompt_dir/prompt.md"
branch-context exec load [key] --prompt-file "$prompt_file" --format json
```

Reads the current branch by default and selects the attached plan from Branch Memory namespace `branch-context`, key `plan.md`. If the current branch has no attached branch-context entry and no explicit key was requested, it falls back to the current session's saved plan evidence or the latest `.md` file in the current repo/source-branch local plan store. An optional argument is treated as an exact attached Branch Memory key selector. JSON output is bounded metadata by default and includes `implementation_prompt_file` when `--prompt-file` is passed. Do not use `--include-content` or `--include-prompt` during normal agent operation; those flags can exceed harness stdout limits on large plans.

## Workflow

1. Create a temp prompt file, then run `load --prompt-file "$prompt_file" --format json` (include an explicit key only when the user provided one).
2. Read the returned `implementation_prompt_file` with the file-reading tool before editing code.
3. Treat the attached plan in that prompt as authoritative unless current repo state proves it stale; if stale, explain the discrepancy before changing scope. If you go beyond or against what the plan settled, anything the plan ruled out becomes an open question again — recheck why it was ruled out, and look for an existing sibling that already does what you are about to build, before designing the extension.
4. Implement in focused steps; run the plan's validation commands when practical.
5. Report implemented changes, files changed, validation results, plan deviations, and unresolved follow-up.

## Recovery

- No attached entry and saved-plan fallback also fails: report both failures and ask whether to run `from-plan`, switch to the implementation branch, or pass an explicit saved plan to `/branch-context:from-plan` first.
- Missing or unexpected attached plan key: inspect `brmem list --namespace branch-context --branch <branch>` and rerun `load <key>` only when the user explicitly wants a non-default key.
- Current branch is trunk/default/detached: stop and ask for the intended implementation branch.
