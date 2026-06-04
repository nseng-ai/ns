---
name: planned-branch-write-plan
description: Use when a Claude Code user wants to write, review, and save a planned-branch implementation plan for later branch creation. Triggers on requests like "write a plan", "save a planned-branch plan", "prepare a plan for a fresh implementation session", or cross-harness handoff from Pi `/planned-branch:write-plan`. Saves through the `planned-branch` CLI, not by writing ad-hoc repo files.
---

# planned-branch-write-plan

Write a self-contained Markdown implementation plan and save it in the local planned-branch plan store using the `planned-branch` CLI.

## Contract

Save with:

```bash
planned-branch exec write-plan-file \
  --slug <saved-plan-slug> \
  --summary "<one sentence>" \
  --stdin \
  --format json
```

The CLI writes to:

```text
~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<saved-plan-slug>.md
```

The saved-plan slug is a local filename locator. It is not necessarily the later implementation branch slug or Branch Memory key.

## Workflow

1. Inspect the repository and conversation context needed to produce a complete plan.
2. Draft a Markdown plan for a fresh downstream implementation session. Include:
   - goal and user-visible outcome;
   - relevant current behavior, files, symbols, commands, and tests;
   - decisions, rationale, rejected alternatives, risks, assumptions, and open questions;
   - external/off-repo findings inline when any were used;
   - step-by-step implementation approach;
   - validation commands and expected results.
3. Derive `<saved-plan-slug>` yourself from the final plan content: kebab-case, 3-7 specific words, no dates/random IDs/generic-only names.
4. Pipe the final plan content to `planned-branch exec write-plan-file --stdin --format json`.
5. Report the JSON evidence: `file_path`, `slug`, `repo_key`, `source_branch`, `branch_key`, and optional `summary`.
6. Stop after saving. Do not create a branch, write Branch Memory, or commit a plan file.

## Recovery guidance

- If the CLI rejects the slug, derive a clearer 3-7 word kebab-case slug from the final plan content and retry once.
- If the target file already exists, do not overwrite it manually. Explain the existing file path and ask whether to revise the plan content enough to justify a different slug.
- If repository discovery fails, run from inside the intended Git checkout.
- If the user wants the next step, hand off to `planned-branch-create` with the saved `file_path`.
