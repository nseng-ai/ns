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

Reads the current branch by default and auto-selects the attached plan only when Branch Memory namespace `branch-context` has exactly one entry. If multiple entries exist, pass an explicit key. If the current branch has no attached branch-context entry and no explicit key was requested, it falls back to the current session's saved plan evidence or the latest `.md` file in the current repo/source-branch local plan store. An optional argument is treated as an exact attached Branch Memory key selector. Legacy `plan.md` entries remain readable when explicitly requested or when they are the only entry. JSON output is bounded metadata by default and includes `implementation_prompt_file` when `--prompt-file` is passed. Do not use `--include-content` or `--include-prompt` during normal agent operation; those flags can exceed harness stdout limits on large plans.

## Workflow

1. Create a temp prompt file, then run `load --prompt-file "$prompt_file" --format json` (include an explicit key only when the user provided one).
2. Read the returned `implementation_prompt_file` with the file-reading tool before editing code.
3. Treat the attached plan in that prompt as authoritative unless current repo state proves it stale; if stale, explain the discrepancy before changing scope. If you go beyond or against what the plan settled, anything the plan ruled out becomes an open question again — recheck why it was ruled out, and look for an existing sibling that already does what you are about to build, before designing the extension.
4. Apply the branch-context plan contract protocol when the Attached plan has contract sections. If it includes current-state excerpts, scope boundaries, verification gates, or STOP conditions, compare excerpts against live repo state before step 1; an excerpt mismatch is a STOP. If those sections are absent, explicitly recognize an old-format/pre-contract plan and do not invent gates or half-apply excerpt checks.
5. Stop and report instead of guessing on universal STOP triggers: excerpt mismatch; ambiguity or internal inconsistency; a verification gate fails twice after reasonable local attempts; implementation requires touching an out-of-scope file/area; the plan asks for mutating Branch Memory; or branch identity looks wrong despite loader safety checks.
6. Document minimal adaptations: report what changed, why the plan prediction was wrong, and which validation covers the adaptation. Silent deviations are failures.
7. Before finishing, compare changed files to the plan's scope. Note autofixer-only formatting outside scope separately; intentional executor edits outside scope require user approval.
8. Implement in focused steps; run the plan's validation commands when practical.
9. Report implemented changes, files changed/tree state, validation results, plan deviations, unresolved follow-up, and for any STOP: observed vs expected plus the exact gate/assumption that failed.

## Recovery

- No attached entry and saved-plan fallback also fails: report both failures and ask whether to run `branch-context-from-plan`, switch to the implementation branch, or pass an explicit saved plan to `/branch-context:from-plan` first.
- Missing, unexpected, or ambiguous attached plan key: inspect `brmem list --namespace branch-context --branch <branch>` and rerun `load <key>` only when the user explicitly chooses the key.
- Current branch is trunk/default/detached: stop and ask for the intended implementation branch.
