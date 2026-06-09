---
name: plans-write
description: Use when a user explicitly wants to write and save a Saved plan/source-branch plan file for later planned-branch creation — "write a plan", "save a planned-branch plan", "prepare a plan for a fresh implementation session" — or to continue a Pi `/plans:write` or `/plans:grill-and-write` handoff. Part of the planned-branch skill family; see the `planned-branch` umbrella for the shared lifecycle and safety contract.
---

# plans-write

Write a self-contained Saved plan/source-branch plan file and save it to the Local plan store. Part of the planned-branch family — load the `planned-branch` umbrella for the shared lifecycle, storage, and safety model.

## Command

```bash
plans exec write \
  --slug <saved-plan-slug> \
  [--summary "<one sentence>"] \
  --stdin \
  --format json
```

The saved-plan slug is a local filename locator, not necessarily the later branch slug or Branch Memory key. For Pi/tool wrappers that derive the slug themselves, do not invent one.

## Workflow

1. Draft a complete, self-contained Markdown plan for a fresh downstream session: goal, current behavior/files/symbols/tests, decisions/rationale/rejected alternatives/risks/assumptions, external findings inline, step-by-step approach, validation commands + expected results.
2. Derive `<saved-plan-slug>` from the plan content: kebab-case, 3-7 specific words, no dates/random IDs/generic-only names.
3. Pipe the plan to `plans exec write --stdin --format json`.
4. Report `file_path`, `slug`, `repo_key`, `source_branch`, `branch_key`, and optional `summary`. Stop after saving.

## Recovery

- Slug rejected: derive a clearer 3-7 word kebab-case slug and retry once before asking.
- Target file exists: do not overwrite; explain the path and ask whether to revise the plan enough to justify a different slug.
- Repository discovery fails: run from inside the intended Git checkout.

## Boundaries

Do not create a branch, write Branch Memory, or commit a plan artifact in this step.
