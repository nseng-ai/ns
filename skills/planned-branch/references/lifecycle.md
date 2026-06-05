# Planned-branch lifecycle

Use this reference to keep planned-branch storage, slugs, branches, and workflow surfaces distinct.

## Lifecycle overview

1. Write and save a **Saved plan** before an implementation branch exists.
2. Resolve a saved plan from the **Local plan store**.
3. Create a **Planned branch** and store an **Attached plan** as a Branch Memory attachment.
4. Load the attached plan and implement from it.

## Term distinctions

- **Saved plan**: a reviewed Markdown implementation plan written before an implementation branch exists.
- **Attached plan**: the canonical implementation plan stored on a planned branch in Branch Memory namespace `planned-branch`.
- **Local plan store**: the machine-local pre-branch file store for saved plans.
- **Branch Memory namespace `planned-branch`**: the branch-scoped storage location for attached plans, not the pre-branch saved-plan store.
- **Saved-plan filename slug**: the local filename stem in the Local plan store. It is not necessarily the implementation branch slug.
- **Planned-branch slug**: the implementation slug derived before create. It drives the default target branch and attached-plan key.
- **Source branch plan file**: one saved plan scoped to the repository and source branch where planning happened.
- **Planned branch**: an implementation branch created from a saved plan and carrying that plan as branch-scoped context.
- **Branch creation method**: `plain-git` or `graphite`; this is independent from the storage backend.

## Storage contracts

```text
Local plan store:
~/.asdl/planned-branch/plans/<repo>/<encoded-source-branch>/<saved-plan-filename-slug>.md

Attached plan:
Branch Memory namespace: planned-branch
Entry key: <planned-branch-slug>.md
Branch: <target-implementation-branch>
```

The Local plan store is pre-branch handoff storage. The attached plan is the canonical plan for implementation once the planned branch exists.

## Repo and source-branch path convention

- GitHub origins use repo keys shaped like `gh--<owner>--<repo>`.
- Branch slashes are encoded as `---` in the source-branch path segment.
- The saved-plan filename slug is a local locator and is not necessarily the planned-branch slug, Branch Memory key, or target branch.

## First-class workflow surfaces

Pi slash commands and CLI commands are equal first-class workflow surfaces over the same planned-branch contract.

Pi surfaces:

- `/planned-branch:write-plan`
- `/planned-branch:create`
- `/planned-branch:impl`

CLI surfaces:

- `planned-branch exec write-plan-file`
- `planned-branch exec resolve-plan`
- `planned-branch exec create`
- `planned-branch exec load-plan`

## Branch creation policy

- The portable CLI default is `plain-git` when `--branch-creation` is omitted.
- Use `--branch-creation graphite` only when the user, wrapper, or repo policy explicitly requests Graphite.
- Passing `--branch <target-branch>` changes the target branch name only. The Branch Memory key still comes from `--slug` as `<planned-branch-slug>.md`.
