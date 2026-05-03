# brmem

`brmem` gives skills and agents a place to keep branch-local context without
putting that context in commits, PR comments, GitHub issues, or working-tree
files. Use it when a branch needs durable memory that should stay attached to
that branch until a tool deliberately reads, copies, updates, or deletes it.
It is primarily a low-level primitive for higher-level skills and tools.

Use cases include:

- a plan or handoff note created before implementation starts
- an objective snapshot attached to a branch (_objective_ is a codename for
  the higher-level branch-planning system built on `brmem`)
- agent session summaries captured for later harvesting
- "lessons learned" notes from an agent session, kept on the branch that
  produced them
- codebase-centric experiment tracking — what was tried on a branch and how
  it turned out, kept attached to that branch instead of in scratch files
- context handed to a remote dispatch system, e.g. a GitHub Actions job that
  needs the same branch-scoped state the local agent had
- small text state that should survive across sessions but not become source
  code

`brmem` is still Git-backed and inspectable. The point is not to hide state;
the point is to keep branch-scoped agent state out of the places humans use
for code review and project history.

Architecture and import rules for contributors live in [`AGENTS.md`](./AGENTS.md).

## Built-in Workflow: `brmem-branch-create`

`brmem` also includes one human-facing workflow that is useful on its own and
serves as a worked example.

It supports this pattern:

1. Plan changes on a parent branch.
2. Create the implementation branch.
3. Store the plan in that branch's `brmem`.
4. Implement in that branch, typically in its own worktree.

This is useful when you want to plan several pieces of work from a parent
branch, usually `main` or `master`, and then start independent implementation
sessions in separate worktrees.

`brmem-branch-create` stores session context for a newly created branch. It
can also use the plan content to suggest a branch name. The memory behavior is
the same in every repo: choose a bundle, store the selected files with
`brmem`, and report what landed.

Branch creation is repo-specific. One repo might use plain `git branch`;
another might use Graphite, and another might require a naming prefix. That
policy belongs in a prompt plugin.

In this repo:

- The packaged default at
  [`skills/brmem-branch-create/default-prompt.md`](../../skills/brmem-branch-create/default-prompt.md)
  creates the branch with plain Git and does not check it out.
- The repo-local override at
  [`.brmem/prompts/brmem-branch-create.md`](../../.brmem/prompts/brmem-branch-create.md)
  also creates the branch without checking it out, then tracks it in Graphite.

That split keeps the skill predictable while still letting the repo express
its local branch workflow.

## Mental Model

There are three ideas to keep in mind:

- **Entry**: a small UTF-8 text blob stored under a key, such as
  `plan.md` or `dashboard-revamp/body.md`.
- **Namespace**: a domain-owned bucket for entries. For example,
  `objectives` is a namespace where each branch entry has a well-defined
  schema and is under tool control. Omitting `--namespace` stores an ad-hoc
  base entry.
- **Branch snapshot**: the set of entries for one namespace on one branch.
  Most commands target the current checked-out branch unless you pass
  `--branch`.

This lets a branch carry context that spans sessions and tools — durable,
inspectable, and separate from the code being reviewed. A skill can save
state on `feature/table-filtering`, another skill can read that same state
later, and stacked work can copy a selected namespace into a child branch
before the parent branch lands.

The write boundary is explicit. `put` and `delete` change one entry on one
branch. `copy` copies entries from one branch snapshot to another. `get`,
`check`, `list`, and prompt resolution do not change stored branch memory.

## Which Command to Use

| You want to...                              | Use                         | Writes to |
| ------------------------------------------- | --------------------------- | --------- |
| Store a text artifact on the current branch | `brmem put`                 | Branch    |
| Print an entry's content                    | `brmem get`                 | Nothing   |
| See whether an entry exists and where it is | `brmem check`               | Nothing   |
| List stored entries                         | `brmem list`                | Nothing   |
| Remove one entry                            | `brmem delete`              | Branch    |
| Copy a namespace from one branch to another | `brmem copy`                | Branch    |
| Resolve a prompt override for a skill       | `brmem exec resolve-prompt` | Nothing   |

The bundled `brmem-branch-create` and `brmem-branch-impl` skills are
independently useful and double as worked examples of how to use `brmem`.

## Normal Workflow

Assume a skill has prepared a branch plan and wants that plan to stay with the
branch instead of writing it into the working tree.

### 1. Store the plan on the current branch

```text
brmem put plan.md --file /tmp/plan.md
```

`put` reads the file and stores its content under `plan.md` for the current
branch. The command prints the Git locator and commit for the branch-memory
snapshot so the result is inspectable.

For domain-owned state, use a namespace:

```text
brmem put dashboard-revamp/body.md --namespace objectives --file body.md
```

Namespaces keep unrelated tools from colliding. A scratch `plan.md` entry and
an `objectives/dashboard-revamp/body.md` entry can coexist on the same branch
without meaning the same thing.

### 2. Read it in a later session

```text
brmem get plan.md
```

`get` prints the stored content only. That makes it easy for a skill to feed
the value directly into its own workflow.

To inspect without printing the whole content:

```text
brmem check plan.md
brmem list --base
brmem list --namespace objectives
```

`check` reports the locator, snapshot head, blob, and size. `list` shows the
entries visible for the current branch, optionally narrowed to base entries or
a namespace.

### 3. Carry namespaced state to another branch

```text
brmem copy \
  --namespace objectives \
  --from-branch master \
  --to-branch feature/table-filtering \
  --key-glob 'dashboard-revamp/*'
```

`copy` is how branch snapshots move forward. With `--key-glob`, it copies only
matching keys and preserves unrelated destination keys. Without `--key-glob`,
it copies the whole namespace snapshot.

If the destination already has matching entries, `copy` aborts instead of
merging silently. Pass `--dry-run` to preview the plan, or `--overwrite` when
replacing destination entries is intentional.

### 4. Delete stale branch memory when it is no longer useful

```text
brmem delete plan.md
```

Deleting branch memory removes that entry from the branch snapshot. It does
not touch working-tree files or source commits.

## Prompt Plugins

A prompt plugin lets a repo customize one narrow slice of a skill's behavior
without forking the whole skill. The skill still owns the workflow; the plugin
only answers the repo-specific question the skill asks it.

Prompt plugins live in two places:

- project-local: `<repo-root>/.brmem/prompts/<name>.md`
- global fallback: `~/.brmem/prompts/<name>.md`

Project-local prompts win. If neither path exists, resolution fails with both
checked paths in the error message.

Skills resolve prompts with:

```text
brmem exec resolve-prompt <name>
```

The command prints the chosen path and reports whether it came from the
project or global tier. It requires a Git checkout so it can find the
project-local prompt path.

Packaged defaults live at `skills/<plugin-name>/default-prompt.md`.
`just install-tools` seeds global defaults without overwriting existing global
customizations.

## Rules Worth Remembering

- Branch memory is branch-scoped. Pass `--branch` when automation should not
  depend on the current checkout.
- Use namespaces for tool-owned records. Leave base entries for ad-hoc scratch
  state.
- Keep entries small and textual. `brmem` is not a place for generated assets,
  secrets, or large datasets.
- `copy` is exact and conflict-aware. Use `--dry-run`, `--key-glob`, and
  `--overwrite` deliberately.
- Prompt plugins should customize one explicit repo-specific decision, not
  become a second skill.

## Prior Art

Using Git refs as a side-channel store — separate from commits on a branch
but still part of the repository — is a well-trodden pattern:

- **Git itself** ships `git notes`, which attaches arbitrary text to commits
  via refs under `refs/notes/*` without rewriting history.
- **Gerrit** stores code-review metadata (changes, patch sets, reviewer state)
  in refs such as `refs/changes/*` and `refs/meta/*` rather than in the
  branches under review.
- **Graphite** historically stored stack metadata in refs under
  `refs/branch-metadata/*`, so stack relationships traveled with the repo
  without polluting branch history. (Recent Graphite versions cache this
  metadata in a local SQLite database instead, but the original ref-based
  design is the relevant precedent here.)

`brmem` applies the same idea to branch-scoped agent state: the storage lives
in refs (under `refs/brmem/<namespace>/<encoded-branch>:<key>`) so it is
durable, inspectable, and pushable, but stays out of commits, PRs, and the
working tree.

## See Also

- [`AGENTS.md`](./AGENTS.md): contributor rules for this package.
- [`../asdl-objectives`](../asdl-objectives/): a higher-level branch-planning
  system built on `brmem`.
- [`skills/brmem-branch-create`](../../skills/brmem-branch-create/):
  an example skill that uses `brmem` for branch-local handoff state.
