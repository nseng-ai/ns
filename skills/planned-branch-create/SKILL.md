---
name: planned-branch-create
description: Use when a user wants an agent to create a planned implementation branch from a saved plan and attach that plan as branch-scoped context. Triggers on requests like "create a planned branch", "branch this saved plan", "attach this plan to a branch", or cross-harness handoff from Pi `/planned-branch:create`. Uses `planned-branch exec create` and `resolve-plan`.
---

# planned-branch-create

Create an implementation branch from a saved planned-branch plan and attach the plan in Branch Memory through the `planned-branch` CLI.

## Contract

Resolve the saved plan when needed:

```bash
planned-branch exec resolve-plan [absolute-or-home-plan-file.md] --format json
```

Create and attach:

```bash
planned-branch exec create \
  --slug <planned-branch-slug> \
  --plan-file <absolute-or-home-plan-file.md> \
  [--branch <target-branch>] \
  [--branch-creation plain-git|graphite] \
  [--summary "<one sentence>"] \
  --format json
```

The attachment is stored under Branch Memory namespace `planned-branch` with key `<planned-branch-slug>.md` on the target branch.

## Workflow

1. Identify the saved plan file.
   - If the user provides a path, pass it to `planned-branch exec resolve-plan` first.
   - If no path is provided, run `planned-branch exec resolve-plan --format json` to select the latest saved plan for the current repo/source branch.
2. Read the selected plan if needed to understand the work and derive a slug.
3. Derive `<planned-branch-slug>` yourself from the plan content: kebab-case, 3-7 specific words, no dates/random IDs/generic-only names. This slug becomes the default target branch name and attached-plan key.
4. Choose branch creation:
   - omit `--branch-creation` to use the CLI default, `plain-git`;
   - pass `--branch-creation graphite` only when the user or workflow explicitly wants Graphite stack tracking;
   - pass `--branch-creation plain-git` when overriding a wrapper/project default back to plain Git.
5. Pass `--branch` only when the user requested a specific target branch. The attached-plan key still comes from `--slug`.
6. Run `planned-branch exec create ... --format json`.
7. Report `branch`, `branch_creation`, `namespace`, `key`, `ref_name`, `commit`, `source_file`, and `slug`.

## Recovery guidance

- If `resolve-plan` finds no saved plan, ask the user to run the write-plan workflow first or provide an absolute/home-relative `.md` plan path.
- If the slug is rejected, derive a clearer 3-7 word kebab-case slug from the plan content and retry once before asking.
- If the target branch exists, stop and ask whether to choose another `--branch` or inspect the existing branch.
- If the Branch Memory entry already exists, do not overwrite it; report the namespace/key and ask how to proceed.
- If Graphite setup fails after branch creation, report the partial branch state and do not attach a plan manually unless the user explicitly directs recovery.
