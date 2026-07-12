---
name: brmem
description: "Branch-scoped durable memory via the `brmem` CLI: store, read, list, check, delete, or copy text context tied to a git branch, or resolve `.ns/prompts/...` or XDG global prompt plugins. Use when the user mentions brmem, Branch Memory, stashing branch-scoped notes/context, carrying scratch state across sessions, or how an agent should call `brmem`."
allowed-tools:
  - "Bash(brmem *)"
  - "Bash(git *)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference ns-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# brmem

`brmem` is the Branch Memory System for agents: small UTF-8 Entries that stay
attached to a Git branch without becoming working-tree files, commits, PR
comments, or issues.

This skill is a CLI reference. Prefer higher-level skills when they match the
whole workflow — in particular, use the `branch-context` skill family for
branch-context saved or attached plans; do not store those as generic `brmem`
`plans/` keys. Use this skill directly when you need to inspect, write, copy,
delete, or explain Branch Memory.

## Mental model

- **Branch Memory**: Entries attached to one branch, either in the Base
  Namespace or in a named Namespace.
- **Entry**: a small text blob stored under an Entry Key such as `note.md` or
  `notes/table-filter.md`.
- **Entry Key**: the path-like name for an Entry within Branch Memory.
- **Namespace**: a branch-scoped Entry bucket. The Base Namespace has canonical
  name `base` and is reserved by `brmem` for ad-hoc Entries when `--namespace`
  is omitted. Named Namespaces are workflow-owned buckets such as `notes`.
- **Entry Locator**: the copy-pastable `git show` locator printed by commands,
  shaped like `<snapshot-ref>:<entry-key>`.

`brmem` is durable and inspectable, not secret. Do not store credentials,
private tokens, binary assets, generated build output, or large datasets.

## Install and runtime

If `brmem` is missing, run `just install-brmem` (or `just install-tools`) from
an ns checkout; repair a broken checkout with `just ts-install`.

## Choosing a command

| Goal                                          | Command                                                         | Writes? |
| --------------------------------------------- | --------------------------------------------------------------- | ------- |
| Store or update text                          | `brmem put <key> --file <path>`                                 | Yes     |
| Print one Entry's content                     | `brmem get <key>`                                               | No      |
| Probe one Entry and get Entry Locator/size    | `brmem check <key>`                                             | No      |
| List Entries on one branch or all branches    | `brmem list [--all-branches]`                                   | No      |
| Export Entries to files                       | `brmem export [--output-dir <dir>]`                             | Files   |
| Remove one Entry                              | `brmem delete <key>`                                            | Yes     |
| Preview stale Snapshots for missing branches  | `brmem gc`                                                      | No      |
| Delete stale Snapshots for missing branches   | `brmem gc --yes`                                                | Yes     |
| Copy Base Entries between branches            | `brmem copy --base --from-branch <a> --to-branch <b>`           | Yes     |
| Copy named Namespace Entries between branches | `brmem copy --namespace <ns> --from-branch <a> --to-branch <b>` | Yes     |
| Resolve a repo/global prompt plugin           | `brmem exec resolve-prompt <name>`                              | No      |

## Cross-command rules

- **Branches.** Commands default to the current branch. If the task names a
  branch, pass `--branch <branch>` (or `--from-branch` / `--to-branch` for
  `copy`) instead of relying on the checkout; if no branch is provided, confirm
  the current Git branch before mutating memory. For read-only listing across
  branches, pass `brmem list --all-branches`.
- **Namespaces.** Add `--namespace <ns>` to `put`, `get`, `check`, `delete`,
  `list`, or `export` for named Namespace Entries; omit it for Base Namespace
  Entries. Where `--namespace base` is accepted, it selects Base Namespace
  Entries. Choose deliberately: the Base Namespace for ad-hoc scratch notes,
  named Namespaces for workflow-owned state so unrelated workflows do not
  collide. Namespaces are single path segments: no `/`.
- **Entry Keys.** Prefer POSIX-like relative paths such as `notes/add-cache.md`
  or `session/summary.md`. Avoid spaces and punctuation. Entry Keys cannot be
  empty, start/end with `/`, contain `//`, contain `:`, contain a `..` segment,
  contain glob/ref metacharacters, or end a segment with `.lock`.
- **Output.** Add `--format json` when you need stable fields from `put`,
  `list`, `check`, `export`, `copy`, `delete`, `gc`, or `resolve-prompt`. For
  `get`, the human output is intentionally just the stored content; use that
  when feeding the text directly into your workflow.

## put — store an Entry

`put` is an overwrite. If overwriting is not explicitly desired, preflight
with `brmem check <key> ...` (see `check` below for result interpretation).

Agents should prefer `--file <path>` for prepared content; use `--stdin` for
piped content.

```text
brmem put notes/add-cache.md --branch feature/add-cache --file /tmp/note.md
brmem put notes/add-cache.md --namespace scratch --branch feature/add-cache --file /tmp/note.md
```

`put` accepts UTF-8 text, rejects likely binary content, and caps Entries at
1 MiB unless `--force` is supplied. Use `--force` only when the user
explicitly accepts the storage cost/risk.

## list and get — read Branch Memory

List first when you do not already know the Entry Key, then read Entries by
Entry Key:

```text
brmem list --branch feature/add-cache --format json
brmem list --base --branch feature/add-cache
brmem list --namespace scratch --branch feature/add-cache --format json
brmem list --namespace scratch --all-branches --format json

brmem get notes/add-cache.md --branch feature/add-cache
brmem get notes/add-cache.md --namespace scratch --branch feature/add-cache
```

`get` prints only content in human mode. If a task asks you to load all Branch
Memory for a branch, list with JSON and then `get` every returned Entry,
preserving content verbatim in your working context before summarizing it for
the user.

Use `--at <treeish-or-commit>` with `get` or `check` only when you need a
historical Branch Memory version rather than the current Branch Memory.

## check — probe an Entry

Use `check` to test existence or get the Entry Locator without printing the
full text:

```text
brmem check notes/add-cache.md --branch feature/add-cache --format json
brmem check notes/add-cache.md --namespace scratch --branch feature/add-cache
```

Interpret results carefully — `check` exits `0` for both present and absent
Entries:

- `0` with `Present: yes` or JSON `data.present: true`: Entry exists; metadata
  is available.
- `0` with `Present: no` or JSON `data.present: false`: Entry is absent; this
  is a normal probe result, useful before `put`.
- `2`: invalid Namespace/Entry Key/Branch, detached HEAD when branch was
  omitted, or another command failure.

## export — materialize Entries as files

Use `export` when a workflow needs Branch Memory materialized as ordinary
UTF-8 files in a chosen directory:

```text
brmem export --branch feature/add-cache
brmem export --branch feature/add-cache --output-dir /tmp/brmem-export
brmem export --namespace scratch --branch feature/add-cache --output-dir /tmp/scratch-export
```

- Omitting `--output-dir` writes to a fresh temp directory whose path has a
  unique random suffix (e.g. `$TMPDIR/brmem-export-<hash>`); the directory
  outlives the process and the chosen path is printed in the command output.
- Omitting `--namespace` exports **base Entries only**. It does not mean "all
  Namespaces."
- Each key becomes a relative path under `--output-dir`; for example,
  `notes/session.md` writes `<output-dir>/notes/session.md`.
- Export returns a normal no-match result before writing if no Entries match.
  It fails for output directories that are not directories, existing targets,
  or unsafe target paths. Pass `--overwrite` only when replacing existing
  files is intentional.
- Use `--dry-run` to see planned writes without creating directories or files.
  Add `--format json` when another tool needs the planned/exported paths and
  sizes.

## copy — move Branch Memory between branches

Use `copy` when Branch Memory should travel from one branch to another. Choose
exactly one scope: `--base` for the Base Namespace, or `--namespace <ns>` for
a named Namespace (`--namespace base` targets the Base Namespace too). Do not
omit the scope and do not pass both flags.

```text
brmem copy --base --from-branch main --to-branch feature/table-filter
brmem copy --namespace notes --from-branch main --to-branch feature/table-filter
brmem copy --namespace notes --from-branch main --to-branch feature/table-filter --dry-run --format json
```

- Preview with `--dry-run` first when replacement risk matters.
- Without `--key-glob`, the whole chosen Namespace is copied. If `--overwrite`
  is used, the destination Branch Memory for that Namespace is replaced.
- With `--key-glob 'slug/*'`, only matching Entry Keys are copied and
  unrelated destination Entries are preserved. In this CLI, `*` matches `/`,
  so `slug/*` covers nested Entry Keys too.
- Existing matching destination Entries make `copy` abort unless `--overwrite`
  is supplied. An empty destination Snapshot is not a conflict. Do not add
  `--overwrite` unless replacement is intentional.

## gc — clean up stale Snapshots

Use `gc` only for explicit cleanup of Branch Memory for branches that no
longer exist as local `refs/heads/*` branches; do not run it as part of a
higher-level workflow unless the user asked for cleanup. Higher-level
workflows should diagnose stale collisions and point here, not auto-run
cleanup. `gc` scans Snapshots, not individual Entries, and remote branches do
not count as live.

The default is a dry-run; no refs are deleted without `--yes`. Inspect the
dry-run output before passing `--yes`. `--base` and `--namespace <ns>`
restrict the scan and are mutually exclusive. Deleting a Snapshot Ref removes
all Entries in that Namespace for that branch.

```text
brmem gc
brmem gc --namespace branch-context --format json
brmem gc --base

brmem gc --yes
brmem gc --namespace branch-context --yes
```

## delete — remove an Entry

Only delete one explicit Entry the user or workflow has identified:

```text
brmem check stale-note.md --branch feature/add-cache
brmem delete stale-note.md --branch feature/add-cache
brmem delete stale-note.md --namespace scratch --branch feature/add-cache
```

## exec resolve-prompt — skill-facing prompt plugins

Some skills let a repo customize one narrow prompt file. This is for skills
and automation, not a normal user-facing Branch Memory operation. Resolve
prompts with:

```text
brmem exec resolve-prompt <prompt-name> --format json
```

Resolution checks the current repository's `.ns/prompts/<prompt-name>.md`
first, then `$XDG_CONFIG_HOME/ns/brmem/prompts/<prompt-name>.md` (default
`$HOME/.config/ns/brmem/prompts/<prompt-name>.md`). The JSON result gives
`data.path` and `data.tier` (`project` or `global`). Read that file verbatim
and follow the owning skill's rules for what the plugin is allowed to decide.
If resolution exits `2`, surface the CLI message and abort; do not invent an
inline fallback or create the prompt file unless the user asked you to
configure prompts.

## Report what you did

For read-only work, summarize what you inspected and which Entries were
loaded. After a mutation (`put`, `copy`, `delete`, or `gc --yes`), tell the
user the branch, Namespace/base, Entry Key(s) or Snapshot Ref(s), Entry
Locator, and commit(s) when the command prints them:

```text
Branch: <branch>
Entry: <namespace-or-base>/<key>
Entry Locator: <locator printed by brmem>
Commit: <commit printed by brmem>
```

If an operation aborted because an Entry already exists, an Entry Key is
invalid, the branch is detached, or `copy` found conflicts, say exactly which
CLI command was run and quote the relevant error message.
