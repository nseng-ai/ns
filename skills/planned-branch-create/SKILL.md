---
name: planned-branch-create
description: Use when a user explicitly wants to create a planned implementation branch from a saved plan and attach that plan as branch-scoped context — "create a planned branch", "branch this saved plan", "attach this plan to a branch" — or to continue a Pi `/planned-branch:create` handoff. Part of the planned-branch skill family; see the `planned-branch` umbrella for the shared lifecycle and safety contract.
---

# planned-branch-create

Resolve a saved plan, create a planned branch, and attach the plan in Branch Memory. Part of the planned-branch family — load the `planned-branch` umbrella for the shared lifecycle, storage, and safety model.

## Commands

Resolve the saved plan when needed:

```bash
plans exec resolve [absolute-or-home-plan-file.md] --format json
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

The plan is attached under Branch Memory namespace `planned-branch`, key `<planned-branch-slug>.md`, on the target branch.

## Workflow

1. Resolve the saved plan first if a path is given or none is known.
2. Derive `<planned-branch-slug>` from plan content: kebab-case, 3-7 specific words, no dates/random IDs/generic-only names. This drives the default target branch and attached-plan key.
3. Omit `--branch-creation` for the portable default (`plain-git`); pass `graphite` only when the user, wrapper, or repo policy explicitly wants it.
4. Pass `--branch` only when the user requested a specific target branch; the key still comes from `--slug`.
5. Report `branch`, `branch_creation`, `namespace`, `key`, `ref_name`, `commit`, `source_file`, `slug`.

## Recovery

- No saved plan: run the write-plan workflow first, or provide an absolute/home-relative `.md` path.
- Slug rejected: derive a clearer 3-7 word slug and retry once before asking.
- Target branch exists: stop; ask whether to choose another `--branch` or inspect the existing branch.
- Branch Memory entry exists: do not overwrite; report namespace/key and ask.
- Graphite setup fails after branch creation: report the partial branch state; do not attach a plan manually unless the user explicitly directs recovery.
