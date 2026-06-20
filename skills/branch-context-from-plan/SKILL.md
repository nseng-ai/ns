---
name: branch-context-from-plan
description: Use when a user explicitly wants to create an implementation branch from a saved plan and attach its branch context as a named Markdown key — "from plan", "create a branch and attach branch context", "branch this saved plan", "attach this plan to a branch" — or to continue a Pi `/branch-context:from-plan` handoff. Part of the branch-context skill family; see the `branch-context` umbrella for the shared lifecycle and safety contract.
---

# branch-context-from-plan

Resolve a saved plan, create the target branch, and attach a named Markdown plan key as branch context in Branch Memory. Part of the branch-context family — load the `branch-context` umbrella for the shared lifecycle, storage, and safety model.

## Commands

Resolve the saved plan when needed:

```bash
enriched-plan exec resolve [absolute-or-home-plan-file.md] --format json
```

Create and attach:

```bash
branch-context exec from-plan \
  --slug <branch-context-slug> \
  --plan-file <absolute-or-home-plan-file.md> \
  [--branch <target-branch>] \
  [--branch-creation plain-git|graphite] \
  [--summary "<one sentence>"] \
  --format json
```

The plan is attached under Branch Memory namespace `branch-context`, key `<branch-context-slug>.md`, on the target branch.

## Workflow

1. Resolve the saved plan first if a path is given or none is known.
2. Derive `<branch-context-slug>` from plan content: kebab-case, 3-7 specific words, no dates/random IDs/generic-only names. This drives the default target branch and the attached-plan key `<branch-context-slug>.md`.
3. Choose the branch creation method before invoking `branch-context exec from-plan`. Policy precedence is explicit user request > wrapper/harness default > repo policy > portable CLI default. In this repo, include `--branch-creation graphite`; omit `--branch-creation` only in portable/default contexts without a repo policy. For the full branch creation policy rules, see the `branch-context` umbrella's `references/lifecycle.md` (`## Branch creation policy`).
4. Pass `--branch` only when the user requested a specific target branch; the attached-plan key still comes from `<branch-context-slug>.md`, not the target branch name.
5. Report `branch`, `branch_creation`, `namespace`, `key`, `ref_name`, `commit`, `source_file`, `slug`.

## Recovery

- No saved plan: run the write-plan workflow first, or provide an absolute/home-relative `.md` path.
- Slug rejected: derive a clearer 3-7 word slug and retry once before asking.
- Target branch exists: stop; ask whether to choose another `--branch` or inspect the existing branch.
- Branch Memory entry exists: do not overwrite; report namespace/key and ask.
- Graphite setup fails after branch creation: report the partial branch state; do not attach a plan manually unless the user explicitly directs recovery.
