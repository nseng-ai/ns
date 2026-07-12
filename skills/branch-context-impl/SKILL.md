---
name: branch-context-impl
disable-model-invocation: true
description: Use when a user explicitly wants to implement from an attached branch-context plan on the current branch — "implement the branch context", "load the attached branch-context plan", "continue from the branch context plan" — or to continue a Pi `/ns:branch-context:impl-attached-plan` handoff.
---

# branch-context-impl

Load the attached plan from Branch Memory and implement from it as the source of truth. Part of the branch-context family — load the `branch-context` umbrella for the shared lifecycle, storage, and safety model.

## Command

```bash
prompt_dir=$(mktemp -d "${TMPDIR:-/tmp}/branch-context-impl.XXXXXXXX")
prompt_file="$prompt_dir/prompt.md"
ns branch-context exec load [key] --prompt-file "$prompt_file" --format json
```

- Reads the current branch by default and auto-selects the attached plan only when Branch Memory namespace `branch-context` has exactly one supported named Markdown entry. If multiple supported entries exist, pass an explicit key; an optional argument is treated as an exact attached Branch Memory key selector.
- Fallback: if the current branch has no attached branch-context entry and no explicit key was requested, the loader falls back to the current session's saved plan evidence, then the latest `.md` file in the current repo/source-branch local plan store.
- Legacy `plan.md` entries are unsupported; reattach under a named Markdown key such as `<slug>.md` before loading.
- JSON output uses the standard Clinkr envelope; bounded metadata lives under `data`.
- Do not use `--include-content` or `--include-prompt` during normal agent operation; those flags can exceed harness stdout limits on large plans.

## Workflow

1. Create a temp prompt file, then run `load --prompt-file "$prompt_file" --format json` (include an explicit key only when the user provided one).
2. Read the returned `data.implementationPromptFile` with the file-reading tool before editing code.
3. Treat the attached plan in that prompt as authoritative unless current repo state proves it stale; if stale, explain the discrepancy before changing scope. If you go beyond or against what the plan settled, anything the plan ruled out becomes an open question again — recheck why it was ruled out, and look for an existing sibling that already does what you are about to build, before designing the extension.
4. Apply the branch-context plan contract protocol when the Attached plan has contract sections. If it includes current-state excerpts, scope boundaries, verification gates, or STOP conditions, compare excerpts against live repo state before executing the plan's first step; an excerpt mismatch is a STOP. If those sections are absent, explicitly recognize an old-format/pre-contract plan and do not invent gates or half-apply excerpt checks.
5. Stop and report instead of guessing on any STOP trigger: content/excerpt anchors no longer match live code; ambiguity or internal inconsistency; a verification gate fails twice after reasonable local attempts; implementation requires touching an out-of-scope file/area; the plan asks for mutating Branch Memory; or no attached plan is available where one is required. One scoped exception, for stale branch names only: a stale recorded branch name or branch-name STOP gate is not by itself a STOP — the loader-selected branch/key/ref is the runtime identity when the current branch is non-trunk and loader evidence, `git branch --show-current`, and the Branch Memory target agree; document that as a minimal adaptation. If those three disagree, stop.
6. Document minimal adaptations: report what changed, why the plan prediction was wrong, and which validation covers the adaptation. Silent deviations are failures.
7. Implement in focused steps; run each declared verification gate, and note any skipped gate and why.
8. Before finishing, compare changed files to the plan's scope. Note autofixer-only formatting outside scope separately; intentional executor edits outside scope require user approval.
9. Report implemented changes, files changed/tree state, validation results, plan deviations, unresolved follow-up, and for any STOP: observed vs expected plus the exact gate/assumption that failed.

## Recovery

- No attached entry and saved-plan fallback also fails: report both failures and ask whether to run `branch-context-from-plan`, switch to the implementation branch, or pass an explicit saved plan to `/ns:branch-context:from-plan` first.
- Missing, unexpected, or ambiguous attached plan key: inspect `brmem list --namespace branch-context --branch <branch>` and rerun `load <key>` only when the user explicitly chooses the key.
- Current branch is trunk/default/detached: stop and ask for the intended implementation branch.
