---
name: brmem
description: "Use when a task needs branch-scoped durable memory with the `brmem` CLI: storing, reading, listing, checking, deleting, or copying text context tied to a git branch, or resolving `.brmem/prompts/...` prompt plugins. Use whenever the user mentions brmem, Branch Memory, stashing branch-scoped notes/context, carrying scratch state across sessions, or asks how an agent should call `brmem`."
allowed-tools:
  - "Bash(brmem *)"
  - "Bash(git *)"
  - "Read"
---

<!-- PUBLIC SKILL: Do not reference asdl-internal module paths or class names in this file. Describe CLI operations, not implementation. -->

# brmem

Use `brmem` as the Branch Memory System for agents: small UTF-8 Entries that
stay attached to a Git branch without becoming working-tree files, commits, PR
comments, or issues.

This skill is a CLI reference. Prefer higher-level skills when they match the
whole workflow. Use the `branch-context` skill family for branch-context saved
or attached plans; do not store those as generic `brmem` `plans/` keys. Use this
skill directly when you need to inspect, write, copy, delete, or explain Branch
Memory.

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

Commands default to the current branch unless you pass `--branch`. For read-only listing across branches, pass `brmem list --all-branches`.

`brmem` is durable and inspectable, not secret. Do not store credentials,
private tokens, binary assets, generated build output, or large datasets.

## Install and runtime

Public `brmem` invocation should come from an asdl checkout with:

```text
just install-brmem
# or
just install-tools
```

The installed command is a TypeScript-backed source shim. It uses the enclosing
asdl checkout when run inside one, and otherwise uses the checkout that installed
it. The shim requires the workspace Node version and `ts/node_modules`; the
install recipes run `just ts-install`, and a broken checkout can be repaired by
running `just ts-install` there.

If `brmem` is missing, install the shim instead of invoking the old uv-based
Python fallback.

## Command chooser

| Goal                                          | Command                                                         | Writes? |
| --------------------------------------------- | --------------------------------------------------------------- | ------- |
| Store or update text                          | `brmem put <key> --file <path>`                                 | Yes     |
| Print one Entry's content                     | `brmem get <key>`                                               | No      |
| Probe one Entry and get Entry Locator/size    | `brmem check <key>`                                             | No      |
| List Entries on one branch or all branches    | `brmem list [--all-branches]`                                   | No      |
| Export Entries to files                       | `brmem export [--output-dir <dir>]`                             | Files   |
| Remove one Entry                              | `brmem delete <key>`                                            | Yes     |
| Copy Base Entries between branches            | `brmem copy --base --from-branch <a> --to-branch <b>`           | Yes     |
| Copy named Namespace Entries between branches | `brmem copy --namespace <ns> --from-branch <a> --to-branch <b>` | Yes     |
| Resolve a repo/global prompt plugin           | `brmem exec resolve-prompt <name>`                              | No      |

Add `--namespace <ns>` to `put`, `get`, `check`, `delete`, `list`, or `export`
for named Namespace Entries. Omit it for Base Namespace Entries. The canonical
Base Namespace name is `base`; where `--namespace base` is accepted, it selects
Base Namespace Entries. For `copy`, choose exactly one scope: `--base` or
`--namespace <ns>`.

## Operating rules

1. **Be explicit about branches in automation.** If the task names a branch, pass
   `--branch <branch>` (or `--from-branch` / `--to-branch` for `copy`) instead
   of relying on the checkout. If no branch is provided, confirm the current Git
   branch before mutating memory.
2. **Choose the Namespace deliberately.** Use the Base Namespace for ad-hoc
   scratch notes. Use named Namespaces for workflow-owned state so unrelated
   workflows do not collide. Namespaces are single path segments: no `/`.
3. **Choose the copy scope explicitly.** Use `brmem copy --base ...` for the
   Base Namespace, or `brmem copy --namespace <ns> ...` for a named Namespace.
   `brmem copy --namespace base ...` targets the Base Namespace too. Do not
   omit the scope and do not pass both flags.
4. **Use simple Entry Keys.** Prefer POSIX-like relative paths such as
   `notes/add-cache.md` or `session/summary.md`. Avoid spaces and punctuation.
   Entry Keys cannot be empty, start/end with `/`, contain `//`, contain `:`,
   contain a `..` segment, contain glob/ref metacharacters, or end a segment
   with `.lock`.
5. **Treat `put` as an overwrite.** If overwriting is not explicitly desired,
   preflight with `brmem check <key> ...`. `check` exits `0` for both present
   and absent Entries; inspect the human `Present:` line or JSON
   `data.present`. Exit code `2` means an invalid request or command failure.
6. **Keep Entries textual and small.** `put` accepts UTF-8 text, rejects likely
   binary content, and caps Entries at 1 MiB unless `--force` is supplied. Use
   `--force` only when the user explicitly accepts the storage cost/risk.
7. **Prefer JSON for machine parsing.** Add `--format json` when you need stable
   fields from `put`, `list`, `check`, `export`, `copy`, `delete`, or
   `resolve-prompt`. For `get`, the human output is intentionally just the
   stored content; use that when feeding the text directly into your workflow.
8. **Report mutations.** After `put`, `copy`, or `delete`, tell the user the
   branch, Namespace/base, Entry Key(s), Entry Locator(s), and commit(s)
   printed by the CLI.

## Store an Entry

1. Pick the Branch, Namespace/base area, and Entry Key.
2. If preserving existing content matters, run `check` first:

```text
brmem check notes/add-cache.md --branch feature/add-cache
brmem check notes/add-cache.md --namespace scratch --branch feature/add-cache
```

3. Store bytes from a file (preferred for agents):

```text
brmem put notes/add-cache.md --branch feature/add-cache --file /tmp/note.md
brmem put notes/add-cache.md --namespace scratch --branch feature/add-cache --file /tmp/note.md
```

Agents should prefer `--file <path>` for prepared content. Use `--stdin` for
piped content. Add `--format json` when the caller needs a machine-readable
success or failure envelope.

## Read Branch Memory

List first when you do not already know the Entry Key:

```text
brmem list --branch feature/add-cache --format json
brmem list --base --branch feature/add-cache
brmem list --namespace scratch --branch feature/add-cache --format json
brmem list --namespace scratch --all-branches --format json
```

Then read Entries by Entry Key:

```text
brmem get notes/add-cache.md --branch feature/add-cache
brmem get notes/add-cache.md --namespace scratch --branch feature/add-cache
```

`get` prints only content in human mode. If a task asks you to load all Branch
Memory for a branch, list with JSON and then `get` every returned Entry,
preserving content verbatim in your working context before summarizing it for
the user.

Use `--at <treeish-or-commit>` with `get` or `check` only when you need a
historical Branch Memory version rather than the current Branch Memory.

## Export Branch Memory to files

Use `export` when a workflow needs Branch Memory materialized as ordinary UTF-8
files in a chosen directory:

```text
brmem export --branch feature/add-cache
brmem export --branch feature/add-cache --output-dir /tmp/brmem-export
brmem export --namespace scratch --branch feature/add-cache --output-dir /tmp/scratch-export
```

Important details:

- Omitting `--output-dir` writes to a fresh temp directory whose path has a
  unique random suffix (e.g. `$TMPDIR/brmem-export-<hash>`); the directory
  outlives the process and the chosen path is printed in the command output.
- Omitting `--namespace` exports **base Entries only**. It does not mean "all
  Namespaces."
- Each key becomes a relative path under `--output-dir`; for example,
  `notes/session.md` writes `<output-dir>/notes/session.md`.
- Export fails before writing if no Entries match, the output directory is not a
  directory, a target already exists, or a target path is unsafe. Pass
  `--overwrite` only when replacing existing files is intentional.
- Use `--dry-run` to see planned writes without creating directories or files.
- Add `--format json` when another tool needs the planned/exported paths and
  sizes.

## Check or inspect an Entry

Use `check` to test existence or get the Entry Locator without printing the full
text:

```text
brmem check notes/add-cache.md --branch feature/add-cache --format json
brmem check notes/add-cache.md --namespace scratch --branch feature/add-cache
```

Interpret results carefully:

- `0` with `Present: yes` or JSON `data.present: true`: Entry exists; metadata
  is available.
- `0` with `Present: no` or JSON `data.present: false`: Entry is absent; this
  is a normal probe result, useful before `put`.
- `2`: invalid Namespace/Entry Key/Branch, detached HEAD when branch was
  omitted, or another command failure.

## Copy Branch Memory between branches

Use `copy` when Branch Memory should travel from one branch to another. Choose
exactly one scope.

Copy the Base Namespace:

```text
brmem copy \
  --base \
  --from-branch main \
  --to-branch feature/table-filter
```

Copy a named Namespace:

```text
brmem copy \
  --namespace notes \
  --from-branch main \
  --to-branch feature/table-filter
```

Preview first when replacement risk matters:

```text
brmem copy \
  --namespace notes \
  --from-branch main \
  --to-branch feature/table-filter \
  --dry-run \
  --format json
```

Important details:

- Without `--key-glob`, the whole chosen Namespace is copied. If `--overwrite`
  is used, the destination Branch Memory for that Namespace is replaced.
- With `--key-glob 'slug/*'`, only matching Entry Keys are copied and unrelated
  destination Entries are preserved. In this CLI, `*` matches `/`, so `slug/*`
  covers nested Entry Keys too.
- Existing matching destination Entries make `copy` abort unless `--overwrite`
  is supplied. An empty destination Snapshot is not a conflict. Do not add
  `--overwrite` unless replacement is intentional.

## Delete an Entry

Only delete one explicit Entry the user or workflow has identified:

```text
brmem check stale-note.md --branch feature/add-cache
brmem delete stale-note.md --branch feature/add-cache
brmem delete stale-note.md --namespace scratch --branch feature/add-cache
```

After deletion, report the Branch, Namespace/base, Entry Key, Entry Locator,
and commit.

## Skill-facing prompt plugin resolution

Some skills let a repo customize one narrow prompt file. This is for skills and
automation, not a normal user-facing Branch Memory operation. Resolve prompts
with:

```text
brmem exec resolve-prompt <prompt-name> --format json
```

The JSON result gives `data.path` and `data.tier` (`project` or `global`). Read
that file verbatim and follow the owning skill's rules for what the plugin is
allowed to decide. If resolution exits `2`, surface the CLI message and abort;
do not invent an inline fallback or create the prompt file unless the user asked
you to configure prompts.

## Good final summaries

For read-only work, summarize what you inspected and which Entries were loaded.
For mutations, include:

```text
Branch: <branch>
Entry: <namespace-or-base>/<key>
Entry Locator: <locator printed by brmem>
Commit: <commit printed by brmem>
```

If an operation aborted because an Entry already exists, an Entry Key is
invalid, the branch is detached, or `copy` found conflicts, say exactly which
CLI command was run and quote the relevant error message.
