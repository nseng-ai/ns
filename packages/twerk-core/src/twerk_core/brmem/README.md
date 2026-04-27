# brmem

`brmem` gives skills and agents a place to keep branch-local context without
putting that context in commits, PR comments, GitHub issues, or working-tree
files. Use it when a branch needs durable memory that should stay attached to
that branch until a tool deliberately reads, copies, updates, or deletes it.

It is useful for records such as:

- a plan or handoff note created before implementation starts
- a memjective snapshot attached to a branch
- a repo-specific prompt override used by a skill
- small text state that should survive across sessions but not become source
  code

`brmem` is still git-backed and inspectable. The point is not to hide state;
the point is to keep branch-scoped agent state out of the places humans use
for code review and project history.

Architecture and import rules for contributors live in [`AGENTS.md`](./AGENTS.md).

## Mental Model

There are three ideas to keep in mind:

- **Entry**: a small UTF-8 text blob stored under a key, such as
  `plan.md` or `dashboard-revamp/body.md`.
- **Namespace**: a domain-owned bucket for entries. `memjectives` is a
  namespace. Omitting `--namespace` stores an ad-hoc base entry.
- **Branch snapshot**: the set of entries for one namespace on one branch.
  Most commands target the current checked-out branch unless you pass
  `--branch`.

This lets a branch carry context that is real, durable, and easy to inspect,
but separate from the code being reviewed. A skill can save state on
`feature/table-filtering`, another skill can read that same state later, and
stacked work can copy a selected namespace into a child branch before the
parent branch lands.

The write boundary is explicit. `put` and `delete` change one entry on one
branch. `copy` copies entries from one branch snapshot to another. `get`,
`check`, `list`, and prompt resolution do not change stored branch memory.

## Which Command To Use

| You want to...                              | Use                         | Writes to |
| ------------------------------------------- | --------------------------- | --------- |
| Store a text artifact on the current branch | `brmem put`                 | Branch    |
| Print an entry's content                    | `brmem get`                 | Nothing   |
| See whether an entry exists and where it is | `brmem check`               | Nothing   |
| List stored entries                         | `brmem list`                | Nothing   |
| Remove one entry                            | `brmem delete`              | Branch    |
| Copy a namespace from one branch to another | `brmem copy`                | Branch    |
| Resolve a prompt override for a skill       | `brmem exec resolve-prompt` | Nothing   |

The `exec` subgroup is hidden from normal help because it is for skill/agent
invocation. It remains callable when a skill needs it.

## Normal Workflow

Assume a skill has prepared a branch plan and wants that plan to stay with the
branch instead of writing it into the working tree.

### 1. Store the plan on the current branch

```text
brmem put plan.md --file /tmp/plan.md
```

`put` reads the file and stores its content under `plan.md` for the current
branch. The command prints the git locator and commit for the branch-memory
snapshot so the result is inspectable.

For domain-owned state, use a namespace:

```text
brmem put dashboard-revamp/body.md --namespace memjectives --file body.md
```

Namespaces keep unrelated tools from colliding. A scratch `plan.md` entry and
a `memjectives/dashboard-revamp/body.md` entry can coexist on the same branch
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
brmem list --namespace memjectives
```

`check` reports the locator, snapshot head, blob, and size. `list` shows the
entries visible for the current branch, optionally narrowed to base entries or
a namespace.

### 3. Carry namespaced state to another branch

```text
brmem copy \
  --namespace memjectives \
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
project or global tier. It requires a git checkout so it can find the
project-local prompt path.

Packaged defaults live at `skills/<plugin-name>/default-prompt.md`.
`just install-tools` seeds global defaults without overwriting existing global
customizations.

## Example: Branch Creation Policy

`brmem-branch-create` stores session context for a newly created branch. The
memory part is the same in every repo: choose a bundle, store the selected
files with `brmem`, and report what landed.

Branch creation is not the same in every repo. One repo might use plain
`git branch`, another might use Graphite, and another might require a naming
prefix. That single policy decision belongs in a prompt plugin.

In this repo:

- the packaged default at
  [`skills/brmem-branch-create/default-prompt.md`](../../../../../skills/brmem-branch-create/default-prompt.md)
  creates the branch with plain git and does not check it out
- the repo-local override at
  [`.brmem/prompts/brmem-branch-create.md`](../../../../../.brmem/prompts/brmem-branch-create.md)
  also keeps no-checkout branch creation, then tracks the branch in Graphite

That split keeps the skill predictable while still letting the repo express
its local branch workflow.

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

## See Also

- [`AGENTS.md`](./AGENTS.md): contributor rules for this package.
- [`../memjective`](../memjective/): a higher-level branch-planning system
  built on `brmem`.
- [`skills/brmem-branch-create`](../../../../../skills/brmem-branch-create/):
  an example skill that uses `brmem` for branch-local handoff state.
