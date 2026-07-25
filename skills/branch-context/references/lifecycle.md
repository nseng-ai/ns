# Branch-context lifecycle

Use this reference to keep branch-context storage, slugs, branches, and workflow surfaces distinct.

## Lifecycle overview

1. Write and save a **Saved plan** before an implementation branch exists.
2. Resolve a saved plan from the **Local plan store**.
3. Create or choose a branch and attach a named Markdown plan key as branch context through Branch Memory.
4. Load the attached plan and implement from it.

## Term distinctions

- **Saved plan**: a reviewed Markdown implementation plan written before an implementation branch exists.
- **Attached plan**: the canonical implementation plan stored as a branch-context entry in Branch Memory namespace `branch-context`, under a named Markdown key.
- **Local plan store**: the machine-local pre-branch file store for saved plans.
- **Branch Memory namespace `branch-context`**: the branch-scoped storage location for attached plans, not the pre-branch saved-plan store.
- **Saved-plan filename slug**: the local filename stem in the Local plan store. `ns branch-context exec attach --plan <saved-plan-slug>` uses `<saved-plan-slug>.md` as the attached key.
- **Branch-context slug**: the implementation slug derived before create. It drives the default target branch and from-plan attached key `<branch-context-slug>.md`.
- **Source branch plan file**: one saved plan scoped to the repository and source branch where planning happened.
- **Branch context**: the branch's standing working context stored in Branch Memory namespace `branch-context`. A plan can be the founding entry, but branch context is not a special branch type.
- **Branch creation method**: `plain-git` or `graphite`; this is independent from the storage backend.

## Storage contracts

```text
Local plan store:
$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/<saved-plan-filename-slug>.md
(default $HOME/.local/state/ns/enriched-plan/...)

Attached plan:
Branch Memory namespace: branch-context
Entry key for new from-plan attachments: <branch-context-slug>.md
Entry key for attach --plan: <saved-plan-filename-slug>.md
Unsupported legacy key: plan.md
Branch: <target-implementation-branch>
```

The Local plan store is pre-branch handoff storage. The attached plan is the canonical plan for implementation once it is attached to branch context. Old branches may still contain a `plan.md` entry, but branch-context workflows no longer load it; reattach under a named Markdown key such as `<slug>.md`.

## Repo and source-branch path convention

- GitHub origins use repo keys shaped like `gh--<owner>--<repo>`.
- Branch slashes are encoded as `---` in the source-branch path segment.
- The saved-plan filename slug is a local locator and is not necessarily the branch-context slug, Branch Memory key, or target branch.

## First-class workflow surfaces

Pi slash commands and ns CLI commands are equal first-class workflow surfaces over the same branch-context contract. There is no supported standalone `branch-context` binary.

Pi surfaces:

- `/ns:plan:save`
- `/ns:plan:grill-and-save` (Pi-only structured UI over the same Saved plan artifact)
- `/ns:plan:impl-saved-plan` directly implements a selected Saved plan in a fresh Pi session on the current branch without attaching Branch Context or writing Branch Memory. With no path it prefers current-session Saved Plan evidence, then the newest branch-scoped local-store plan; an explicit path selects that file even when it is older.
- `/ns:branch-context:from-plan`
- `/ns:branch-context:upstack-impl-from-plan`
- `/ns:branch-context:impl-attached-plan` implements the branch-scoped Attached Plan selected by the branch-context loader, including its documented local-plan-store fallback when no attached entry is available.

`impl-saved-plan` names the durable artifact boundary rather than implying recency. It accepts only a **Saved plan**, distinct from the **Attached plan** consumed through the branch-context workflow.

CLI surfaces:

- `enriched-plan list` for read-only local saved-plan store inspection
- `enriched-plan exec save`
- `enriched-plan exec resolve`
- `ns branch-context exec from-plan`
- `ns branch-context exec attach`
- `ns branch-context exec list`
- `ns branch-context exec check`
- `ns branch-context exec delete`
- `ns branch-context exec load [<key>]`

## Branch creation policy

Choose the branch creation method before invoking `ns branch-context exec from-plan`. Policy precedence is:

1. Explicit user request. Users or harnesses may say `--graphite`, `--plain-git`, or plain-language equivalents; direct CLI invocations translate these to `--branch-creation graphite` or `--branch-creation plain-git`.
2. Wrapper/harness default, such as a Pi adapter-provided branch creation method.
3. Repo policy from loaded project instructions/docs.
4. Portable CLI default (`plain-git`) only when no higher-priority policy exists.

The portable CLI default is still `plain-git` when `--branch-creation` is omitted. In this repo, direct skill/CLI execution should include `--branch-creation graphite`; omitting `--branch-creation` is correct only for portable/default contexts without a repo policy.

Branch-context Graphite branch creation is `git branch <target> HEAD` plus `gt track <target> --parent <current-branch> --no-interactive`, not `gt create`.

Passing `--branch <target-branch>` changes the target branch name only. For from-plan workflows, the Branch Memory key remains derived from the branch-context slug as `<branch-context-slug>.md`.
