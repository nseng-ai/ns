---
name: enriched-plan-save
description: Use when a user explicitly wants to write and save a Saved plan/source-branch plan file as an enriched plan for later branch-context attachment — "write a plan", "save an enriched plan", "prepare a plan for a fresh implementation session" — or to continue a Pi `/enriched-plan:save` or `/enriched-plan:grill-and-save` handoff. Part of the branch-context skill family; see the `branch-context` umbrella for the shared lifecycle and safety contract.
---

# enriched-plan-save

Write a self-contained Saved plan/source-branch plan file and save it to the Local plan store. Part of the branch-context family — load the `branch-context` umbrella for the shared lifecycle, storage, and safety model.

## Command

```bash
enriched-plan exec save \
  --slug <saved-plan-slug> \
  [--summary "<one sentence>"] \
  --stdin \
  --format json
```

The saved-plan slug is a local filename locator, not necessarily the later branch slug or Branch Memory key. For Pi/tool wrappers that derive the slug themselves, do not invent one.

## Workflow

1. Draft a complete, self-contained Markdown plan for a fresh downstream session: goal, current behavior/files/symbols/tests, decisions/rationale/rejected alternatives/risks/assumptions, external findings inline, step-by-step approach, validation commands + expected results. When repo state matters, include branch/commit/date provenance for forensics plus current-state excerpts as the content/excerpt drift anchor the executor can compare before editing; the SHA is not the mechanical authority. State in-scope and out-of-scope files/areas with one-line reasons for likely confusion. Define verification gates as commands with expected success, and prefer `no independent gate; verified by <later command>` over fake gates. Add 2-4 plan-specific STOP conditions for assumptions unique to the plan. For non-trivial plans, run a cold-read executability gaps check with a fresh-context review-only agent that reports only what an executor would have to guess; label model examples by harness, such as Pi/OpenAI `openai-codex/gpt-5.4-mini:medium` and Claude/Anthropic `claude-haiku-4-5`, and do not apply those review examples to implementation subagents. When the plan waives a canonical helper or pattern, write the waiver as positive routing for the adjacent case (e.g. "if X is later routed through the CLI, use helper Y like its siblings"), never as a bare prohibition.
2. Derive `<saved-plan-slug>` from the plan content: kebab-case, 3-7 specific words, no dates/random IDs/generic-only names.
3. Pipe the plan to `enriched-plan exec save --stdin --format json`.
4. Report `file_path`, `slug`, `repo_key`, `source_branch`, `branch_key`, and optional `summary`. Stop after saving.

## Recovery

- Slug rejected: derive a clearer 3-7 word kebab-case slug and retry once before asking.
- Target file exists: do not overwrite; explain the path and ask whether to revise the plan enough to justify a different slug.
- Repository discovery fails: run from inside the intended Git checkout.

## Boundaries

Do not create a branch, write Branch Memory, or commit a plan artifact in this step.
