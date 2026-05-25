# brmem

`brmem` gives skills and agents a place to keep branch-local context without
putting that context in commits, PR comments, GitHub issues, or working-tree
files. Use it when a branch needs durable memory that should stay attached to
that branch until a tool deliberately reads, copies, updates, or deletes it.
It is primarily a low-level primitive for higher-level skills and tools.

Use cases include:

- a plan or handoff note created before implementation starts
- tool-owned documents attached to a branch
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

## Planned-Branch Helper Workflow

This repo also carries Pi extension commands and a helper skill that exercise
`brmem` as worked examples.

It supports this pattern:

1. Write and save a plan on a parent branch with `/write-plan`.
2. Create a planned branch from that saved plan with `/create-planned-branch`.
3. Attach the plan to that branch in Branch Memory namespace `brmem-plans` with
   key `<slug>.md`.
4. Switch or open the planned branch, then begin implementation with
   `/impl-planned-branch`.

A saved plan lives in the local plan store at
`~/.asdl/plans/<repo>/<encoded-source-branch>/<slug>.md`. No checked-in plan file
is created. `/create-planned-branch` selects a saved plan, creates the target
implementation branch, and then attaches the plan to that branch in Branch
Memory.

Branch naming and branch creation policy are repo-specific extension
configuration. In this repo, planned branches default to `<slug>`, branch
creation defaults to Graphite, and the plan is attached in Branch Memory
namespace `brmem-plans` with key `<slug>.md`.

Graphite branch creation uses `git branch <target> HEAD` followed by `gt track
<target> --parent <current-branch>`, so it does not switch the current checkout.
The helper still passes `--branch <target-branch>` when storing Branch Memory, so
storage does not depend on the current checkout.

Use `brmem-plan-impl` or `/impl-planned-branch` on the implementation branch to
load the canonical attached plan from namespace `brmem-plans` and begin work.

## Mental Model

There are five ideas to keep in mind:

- **Branch Memory System**: the `brmem` CLI and Git-ref storage layer.
- **Branch Memory**: the Entries attached to one branch, either in the ad-hoc
  base area or in a Namespace.
- **Entry**: a small UTF-8 text blob stored under an Entry Key, such as
  `plan.md` or `dashboard-revamp/body.md`.
- **Entry Key**: the path-like name for an Entry within Branch Memory.
- **Namespace**: a domain-owned bucket for Entries. For example, `notes`
  is a Namespace where each Entry has a well-defined schema and is under tool
  control. Omitting `--namespace` stores an ad-hoc base Entry.

Most commands target the current checked-out branch unless you pass `--branch`.

This lets a branch carry context that spans sessions and tools — durable,
inspectable, and separate from the code being reviewed. A skill can save
state on `feature/table-filtering`, another skill can read that same state
later, and stacked work can copy a selected Namespace into a child branch
before the parent branch lands.

The write boundary is explicit. `put` and `delete` change one Entry on one
branch. `copy` copies Entries from one Branch Memory to another. `get`,
`check`, `list`, `export`, and prompt resolution do not change stored Branch
Memory. `export` writes working-tree-adjacent files only in the output
directory you provide.

## Which Command to Use

| You want to...                              | Use                         | Writes to  |
| ------------------------------------------- | --------------------------- | ---------- |
| Store a text Entry on the current branch    | `brmem put`                 | Branch     |
| Print an Entry's content                    | `brmem get`                 | Nothing    |
| See whether an Entry exists and where it is | `brmem check`               | Nothing    |
| List stored Entries                         | `brmem list`                | Nothing    |
| Export Entries to files                     | `brmem export`              | Filesystem |
| Remove one Entry                            | `brmem delete`              | Branch     |
| Copy a Namespace from one branch to another | `brmem copy`                | Branch     |
| Resolve a prompt override for a skill       | `brmem exec resolve-prompt` | Nothing    |

The planned-branch Pi commands and `brmem-plan-impl` skill are helper workflows
and double as worked examples of how to use `brmem`.

## Normal Workflow

Assume a skill has prepared a branch plan and wants that plan to stay with the
branch instead of writing it into the working tree.

### 1. Store the plan on the current branch

```text
brmem put plan.md --file /tmp/plan.md
```

`put` reads the file and stores its content under `plan.md` for the current
branch. The command prints the Entry locator and commit so the result is
inspectable.

For domain-owned state, use a Namespace:

```text
brmem put dashboard-revamp/body.md --namespace notes --file body.md
```

Namespaces keep unrelated tools from colliding. A scratch `plan.md` Entry and
a `notes/dashboard-revamp/body.md` Entry can coexist on the same branch
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
brmem list --namespace notes
```

`check` reports the Entry locator, Branch Memory head commit, blob, and size.
`list` shows the Entries visible for the current branch, optionally narrowed to
base Entries or a Namespace.

To materialize Entries as files, export them. With no `--output-dir`, `export`
writes to a fresh temp directory whose path has a unique random suffix (e.g.
`$TMPDIR/brmem-export-<hash>`) and prints that path in its output:

```text
brmem export
brmem export --output-dir /tmp/brmem-export
brmem export --namespace objectives --output-dir /tmp/objectives
brmem export --branch feature/table-filtering --output-dir /tmp/brmem-export
```

When `--namespace` is omitted, `export` writes base Entries only; it does not
mean "all Namespaces." Existing files make export fail unless you pass
`--overwrite`. Use `--dry-run` to preview planned writes without creating the
output directory or files.

### 3. Carry namespaced Branch Memory to another branch

```text
brmem copy \
  --namespace notes \
  --from-branch master \
  --to-branch feature/table-filtering \
  --key-glob 'dashboard-revamp/*'
```

`copy` is how Branch Memory moves forward between branches. With `--key-glob`,
it copies only matching Entry Keys and preserves unrelated destination Entries.
Without `--key-glob`, it copies the whole Namespace.

If the destination already has matching Entries, `copy` aborts instead of
merging silently. Pass `--dry-run` to preview the plan, or `--overwrite` when
replacing destination Entries is intentional.

### 4. Delete stale Branch Memory when it is no longer useful

```text
brmem delete plan.md
```

Deleting Branch Memory removes that Entry from the branch. It does not touch
working-tree files or source commits.

## Prompt Plugins

A prompt plugin lets a repo customize one narrow part of a skill's behavior
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

- Branch Memory is branch-scoped. Pass `--branch` when automation should not
  depend on the current checkout.
- Use Namespaces for tool-owned records. Leave base Entries for ad-hoc scratch
  state.
- Keep Entries small and textual. `brmem` is not a place for generated assets,
  secrets, or large datasets.
- `copy` is exact and conflict-aware. Use `--dry-run`, `--key-glob`, and
  `--overwrite` deliberately.
- `export` defaults to base entries only. Pass `--namespace` deliberately and
  use `--overwrite` only when replacing files is intended.
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

`brmem` applies the same idea to branch-scoped agent state: Branch Memory lives
in refs (for example, `refs/brmem/ns/<namespace>/<encoded-branch>:<key>`) so it
is durable, inspectable, and pushable, but stays out of commits, PRs, and the
working tree.

## See Also

- [`AGENTS.md`](./AGENTS.md): contributor rules for this package.
- `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch`: Pi
  extension commands for saving a plan, creating a planned branch, attaching the
  plan, and starting implementation.
- [`skills/brmem-plan-impl`](../../skills/brmem-plan-impl/): a helper that loads
  a canonical plan from `brmem-plans` on the current branch and starts
  implementation.
