# Planned-branch command contracts

Use these contracts for planned-branch workflow execution and reporting. Prefer the deterministic `planned-branch exec` commands over manual file or Branch Memory operations when they cover the task.

## Write/save a source-branch plan

Pi surface: `/planned-branch:write-plan`.

CLI surface:

```bash
planned-branch exec write-plan-file \
  --slug <saved-plan-slug> \
  [--summary "<one sentence>"] \
  --stdin \
  --format json
```

Agent responsibilities:

- Produce a complete, self-contained Markdown implementation plan for a fresh downstream implementation session.
- Derive a semantic saved-plan slug only when using the CLI surface that requires an explicit slug.
- For Pi/tool wrappers that derive the slug themselves, do not invent a slug.
- Save only to the Local plan store.
- Do not create a branch, write Branch Memory, or commit a plan artifact.

Report evidence:

- `file_path`
- `slug`
- `repo_key`
- `source_branch`
- `branch_key`
- optional `summary`

## Resolve a saved plan

CLI surface:

```bash
planned-branch exec resolve-plan [absolute-or-home-plan-file.md] --format json
```

With no explicit path, this selects the latest saved plan for the current repo/source branch. Explicit paths may be absolute or home-relative and should be Markdown files.

## Create a planned branch and attach the plan

Pi surface: `/planned-branch:create [plan-path]`.

CLI surface:

```bash
planned-branch exec create \
  --slug <planned-branch-slug> \
  --plan-file <absolute-or-home-plan-file.md> \
  [--branch <target-branch>] \
  [--branch-creation plain-git|graphite] \
  [--summary "<one sentence>"] \
  --format json
```

Agent responsibilities:

- Resolve the saved plan first if needed.
- Derive the planned-branch slug from plan content for the CLI surface.
- Pass `--branch` only when the user requested a specific target branch.
- Omit `--branch-creation` for the portable CLI default (`plain-git`) unless user, wrapper, or repo policy explicitly selects a method.
- Do not overwrite existing branches or attached-plan entries.

Report evidence:

- `branch`
- `branch_creation`
- `namespace`
- `key`
- `ref_name`
- `commit`
- `source_file`
- `slug`

## Load and implement an attached plan

Pi surface: `/planned-branch:impl [key-or-slug]`.

CLI surface:

```bash
planned-branch exec load-plan [key-or-slug] --format json
```

Agent responsibilities:

- Read `implementation_prompt` and `attached_plan_content` from JSON before editing code.
- Treat the attached plan as authoritative unless current repo state proves it stale.
- If stale, explain the discrepancy before changing scope.

Final implementation report:

- implemented changes;
- changed files;
- validation results;
- plan deviations;
- unresolved follow-up.

## Read-only attached-plan inspection

Use only for diagnostics/inspection, not as a replacement for the create/load workflows:

```bash
brmem list --namespace planned-branch --branch <branch>
brmem get <key> --namespace planned-branch --branch <branch>
```
